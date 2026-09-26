import Foundation

/// The Screen Time rules as pure functions of `(state, now)`.
///
/// Nothing here touches the system, so every decision is unit-tested on a Mac,
/// and the app plus all extensions share one definition of the behaviour.
public struct ScreenTimePolicy: Sendable {
  /// How long "Open anyway" unlocks flagged apps before the session lock returns.
  public var gracePeriod: TimeInterval
  /// Re-opening within this window after a grace period ends continues the same
  /// visit, so one long scroll counts as one distraction (matching Android).
  public var sameVisitWindow: TimeInterval
  /// A session paused for longer than this is abandoned (for example, the app was
  /// killed mid-pause), so it can't keep flagged apps uneditable forever.
  public var maximumPause: TimeInterval

  public init(
    gracePeriod: TimeInterval = 2 * 60,
    sameVisitWindow: TimeInterval = 60,
    maximumPause: TimeInterval = 6 * 60 * 60
  ) {
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
  public func activeShields(in state: ScreenTimeState) -> Set<ShieldLayer> {
    var layers: Set<ShieldLayer> = []
    if let session = state.session, session.pausedAt == nil, session.graceUntil == nil {
      layers.insert(.session)
    }
    if state.lockdown != nil {
      layers.insert(.lockdown)
    }
    return layers
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

  /// Flagged apps can't be changed while they're locked, otherwise removing an
  /// app from the list would be a way out of a session or lockdown.
  public func canEditFlaggedApps(in state: ScreenTimeState) -> Bool {
    state.session == nil && state.lockdown == nil
  }

  // MARK: - Session transitions

  public func startingSession(
    id: Int,
    modeName: String,
    endsAt: Date,
    in state: ScreenTimeState,
    at now: Date
  ) -> ScreenTimeState {
    var result = settled(state, at: now)
    result.session = FocusSession(id: id, modeName: modeName, endsAt: endsAt)
    // Anything left from a session the app never finished importing is stale.
    result.pendingDistractions.removeAll { $0.sessionId != id }
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

  // MARK: - Shield interactions

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
      session.pausedAt == nil
    else {
      return (result, .refused)
    }

    let continuesVisit = session.lastGraceEndedAt.map {
      now.timeIntervalSince($0) <= sameVisitWindow
    } ?? false

    if !continuesVisit {
      result.pendingDistractions.append(Distraction(sessionId: session.id, occurredAt: now))
    }
    session.graceUntil = min(now.addingTimeInterval(gracePeriod), session.endsAt)
    result.session = session
    return (result, .unlocked(countedAsDistraction: !continuesVisit))
  }

  // MARK: - Lockdown

  /// Starts or extends the post-session lockdown. Never shortens an active one.
  public func lockingDown(
    until: Date,
    in state: ScreenTimeState,
    at now: Date
  ) -> ScreenTimeState {
    var result = settled(state, at: now)
    guard until > now else { return result }
    let current = result.lockdown?.until ?? .distantPast
    result.lockdown = Lockdown(until: max(current, until))
    return result
  }
}
