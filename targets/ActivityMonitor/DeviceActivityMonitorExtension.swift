import DeviceActivity
import ScreenTimeCore

/// Woken by the schedules ScreenTimeCore plans (session end, grace end, lockdown
/// end). It never decides anything itself; it reconciles, which settles due
/// transitions, updates the shields and schedules the next wake-up.
final class DeviceActivityMonitorExtension: DeviceActivityMonitor {
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
