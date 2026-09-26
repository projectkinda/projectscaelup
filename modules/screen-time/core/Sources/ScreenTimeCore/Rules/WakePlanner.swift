import Foundation

/// A DeviceActivity monitoring window that wakes the monitor extension at (or
/// just after) a target moment.
public struct WakeWindow: Equatable, Sendable {
  public let start: Date
  public let end: Date
  /// Whole minutes before `end` at which `intervalWillEndWarning` fires, or `nil`
  /// when the wake-up is the end of the interval itself.
  public let warningMinutes: Int?

  /// When the extension will be woken.
  public var wakesAt: Date {
    end.addingTimeInterval(-TimeInterval((warningMinutes ?? 0) * 60))
  }
}

/// Turns "wake me at T" into a schedule DeviceActivity accepts and delivers reliably.
///
/// - Schedules shorter than 15 minutes are rejected (`intervalTooShort`). Apple's
///   recovery suggestion is to use `warningTime`: schedule 15 minutes and ask for
///   the warning at `15 - delay` minutes.
/// - Intervals ending more than ~45 minutes out are reported to fire late, so long
///   waits hop in steps of at most 44 minutes; each wake-up reschedules the next.
/// - DeviceActivity works to the minute, so the warning is rounded to whole
///   minutes, erring late: a lock never lifts early.
public enum WakePlanner {
  public static let minimumInterval: TimeInterval = 15 * 60
  public static let maximumReliableInterval: TimeInterval = 44 * 60
  /// Never ask for a wake-up sooner than this; the system can't act faster.
  public static let minimumLeadTime: TimeInterval = 60

  public static func window(toWakeAt target: Date, now: Date) -> WakeWindow {
    let delay = max(target.timeIntervalSince(now), minimumLeadTime)

    if delay > maximumReliableInterval {
      return WakeWindow(start: now, end: now.addingTimeInterval(maximumReliableInterval), warningMinutes: nil)
    }

    if delay >= minimumInterval {
      return WakeWindow(start: now, end: now.addingTimeInterval(delay), warningMinutes: nil)
    }

    let warningMinutes = Int(((minimumInterval - delay) / 60).rounded(.down))
    return WakeWindow(
      start: now,
      end: now.addingTimeInterval(minimumInterval),
      warningMinutes: warningMinutes > 0 ? warningMinutes : nil
    )
  }
}
