import ManagedSettings
import ScreenTimeCore

/// Handles the lock-screen buttons: "Back to focus" closes the app, and
/// "Open anyway" records a distraction and unlocks for the grace period.
final class ShieldActionExtension: ShieldActionDelegate {
  override func handle(
    action: ShieldAction,
    for application: ApplicationToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    completionHandler(Self.response(to: action))
  }

  override func handle(
    action: ShieldAction,
    for category: ActivityCategoryToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    completionHandler(Self.response(to: action))
  }

  override func handle(
    action: ShieldAction,
    for webDomain: WebDomainToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    // Websites are never shielded; close defensively if one ever is.
    completionHandler(.close)
  }

  private static func response(to action: ShieldAction) -> ShieldActionResponse {
    switch action {
    case .primaryButtonPressed:
      return .close
    case .secondaryButtonPressed:
      switch ScreenTimeEngine.live.openAnyway() {
      case .unlocked:
        // The shield is already lifted; deferring makes iOS re-check and open the app.
        return .defer
      case .refused:
        return .close
      }
    default:
      // Submenu buttons (iOS 26.4+) aren't used on our lock screen.
      return .close
    }
  }
}
