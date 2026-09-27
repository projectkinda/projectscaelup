import Foundation

/// Reads and atomically updates the shared state. Implementations must be safe
/// across processes: the app and three extensions write to the same state.
public protocol ScreenTimeStateStore: Sendable {
  func read() -> ScreenTimeState
  @discardableResult
  func update(_ transform: (ScreenTimeState) -> ScreenTimeState) -> ScreenTimeState
}

/// Raises or lowers the flagged-app shields to match a plan.
public protocol ShieldApplying: Sendable {
  func apply(_ plan: ShieldPlan)
}

/// Arranges for the monitor extension to run `reconcile()` at a moment, or cancels it.
public protocol WakeScheduling: Sendable {
  func scheduleWake(_ window: WakeWindow?)
}

/// Watches flagged-app use for silent tracking, or stops watching (`nil`).
/// Must be idempotent: an unchanged plan leaves monitoring alone.
public protocol UsageMonitoring: Sendable {
  func monitorUsage(_ plan: UsagePlan?)
}

/// The single entry point for every process. Each operation updates the state,
/// then reconciles: settle due transitions, set the shields and usage monitoring
/// to match, and schedule the next wake-up. Reconciling is idempotent, so the
/// app and the extensions can all call it without coordinating.
public final class ScreenTimeEngine: Sendable {
  public let policy: ScreenTimePolicy
  private let store: any ScreenTimeStateStore
  private let shields: any ShieldApplying
  private let scheduler: any WakeScheduling
  private let usage: any UsageMonitoring
  private let now: @Sendable () -> Date

  public init(
    store: any ScreenTimeStateStore,
    shields: any ShieldApplying,
    scheduler: any WakeScheduling,
    usage: any UsageMonitoring,
    policy: ScreenTimePolicy = ScreenTimePolicy(),
    now: @escaping @Sendable () -> Date = { Date() }
  ) {
    self.store = store
    self.shields = shields
    self.scheduler = scheduler
    self.usage = usage
    self.policy = policy
    self.now = now
  }

  @discardableResult
  public func reconcile() -> ScreenTimeState {
    let now = now()
    let state = store.update { policy.settled($0, at: now) }
    apply(state, at: now)
    return state
  }

  public func startSession(id: Int, modeName: String, endsAt: Date, strict: Bool) {
    mutate { policy.startingSession(id: id, modeName: modeName, endsAt: endsAt, strict: strict, in: $0, at: $1) }
  }

  public func pauseSession() {
    mutate { policy.pausingSession($0, at: $1) }
  }

  public func resumeSession(endsAt: Date) {
    mutate { policy.resumingSession(endsAt: endsAt, in: $0, at: $1) }
  }

  /// Ends the session and returns its distractions, removing them from the queue.
  public func endSession(id: Int) -> [Distraction] {
    var distractions: [Distraction] = []
    mutate { state, now in
      let ended = policy.endingSession(id: id, in: policy.settled(state, at: now))
      distractions = ended.distractions
      return ended.state
    }
    return distractions
  }

  /// Silent tracking: a flagged app passed the usage threshold.
  @discardableResult
  public func recordUsage(appKey: String) -> Bool {
    var counted = false
    mutate { state, now in
      let result = policy.recordingUsage(appKey: appKey, in: state, at: now)
      counted = result.counted
      return result.state
    }
    return counted
  }

  /// Strict mode: the user chose "Open anyway" on the lock screen.
  public func openAnyway() -> ScreenTimePolicy.OpenAnywayOutcome {
    var outcome = ScreenTimePolicy.OpenAnywayOutcome.refused
    mutate { state, now in
      let result = policy.openingAnyway(state, at: now)
      outcome = result.outcome
      return result.state
    }
    return outcome
  }

  public func lockDown(until: Date, apps: AppSelection) {
    mutate { policy.lockingDown(until: until, apps: apps, in: $0, at: $1) }
  }

  public func shieldCopy(appName: String?) -> ShieldCopy {
    let now = now()
    return policy.shieldCopy(for: policy.settled(store.read(), at: now), appName: appName, at: now)
  }

  public func canEditFlaggedApps() -> Bool {
    policy.canEditFlaggedApps(in: policy.settled(store.read(), at: now()))
  }

  // MARK: - Private

  private func mutate(_ transform: (ScreenTimeState, Date) -> ScreenTimeState) {
    let now = now()
    let state = store.update { transform($0, now) }
    apply(state, at: now)
  }

  private func apply(_ state: ScreenTimeState, at now: Date) {
    shields.apply(policy.shieldPlan(in: state))
    usage.monitorUsage(policy.usagePlan(in: state))
    scheduler.scheduleWake(
      policy.nextTransition(in: state, after: now).map { WakePlanner.window(toWakeAt: $0, now: now) }
    )
  }
}
