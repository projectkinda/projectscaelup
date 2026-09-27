import DeviceActivity
import ScreenTimeCore

/// Woken by the schedules ScreenTimeCore plans (session end, grace end, lockdown
/// end) and by silent tracking's usage events. It never decides anything itself:
/// it hands the event to the engine, which applies the shared rules.
final class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  /// A flagged app passed the usage threshold during a session.
  override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
    super.eventDidReachThreshold(event, activity: activity)
    ScreenTimeEngine.live.recordUsage(fromEvent: event.rawValue)
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    ScreenTimeEngine.live.reconcile()
  }

  /// Short waits are delivered as an end-of-interval warning (15-minute minimum).
  override func intervalWillEndWarning(for activity: DeviceActivityName) {
    super.intervalWillEndWarning(for: activity)
    ScreenTimeEngine.live.reconcile()
  }
}
