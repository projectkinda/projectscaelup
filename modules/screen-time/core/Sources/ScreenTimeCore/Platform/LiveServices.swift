#if os(iOS)
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

  func apply(_ layers: Set<ShieldLayer>) {
    let tokens = flaggedApps.applicationTokens
    for layer in ShieldLayer.allCases {
      let store = ManagedSettingsStore(named: layer.storeName)
      let desired: Set<ApplicationToken>? = layers.contains(layer) && !tokens.isEmpty ? tokens : nil
      // Skip redundant writes: each one makes the system re-evaluate shields.
      if store.shield.applications != desired {
        store.shield.applications = desired
      }
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
    scheduler: DeviceActivityWakeScheduler()
  )
}
#endif
