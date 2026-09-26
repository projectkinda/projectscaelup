import ManagedSettings
import ManagedSettingsUI
import ScreenTimeCore
import UIKit

/// Draws the lock screen over a flagged app. The text comes from ScreenTimeCore
/// so it always matches the current session or lockdown.
final class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  override func configuration(shielding application: Application) -> ShieldConfiguration {
    Self.configuration(for: ScreenTimeEngine.live.shieldCopy(appName: application.localizedDisplayName))
  }

  override func configuration(
    shielding application: Application,
    in category: ActivityCategory
  ) -> ShieldConfiguration {
    configuration(shielding: application)
  }

  private static func configuration(for copy: ShieldCopy) -> ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterialDark,
      backgroundColor: Palette.background,
      icon: UIImage(systemName: "hourglass"),
      title: ShieldConfiguration.Label(text: copy.title, color: Palette.ink),
      subtitle: ShieldConfiguration.Label(text: copy.subtitle, color: Palette.secondaryInk),
      primaryButtonLabel: ShieldConfiguration.Label(text: copy.primaryButton, color: Palette.background),
      primaryButtonBackgroundColor: Palette.ink,
      secondaryButtonLabel: copy.secondaryButton.map {
        ShieldConfiguration.Label(text: $0, color: Palette.secondaryInk)
      }
    )
  }
}

/// The app's dark palette (see src/theme/tokens.ts).
private enum Palette {
  static let background = UIColor(red: 0x12 / 255, green: 0x12 / 255, blue: 0x12 / 255, alpha: 1)
  static let ink = UIColor(red: 0xED / 255, green: 0xED / 255, blue: 0xED / 255, alpha: 1)
  static let secondaryInk = UIColor(white: 1, alpha: 0.7)
}
