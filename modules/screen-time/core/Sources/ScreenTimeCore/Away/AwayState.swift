import Foundation

/// A real use of a flagged app (about a minute or more), seen outside a session.
public struct AwayUse: Codable, Equatable, Sendable {
  public let appKey: String
  public let usedAt: Date

  public init(appKey: String, usedAt: Date) {
    self.appKey = appKey
    self.usedAt = usedAt
  }
}

/// A stretch when tracking wasn't provably alive, so no "away" can be claimed for it.
public struct AwayGap: Codable, Equatable, Sendable {
  public let startedAt: Date
  public let endedAt: Date

  public init(startedAt: Date, endedAt: Date) {
    self.startedAt = startedAt
    self.endedAt = endedAt
  }
}

/// Everything "away time" needs the app and its extensions to agree on, kept in
/// the App Group. The extension appends; the app drains it into SQLite.
///
/// Away time is opt-in, so nothing here is recorded unless `enabled`.
public struct AwayState: Codable, Equatable, Sendable {
  public var enabled: Bool
  /// Real uses waiting for the app to import them.
  public var uses: [AwayUse]
  /// Gaps waiting for the app to import them.
  public var gaps: [AwayGap]
  /// The last moment tracking was confirmed armed (see `AwayPolicy`).
  public var lastHeartbeat: Date?
  /// When tracking stopped being armed and hasn't recovered yet; the gap is
  /// closed (and reported) by the next heartbeat.
  public var openGapStart: Date?
  public var lastFailure: Date?
  /// When ambient monitoring was last (re)started, so a threshold report right
  /// after is recognised as too early to be real use.
  public var armedAt: Date?

  public init(
    enabled: Bool = false,
    uses: [AwayUse] = [],
    gaps: [AwayGap] = [],
    lastHeartbeat: Date? = nil,
    openGapStart: Date? = nil,
    lastFailure: Date? = nil,
    armedAt: Date? = nil
  ) {
    self.enabled = enabled
    self.uses = uses
    self.gaps = gaps
    self.lastHeartbeat = lastHeartbeat
    self.openGapStart = openGapStart
    self.lastFailure = lastFailure
    self.armedAt = armedAt
  }
}

/// The away-time rules as pure functions of `(state, now)`, like `ScreenTimePolicy`.
///
/// Away time is how long since the user last really used a flagged app. It is
/// only honest for periods when tracking was *armed*, so every heartbeat means
/// "the ambient activity was confirmed running", never just "some code ran".
public struct AwayPolicy: Sendable {
  /// Longer than this between heartbeats is a gap. Keepers are 6 hours apart,
  /// plus slack (see `docs/away-time-shared-layer.md`).
  public var staleThreshold: TimeInterval
  /// Wakes closer together than this don't each write a heartbeat.
  public var heartbeatSpacing: TimeInterval
  /// Bound on the unimported buffers, in case the app isn't opened for a long time.
  public var maximumBuffered: Int
  /// Reports this soon after monitoring (re)starts are ignored: iOS 26 has been
  /// seen firing threshold events immediately instead of after real use.
  public var settlingTime: TimeInterval

  public init(
    staleThreshold: TimeInterval = 6.5 * 60 * 60,
    heartbeatSpacing: TimeInterval = 5 * 60,
    maximumBuffered: Int = 500,
    settlingTime: TimeInterval = 10
  ) {
    self.staleThreshold = staleThreshold
    self.heartbeatSpacing = heartbeatSpacing
    self.maximumBuffered = maximumBuffered
    self.settlingTime = settlingTime
  }

  /// Ambient tracking runs when the user opted in and no session is running.
  /// A session (even a paused one) owns usage tracking, so the same use isn't
  /// recorded twice.
  public func shouldRun(_ state: AwayState, sessionActive: Bool) -> Bool {
    state.enabled && !sessionActive
  }

  // MARK: - Opt in and out

  public func enabling(_ state: AwayState) -> AwayState {
    var result = state
    result.enabled = true
    return result
  }

  /// Off means off: nothing about past use survives.
  public func disabling(_ state: AwayState) -> AwayState {
    AwayState()
  }

  // MARK: - Recording

  /// A flagged app passed the usage threshold outside a session.
  public func recordingUse(
    appKey: String,
    in state: AwayState,
    at now: Date,
    sessionActive: Bool
  ) -> AwayState {
    guard state.enabled, !sessionActive else { return state }
    if let armedAt = state.armedAt, now.timeIntervalSince(armedAt) < settlingTime {
      return state
    }
    var result = state
    result.uses.append(AwayUse(appKey: appKey, usedAt: now))
    if result.uses.count > maximumBuffered {
      result.uses.removeFirst(result.uses.count - maximumBuffered)
    }
    return result
  }

  /// Tracking was confirmed armed. Closes any open gap, and starts one if the
  /// previous heartbeat is too old to vouch for the time since.
  public func recordingHeartbeat(in state: AwayState, at now: Date) -> AwayState {
    guard state.enabled else { return state }
    var result = state

    if let last = state.lastHeartbeat, now.timeIntervalSince(last) < heartbeatSpacing,
      state.openGapStart == nil
    {
      return result
    }

    if let started = state.openGapStart {
      appendGap(AwayGap(startedAt: started, endedAt: now), to: &result)
      result.openGapStart = nil
    } else if let last = state.lastHeartbeat, now.timeIntervalSince(last) > staleThreshold {
      appendGap(AwayGap(startedAt: last, endedAt: now), to: &result)
    }
    result.lastHeartbeat = now
    return result
  }

  /// Arming failed (the restart threw, the activity limit was hit). Writes no
  /// heartbeat; the gap starts at the last known-good moment.
  public func recordingFailure(in state: AwayState, at now: Date) -> AwayState {
    guard state.enabled else { return state }
    var result = state
    result.lastFailure = now
    if result.openGapStart == nil {
      result.openGapStart = state.lastHeartbeat ?? now
    }
    return result
  }

  // MARK: - Importing

  /// Hands the buffered uses to the app and clears them. The app imports uses
  /// and gaps in separate calls, so each has its own drain.
  public func drainingUses(_ state: AwayState) -> (state: AwayState, uses: [AwayUse]) {
    var result = state
    result.uses = []
    return (result, state.uses)
  }

  public func drainingGaps(_ state: AwayState) -> (state: AwayState, gaps: [AwayGap]) {
    var result = state
    result.gaps = []
    return (result, state.gaps)
  }

  private func appendGap(_ gap: AwayGap, to state: inout AwayState) {
    guard gap.endedAt > gap.startedAt else { return }
    state.gaps.append(gap)
    if state.gaps.count > maximumBuffered {
      state.gaps.removeFirst(state.gaps.count - maximumBuffered)
    }
  }
}
