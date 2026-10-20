import DeviceActivity
import ScreenTimeCore

/// Woken by the schedules ScreenTimeCore plans (session end, grace end, lockdown
/// end), by silent tracking's usage events, and by away time's all-day activity
/// and its keepers. It never decides anything itself: it hands the event to the
/// engine (sessions) or the away tracker, which apply the shared rules.
///
/// Every callback first checks whose activity woke it. Away-time activities must
/// never reach the session engine: an ambient threshold counted as a session
/// distraction would be wrong, and an ambient window ending must not run the
/// session reconcile.
final class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  /// A flagged app passed the usage threshold, in a session or (away time) outside one.
  override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
    super.eventDidReachThreshold(event, activity: activity)
    if AwayTracker.owns(activityNamed: activity.rawValue) {
      AwayTracker.live.recordUse(fromEvent: event.rawValue)
      return
    }
    ScreenTimeEngine.live.recordUsage(fromEvent: event.rawValue)
  }

  /// Away time's keepers start here: confirm ambient tracking is still running
  /// and restart it if it isn't.
  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    if AwayTracker.owns(activityNamed: activity.rawValue) {
      AwayTracker.live.wake()
    }
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    if AwayTracker.owns(activityNamed: activity.rawValue) {
      AwayTracker.live.wake()
      return
    }
    ScreenTimeEngine.live.reconcile()
  }

  /// Short waits are delivered as an end-of-interval warning (15-minute minimum).
  override func intervalWillEndWarning(for activity: DeviceActivityName) {
    super.intervalWillEndWarning(for: activity)
    if AwayTracker.owns(activityNamed: activity.rawValue) {
      return
    }
    ScreenTimeEngine.live.reconcile()
  }
}
