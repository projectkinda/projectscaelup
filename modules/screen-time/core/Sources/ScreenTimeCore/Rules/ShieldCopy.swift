import Foundation

/// The text on the lock screen iOS shows over a flagged app.
public struct ShieldCopy: Equatable, Sendable {
  public let title: String
  public let subtitle: String
  public let primaryButton: String
  /// `nil` hides the second button (lockdowns have no way out).
  public let secondaryButton: String?

  public init(title: String, subtitle: String, primaryButton: String, secondaryButton: String?) {
    self.title = title
    self.subtitle = subtitle
    self.primaryButton = primaryButton
    self.secondaryButton = secondaryButton
  }
}

extension ScreenTimePolicy {
  /// Lock-screen text for a settled state. A lockdown outranks a session, since
  /// it's the stricter of the two and has no "Open anyway".
  public func shieldCopy(for state: ScreenTimeState, appName: String?, at now: Date) -> ShieldCopy {
    let app = appName.flatMap { $0.isEmpty ? nil : $0 } ?? "This app"

    if let lockdown = state.lockdown {
      return ShieldCopy(
        title: "\(app) is locked",
        subtitle: "Locked after your focus session. \(minutesLeft(until: lockdown.until, now: now)).",
        primaryButton: "OK",
        secondaryButton: nil
      )
    }

    if let session = state.session, session.pausedAt == nil {
      return ShieldCopy(
        title: "\(app) is paused",
        subtitle: "You're in a \(session.modeName) session. \(minutesLeft(until: session.endsAt, now: now)).",
        primaryButton: "Back to focus",
        secondaryButton: "Open anyway"
      )
    }

    // A shield can briefly outlive its reason until the next reconcile clears it.
    return ShieldCopy(
      title: "Project ScaleUp",
      subtitle: "Unlocking. Try again in a moment.",
      primaryButton: "OK",
      secondaryButton: nil
    )
  }

  private func minutesLeft(until end: Date, now: Date) -> String {
    let minutes = max(1, Int((end.timeIntervalSince(now) / 60).rounded(.up)))
    return minutes == 1 ? "1 min left" : "\(minutes) min left"
  }
}
