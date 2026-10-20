#if os(iOS)
import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

// MARK: - State

final class AppGroupAwayStore: AwayStateStore {
  private let file = CoordinatedFile<AwayState>(named: "away-tracking.json")

  func read() -> AwayState {
    file.read() ?? AwayState()
  }

  func update(_ transform: (AwayState) -> AwayState) -> AwayState {
    file.update { transform($0 ?? AwayState()) }
  }
}

// MARK: - Ambient monitoring

/// Watches flagged apps all day, outside sessions, with two kinds of activity:
///
/// - **ambient**: one daily repeating window with a usage event per flagged app.
///   When an event fires, the monitor extension records it and restarts the
///   activity so counts reset and the next event can fire after another minute
///   of use ("design B" in `docs/away-time-ios-spec.md`).
/// - **keepers**: four short repeating windows (00:00, 06:00, 12:00, 18:00)
///   whose only job is to wake the extension so it can confirm ambient is still
///   running and restart it if not. They cap an undetected outage at ~6 hours.
///
/// Both use a prefix of their own, so session start/end never stops them (the
/// session usage monitor stops only `com.projectscaleup.usage.*`).
final class DeviceActivityAmbientMonitor: AmbientMonitoring {
  static let activityPrefix = "com.projectscaleup.ambient."
  private static let mainName = "\(activityPrefix)main"
  private static let keeperPrefix = "\(activityPrefix)keeper."
  private static let keeperHours = [0, 6, 12, 18]
  private static let keeperLength = 15  // minutes; DeviceActivity's minimum interval
  private static let eventPrefix = "app."
  /// Same as the session threshold: iOS reports shorter ones unreliably.
  private static let threshold = DateComponents(second: 60)

  private let flaggedApps: FlaggedApps

  init(flaggedApps: FlaggedApps) {
    self.flaggedApps = flaggedApps
  }

  static func owns(_ activity: DeviceActivityName) -> Bool {
    activity.rawValue.hasPrefix(activityPrefix)
  }

  static func isKeeper(_ activity: DeviceActivityName) -> Bool {
    activity.rawValue.hasPrefix(keeperPrefix)
  }

  private static var mainActivity: DeviceActivityName { DeviceActivityName(mainName) }

  var isRunning: Bool {
    AuthorizationCenter.shared.isApproved && DeviceActivityCenter().activities.contains(Self.mainActivity)
  }

  func arm() -> AmbientArmResult {
    guard AuthorizationCenter.shared.isApproved else {
      screenTimeLog.debug("Skipped ambient monitoring: Screen Time isn't authorized")
      return .failed
    }
    let center = DeviceActivityCenter()
    ensureKeepers(center)

    let tokens = flaggedApps.tokensByKey()
    guard !tokens.isEmpty else {
      stopMain(center)
      return .nothingToMonitor
    }

    // Already watching exactly these apps: leave it alone. Restarting resets
    // iOS's usage counts.
    let desired = Set(tokens.keys.map { "\(Self.eventPrefix)\($0)" })
    if center.activities.contains(Self.mainActivity),
      Set(center.events(for: Self.mainActivity).keys.map(\.rawValue)) == desired
    {
      return .armed
    }
    return start(center, tokens: tokens)
  }

  func rearm() -> AmbientArmResult {
    guard AuthorizationCenter.shared.isApproved else { return .failed }
    let center = DeviceActivityCenter()
    stopMain(center)
    let tokens = flaggedApps.tokensByKey()
    guard !tokens.isEmpty else { return .nothingToMonitor }
    return start(center, tokens: tokens)
  }

  func pause() {
    guard AuthorizationCenter.shared.isApproved else { return }
    stopMain(DeviceActivityCenter())
  }

  func stopAll() {
    guard AuthorizationCenter.shared.isApproved else { return }
    let center = DeviceActivityCenter()
    let ours = center.activities.filter(Self.owns)
    if !ours.isEmpty {
      center.stopMonitoring(ours)
    }
  }

  // MARK: - Private

  private func stopMain(_ center: DeviceActivityCenter) {
    if center.activities.contains(Self.mainActivity) {
      center.stopMonitoring([Self.mainActivity])
    }
  }

  private func start(_ center: DeviceActivityCenter, tokens: [String: ApplicationToken]) -> AmbientArmResult {
    var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
    for (key, token) in tokens {
      events[DeviceActivityEvent.Name("\(Self.eventPrefix)\(key)")] = DeviceActivityEvent(
        applications: [token],
        threshold: Self.threshold,
        includesPastActivity: false
      )
    }
    // Start and stop restart the day's counts; a daily repeat resets them at
    // midnight, so nothing needs chaining.
    let schedule = DeviceActivitySchedule(
      intervalStart: DateComponents(hour: 0, minute: 0, second: 0),
      intervalEnd: DateComponents(hour: 23, minute: 59, second: 59),
      repeats: true
    )
    do {
      try center.startMonitoring(Self.mainActivity, during: schedule, events: events)
    } catch {
      screenTimeLog.error("Starting ambient monitoring failed: \(error)")
      return .failed
    }
    // A heartbeat vouches for armed monitoring, so confirm it's really running.
    return center.activities.contains(Self.mainActivity) ? .armed : .failed
  }

  private func ensureKeepers(_ center: DeviceActivityCenter) {
    let running = center.activities
    for hour in Self.keeperHours {
      let activity = DeviceActivityName("\(Self.keeperPrefix)\(hour)")
      if running.contains(activity) { continue }
      let schedule = DeviceActivitySchedule(
        intervalStart: DateComponents(hour: hour, minute: 0),
        intervalEnd: DateComponents(hour: hour, minute: Self.keeperLength),
        repeats: true
      )
      do {
        try center.startMonitoring(activity, during: schedule)
      } catch {
        // Ambient still works without a keeper; they only bound how long an
        // outage can go unnoticed.
        screenTimeLog.error("Starting an away-time keeper failed: \(error)")
      }
    }
  }
}

// MARK: - Wiring

extension AwayTracker {
  /// The tracker every process uses: the app and the monitor extension.
  public static let live = AwayTracker(
    store: AppGroupAwayStore(),
    monitor: DeviceActivityAmbientMonitor(flaggedApps: .shared),
    sessionActive: { now in
      ScreenTimePolicy().settled(AppGroupStateStore.shared.read(), at: now).session != nil
    }
  )

  /// Whether the monitor extension was woken by one of the away-time activities.
  public static func owns(activityNamed name: String) -> Bool {
    name.hasPrefix(DeviceActivityAmbientMonitor.activityPrefix)
  }

  /// Called by the monitor extension when an ambient threshold event fires.
  public func recordUse(fromEvent name: String) {
    guard let key = DeviceActivityUsageMonitor.appKey(fromEvent: name) else { return }
    recordUse(appKey: key)
  }
}
#endif
