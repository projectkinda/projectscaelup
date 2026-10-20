import Foundation

/// Reads and atomically updates the away-time state, safely across processes.
public protocol AwayStateStore: Sendable {
  func read() -> AwayState
  @discardableResult
  func update(_ transform: (AwayState) -> AwayState) -> AwayState
}

public enum AmbientArmResult: Equatable, Sendable {
  /// Monitoring is running for the current flagged apps.
  case armed
  /// There's nothing to watch (no flagged apps), which isn't a failure.
  case nothingToMonitor
  /// The system refused (activity limit, not authorized, ...).
  case failed
}

/// Watches flagged apps all day, outside sessions ("ambient" tracking), so the
/// app can say how long the user has stayed away from them.
public protocol AmbientMonitoring: Sendable {
  /// Makes sure the ambient activity and the keepers are running for the
  /// current flagged apps. Idempotent: if they already are, leaves them alone
  /// (restarting resets iOS's usage counts).
  func arm() -> AmbientArmResult
  /// Restarts the ambient activity so usage counts start from zero. Called after
  /// each reported use, so the next one can fire after another minute of use.
  func rearm() -> AmbientArmResult
  /// Stops the ambient activity but keeps the keepers, for the duration of a session.
  func pause()
  /// Stops everything. Used when the user opts out.
  func stopAll()
  /// Whether the ambient activity is confirmed running right now.
  var isRunning: Bool { get }
}

/// Lets the engine tell the tracker about every session change.
public protocol AwayReconciling: Sendable {
  func reconcile(sessionActive: Bool)
}

/// Ties `AwayPolicy` to the system. Like `ScreenTimeEngine`, it is the single
/// entry point for every process, and reconciling is idempotent.
public final class AwayTracker: AwayReconciling, Sendable {
  public let policy: AwayPolicy
  private let store: any AwayStateStore
  private let monitor: any AmbientMonitoring
  private let sessionActive: @Sendable (Date) -> Bool
  private let now: @Sendable () -> Date

  /// `sessionActive` answers "is a focus session (even a paused one) running at
  /// this moment", from the session state the engine shares with the extensions.
  public init(
    store: any AwayStateStore,
    monitor: any AmbientMonitoring,
    sessionActive: @escaping @Sendable (Date) -> Bool,
    policy: AwayPolicy = AwayPolicy(),
    now: @escaping @Sendable () -> Date = { Date() }
  ) {
    self.store = store
    self.monitor = monitor
    self.sessionActive = sessionActive
    self.policy = policy
    self.now = now
  }

  // MARK: - Opt in and out

  public func setEnabled(_ enabled: Bool) {
    if enabled {
      store.update { policy.enabling($0) }
    } else {
      monitor.stopAll()
      store.update { policy.disabling($0) }
      return
    }
    let now = now()
    reconcile(sessionActive: sessionActive(now))
  }

  // MARK: - Reconciling

  /// Brings ambient monitoring in line with the opt-in and the session state.
  /// Called by the engine on every change, and by the keeper wake-ups.
  public func reconcile(sessionActive: Bool) {
    let state = store.read()
    guard policy.shouldRun(state, sessionActive: sessionActive) else {
      // Off, or a session owns usage tracking. Only the ambient activity
      // stops. A keeper must never restart it mid-session, nor log a failure.
      if monitor.isRunning {
        monitor.pause()
      }
      return
    }
    let wasRunning = monitor.isRunning
    let result = monitor.arm()
    if result == .armed, !wasRunning {
      markArmed()
    }
    note(result)
  }

  /// A keeper (or any wake-up that isn't a flagged-app event) fired.
  public func wake() {
    reconcile(sessionActive: sessionActive(now()))
  }

  // MARK: - Events

  /// A flagged app passed the ambient usage threshold.
  public func recordUse(appKey: String) {
    let now = now()
    let isSessionActive = sessionActive(now)
    store.update { policy.recordingUse(appKey: appKey, in: $0, at: now, sessionActive: isSessionActive) }
    guard policy.shouldRun(store.read(), sessionActive: isSessionActive) else { return }
    let result = monitor.rearm()
    if result == .armed {
      markArmed()
    }
    note(result)
  }

  // MARK: - Importing and status

  public func drainUses() -> [AwayUse] {
    var drained: [AwayUse] = []
    store.update { state in
      let result = policy.drainingUses(state)
      drained = result.uses
      return result.state
    }
    return drained
  }

  public func drainGaps() -> [AwayGap] {
    var drained: [AwayGap] = []
    store.update { state in
      let result = policy.drainingGaps(state)
      drained = result.gaps
      return result.state
    }
    return drained
  }

  public func status() -> AwayState {
    store.read()
  }

  #if DEBUG
  /// Debug hooks for the dead-tracking test; they cannot ship.
  public func debugStopAmbient() { monitor.pause() }
  public func debugSimulateFailure() { note(.failed) }
  public func debugClearHeartbeat() {
    store.update { state in
      var result = state
      result.lastHeartbeat = nil
      return result
    }
  }
  #endif

  // MARK: - Private

  private func markArmed() {
    let now = now()
    store.update { state in
      var result = state
      result.armedAt = now
      return result
    }
  }

  /// Heartbeat only when armed; a failure is a gap with no heartbeat.
  private func note(_ result: AmbientArmResult) {
    let now = now()
    switch result {
    case .armed:
      store.update { policy.recordingHeartbeat(in: $0, at: now) }
    case .failed:
      store.update { policy.recordingFailure(in: $0, at: now) }
    case .nothingToMonitor:
      break
    }
  }
}
