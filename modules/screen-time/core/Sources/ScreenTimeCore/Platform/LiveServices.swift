#if os(iOS)
import CryptoKit
import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

// MARK: - State

final class AppGroupStateStore: ScreenTimeStateStore {
  private let file = CoordinatedFile<ScreenTimeState>(named: "screen-time-state.json")

  func read() -> ScreenTimeState {
    file.read() ?? ScreenTimeState()
  }

  func update(_ transform: (ScreenTimeState) -> ScreenTimeState) -> ScreenTimeState {
    file.update { transform($0 ?? ScreenTimeState()) }
  }
}

// MARK: - Flagged apps

/// The user's picker selection. Tokens are opaque and never leave native code.
public final class FlaggedApps: Sendable {
  public static let shared = FlaggedApps()

  private let file = CoordinatedFile<FamilyActivitySelection>(named: "flagged-apps.json")

  public func selection() -> FamilyActivitySelection {
    file.read() ?? FamilyActivitySelection(includeEntireCategory: false)
  }

  /// Saves the apps from a picker selection. Categories and websites aren't
  /// supported yet, so they're dropped rather than silently half-applied.
  public func save(_ selection: FamilyActivitySelection) {
    var appsOnly = FamilyActivitySelection(includeEntireCategory: false)
    appsOnly.applicationTokens = selection.applicationTokens
    file.update { _ in appsOnly }
  }

  var applicationTokens: Set<ApplicationToken> {
    selection().applicationTokens
  }

  /// The flagged apps by their stable key.
  func tokensByKey() -> [String: ApplicationToken] {
    Dictionary(applicationTokens.map { (Self.key(for: $0), $0) }, uniquingKeysWith: { first, _ in first })
  }

  /// A stable, opaque identifier for a flagged app: a digest of its token's
  /// encoding. Every process decodes the same stored selection, so the app and
  /// its extensions derive the same key without ever seeing which app it is.
  static func key(for token: ApplicationToken) -> String {
    let encoded = (try? JSONEncoder().encode(token)) ?? Data()
    return SHA256.hash(data: encoded).prefix(8).map { String(format: "%02x", $0) }.joined()
  }
}

// MARK: - Preferences

/// User choices that native code needs, shared with the extensions.
public final class ScreenTimePreferences: Sendable {
  public static let shared = ScreenTimePreferences()

  private struct Values: Codable {
    var strictMode = false
  }

  private let file = CoordinatedFile<Values>(named: "screen-time-preferences.json")

  /// Lock flagged apps during sessions instead of tracking them silently.
  public var strictMode: Bool {
    get { file.read()?.strictMode ?? false }
    set { file.update { current in var values = current ?? Values(); values.strictMode = newValue; return values } }
  }
}

// MARK: - Shields

extension ShieldLayer {
  var storeName: ManagedSettingsStore.Name {
    ManagedSettingsStore.Name("com.projectscaleup.shield.\(rawValue)")
  }
}

final class ManagedShieldController: ShieldApplying {
  private let flaggedApps: FlaggedApps

  init(flaggedApps: FlaggedApps) {
    self.flaggedApps = flaggedApps
  }

  func apply(_ plan: ShieldPlan) {
    let tokensByKey = flaggedApps.tokensByKey()
    let all = Set(tokensByKey.values)
    set(.session, to: plan.session ? all : [])
    switch plan.lockdown {
    case nil:
      set(.lockdown, to: [])
    case .all:
      set(.lockdown, to: all)
    case .only(let keys):
      set(.lockdown, to: Set(keys.compactMap { tokensByKey[$0] }))
    }
  }

  private func set(_ layer: ShieldLayer, to tokens: Set<ApplicationToken>) {
    let store = ManagedSettingsStore(named: layer.storeName)
    let desired: Set<ApplicationToken>? = tokens.isEmpty ? nil : tokens
    // Skip redundant writes: each one makes the system re-evaluate shields.
    if store.shield.applications != desired {
      store.shield.applications = desired
    }
  }
}

// MARK: - Usage monitoring (silent tracking)

final class DeviceActivityUsageMonitor: UsageMonitoring {
  private static let activityPrefix = "com.projectscaleup.usage."
  /// Threshold events are named `app.<key>` so the monitor extension can tell
  /// which flagged app was used (see `appKey(fromEvent:)`).
  private static let eventPrefix = "app."
  private static let components: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]

  private let flaggedApps: FlaggedApps

  init(flaggedApps: FlaggedApps) {
    self.flaggedApps = flaggedApps
  }

  static func appKey(fromEvent name: String) -> String? {
    name.hasPrefix(eventPrefix) ? String(name.dropFirst(eventPrefix.count)) : nil
  }

  func monitorUsage(_ plan: UsagePlan?) {
    let center = DeviceActivityCenter()
    let current = center.activities.filter { $0.rawValue.hasPrefix(Self.activityPrefix) }

    guard let plan else {
      if !current.isEmpty {
        center.stopMonitoring(current)
      }
      return
    }

    // One activity per session segment. If it's already running, leave it:
    // restarting would reset iOS's usage counts (and fire intervalDidEnd).
    let activity = DeviceActivityName("\(Self.activityPrefix)\(plan.sessionId).\(plan.segment)")
    if current.contains(activity) {
      return
    }
    if !current.isEmpty {
      center.stopMonitoring(current)
    }

    let threshold = DateComponents(second: Int(plan.threshold))
    var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
    for (key, token) in flaggedApps.tokensByKey() where !plan.excludedAppKeys.contains(key) {
      events[DeviceActivityEvent.Name("\(Self.eventPrefix)\(key)")] = DeviceActivityEvent(
        applications: [token],
        threshold: threshold,
        includesPastActivity: false
      )
    }
    guard !events.isEmpty else { return }

    let calendar = Calendar.current
    let schedule = DeviceActivitySchedule(
      intervalStart: calendar.dateComponents(Self.components, from: plan.start),
      intervalEnd: calendar.dateComponents(Self.components, from: plan.end),
      repeats: false
    )
    do {
      try center.startMonitoring(activity, during: schedule, events: events)
    } catch DeviceActivityCenter.MonitoringError.unauthorized {
      screenTimeLog.debug("Skipped usage monitoring: Screen Time isn't authorized")
    } catch {
      screenTimeLog.error("Starting usage monitoring failed: \(error)")
    }
  }
}

// MARK: - Wake-ups

final class DeviceActivityWakeScheduler: WakeScheduling {
  // `DeviceActivityName` isn't Sendable, so keep the raw name and build it on use.
  private static let activityName = "com.projectscaleup.wake"
  static var activity: DeviceActivityName { DeviceActivityName(activityName) }

  private static let components: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
  /// Wake-ups closer together than this are treated as the same one.
  private static let tolerance: TimeInterval = 60

  func scheduleWake(_ window: WakeWindow?) {
    let center = DeviceActivityCenter()
    let calendar = Calendar.current

    guard let window else {
      if center.activities.contains(Self.activity) {
        center.stopMonitoring([Self.activity])
      }
      return
    }

    // Rescheduling makes the system end the current interval, which calls
    // `intervalDidEnd` in the monitor extension, which reconciles and schedules
    // again. Leaving an equivalent schedule in place breaks that loop.
    if let existing = center.schedule(for: Self.activity),
      let existingWake = Self.wakeDate(of: existing, calendar: calendar),
      abs(existingWake.timeIntervalSince(window.wakesAt)) < Self.tolerance
    {
      return
    }

    let schedule = DeviceActivitySchedule(
      intervalStart: calendar.dateComponents(Self.components, from: window.start),
      intervalEnd: calendar.dateComponents(Self.components, from: window.end),
      repeats: false,
      warningTime: window.warningMinutes.map { DateComponents(minute: $0) }
    )
    do {
      try center.startMonitoring(Self.activity, during: schedule)
    } catch DeviceActivityCenter.MonitoringError.unauthorized {
      // Expected until the user grants Screen Time access; the app reconciles once they do.
      screenTimeLog.debug("Skipped a wake-up: Screen Time isn't authorized")
    } catch {
      screenTimeLog.error("Scheduling a wake-up failed: \(error)")
    }
  }

  private static func wakeDate(of schedule: DeviceActivitySchedule, calendar: Calendar) -> Date? {
    guard let end = calendar.date(from: schedule.intervalEnd) else { return nil }
    let warningMinutes = schedule.warningTime?.minute ?? 0
    return end.addingTimeInterval(-TimeInterval(warningMinutes * 60))
  }
}

// MARK: - Wiring

extension ScreenTimeEngine {
  /// The engine every process uses: the app, the monitor and both shield extensions.
  public static let live = ScreenTimeEngine(
    store: AppGroupStateStore(),
    shields: ManagedShieldController(flaggedApps: .shared),
    scheduler: DeviceActivityWakeScheduler(),
    usage: DeviceActivityUsageMonitor(flaggedApps: .shared)
  )

  /// Called by the monitor extension when a threshold event fires.
  public func recordUsage(fromEvent name: String) {
    guard let key = DeviceActivityUsageMonitor.appKey(fromEvent: name) else { return }
    recordUsage(appKey: key)
  }
}
#endif
