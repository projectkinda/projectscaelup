import Foundation

/// The Screen Time rules as pure functions of `(state, now)`.
///
/// Nothing here touches the system, so every decision is unit-tested on a Mac,
/// and the app plus all extensions share one definition of the behaviour.
public struct ScreenTimePolicy: Sendable {
  // Silent tracking (default).
  /// Use of one flagged app past this, within a session, counts as a distraction.
  /// Android uses 30 s; iOS reports sub-minute thresholds unreliably.
  public var usageThreshold: TimeInterval
  /// Reports this soon after monitoring starts are ignored: iOS 26 has been seen
  /// firing threshold events immediately instead of after real use.
  public var usageSettlingTime: TimeInterval

  // Strict mode.
  /// How long "Open anyway" unlocks flagged apps before the session lock returns.
  public var gracePeriod: TimeInterval
  /// Re-opening within this window after a grace period ends continues the same
  /// visit, so one long scroll counts as one distraction (matching Android).
  public var sameVisitWindow: TimeInterval

  /// A session paused for longer than this is abandoned (for example, the app was
  /// killed mid-pause), so it can't keep flagged apps uneditable forever.
  public var maximumPause: TimeInterval

  public init(
    usageThreshold: TimeInterval = 60,
    usageSettlingTime: TimeInterval = 10,
    gracePeriod: TimeInterval = 2 * 60,
    sameVisitWindow: TimeInterval = 60,
    maximumPause: TimeInterval = 6 * 60 * 60
  ) {
    self.usageThreshold = usageThreshold
    self.usageSettlingTime = usageSettlingTime
    self.gracePeriod = gracePeriod
    self.sameVisitWindow = sameVisitWindow
    self.maximumPause = maximumPause
  }

  // MARK: - Settling

  /// Applies every transition that is due at `now`. Idempotent.
  public func settled(_ state: ScreenTimeState, at now: Date) -> ScreenTimeState {
    var result = state

    if var session = result.session {
      if let pausedAt = session.pausedAt {
        result.session = now.timeIntervalSince(pausedAt) > maximumPause ? nil : session
      } else if now >= session.endsAt {
        result.session = nil
      } else {
        if let graceUntil = session.graceUntil, now >= graceUntil {
          session.graceUntil = nil
          session.lastGraceEndedAt = graceUntil
        }
        result.session = session
      }
    }

    if let lockdown = result.lockdown, now >= lockdown.until {
      result.lockdown = nil
    }

    return result
  }

  /// The shields that should be up for a settled state.
  public func shieldPlan(in state: ScreenTimeState) -> ShieldPlan {
    var plan = ShieldPlan.none
    if let session = state.session, session.strict, session.pausedAt == nil, session.graceUntil == nil {
      plan.session = true
    }
    plan.lockdown = state.lockdown?.apps
    return plan
  }

  /// What to monitor for silent tracking, if anything.
  public func usagePlan(in state: ScreenTimeState) -> UsagePlan? {
    guard let session = state.session, !session.strict, session.pausedAt == nil else { return nil }
    return UsagePlan(
      sessionId: session.id,
      segment: session.segment,
      start: session.segmentStartedAt,
      end: max(session.endsAt, session.segmentStartedAt.addingTimeInterval(WakePlanner.minimumInterval)),
      threshold: usageThreshold,
      excludedAppKeys: Set(session.countedAppKeys)
    )
  }

  /// The next moment the shields need to change, if any.
  public func nextTransition(in state: ScreenTimeState, after now: Date) -> Date? {
    var candidates: [Date] = []
    if let session = state.session {
      if let pausedAt = session.pausedAt {
        candidates.append(pausedAt.addingTimeInterval(maximumPause))
      } else {
        candidates.append(session.endsAt)
        if let graceUntil = session.graceUntil {
          candidates.append(graceUntil)
        }
      }
    }
    if let lockdown = state.lockdown {
      candidates.append(lockdown.until)
    }
    return candidates.filter { $0 > now }.min()
  }

  /// Flagged apps can't be changed during a session or lockdown, otherwise
  /// removing an app from the list would be a way out of either.
  public func canEditFlaggedApps(in state: ScreenTimeState) -> Bool {
    state.session == nil && state.lockdown == nil
  }

  // MARK: - Session transitions

  public func startingSession(
    id: Int,
    modeName: String,
    endsAt: Date,
    strict: Bool,
    in state: ScreenTimeState,
    at now: Date
  ) -> ScreenTimeState {
    var result = settled(state, at: now)
    // Anything left from a session the app never finished importing is stale.
    result.pendingDistractions.removeAll { $0.sessionId != id }
    var session = FocusSession(id: id, modeName: modeName, endsAt: endsAt, strict: strict, startedAt: now)
    // Restarting the same session (for example "+5 min" after the alarm) keeps
    // what it already counted, so an app isn't counted twice.
    session.countedAppKeys = result.pendingDistractions.compactMap(\.appKey)
    result.session = session
    return result
  }

  public func pausingSession(_ state: ScreenTimeState, at now: Date) -> ScreenTimeState {
    var result = settled(state, at: now)
    guard var session = result.session, session.pausedAt == nil else { return result }
    session.pausedAt = now
    session.graceUntil = nil
    session.lastGraceEndedAt = nil
    result.session = session
    return result
  }

  public func resumingSession(
    endsAt: Date,
    in state: ScreenTimeState,
    at now: Date
  ) -> ScreenTimeState {
    var result = settled(state, at: now)
    guard var session = result.session, session.pausedAt != nil else { return result }
    session.pausedAt = nil
    session.endsAt = endsAt
    session.segment += 1
    session.segmentStartedAt = now
    result.session = session
    return settled(result, at: now)
  }

  /// Ends the session and hands back its distractions for import.
  public func endingSession(
    id: Int,
    in state: ScreenTimeState
  ) -> (state: ScreenTimeState, distractions: [Distraction]) {
    var result = state
    if result.session?.id == id {
      result.session = nil
    }
    let distractions = result.pendingDistractions.filter { $0.sessionId == id }
    result.pendingDistractions.removeAll { $0.sessionId == id }
    return (result, distractions)
  }

  // MARK: - Silent tracking

  /// Records that a flagged app passed the usage threshold. Counts each app
  /// once per session, and ignores reports that can't be real use.
  public func recordingUsage(
    appKey: String,
    in state: ScreenTimeState,
    at now: Date
  ) -> (state: ScreenTimeState, counted: Bool) {
    var result = settled(state, at: now)
    guard var session = result.session,
      !session.strict,
      session.pausedAt == nil,
      now.timeIntervalSince(session.segmentStartedAt) >= usageSettlingTime,
      !session.countedAppKeys.contains(appKey)
    else {
      return (result, false)
    }
    session.countedAppKeys.append(appKey)
    result.session = session
    result.pendingDistractions.append(Distraction(sessionId: session.id, occurredAt: now, appKey: appKey))
    return (result, true)
  }

  // MARK: - Strict mode

  public enum OpenAnywayOutcome: Equatable, Sendable {
    /// Flagged apps are unlocked for the grace period.
    case unlocked(countedAsDistraction: Bool)
    /// Nothing to unlock, or a lockdown is active (lockdowns have no way out).
    case refused
  }

  public func openingAnyway(
    _ state: ScreenTimeState,
    at now: Date
  ) -> (state: ScreenTimeState, outcome: OpenAnywayOutcome) {
    var result = settled(state, at: now)
    guard result.lockdown == nil,
      var session = result.session,
      session.strict,
      session.pausedAt == nil
    else {
      return (result, .refused)
    }

    let continuesVisit = session.lastGraceEndedAt.map {
      now.timeIntervalSince($0) <= sameVisitWindow
    } ?? false

    if !continuesVisit {
      result.pendingDistractions.append(Distraction(sessionId: session.id, occurredAt: now, appKey: nil))
    }
    session.graceUntil = min(now.addingTimeInterval(gracePeriod), session.endsAt)
    result.session = session
    return (result, .unlocked(countedAsDistraction: !continuesVisit))
  }

  // MARK: - Lockdown

  /// Starts or extends the post-session lockdown for `apps`. Never shortens an
  /// active one, and an extension covers both the old and the new apps.
  public func lockingDown(
    until: Date,
    apps: AppSelection,
    in state: ScreenTimeState,
    at now: Date
  ) -> ScreenTimeState {
    var result = settled(state, at: now)
    guard until > now else { return result }
    if let current = result.lockdown {
      result.lockdown = Lockdown(until: max(current.until, until), apps: current.apps.union(apps))
    } else {
      result.lockdown = Lockdown(until: until, apps: apps)
    }
    return result
  }
}
