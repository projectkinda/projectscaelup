import ExpoModulesCore
import FamilyControls
import ManagedSettings
import ScreenTimeCore
import SwiftUI

/// The flagged apps as icons. Tokens are opaque, so only the system can draw
/// their names and icons; this view never exposes them to JavaScript.
final class FlaggedAppsView: ExpoView {
  private let model = FlaggedAppsModel()
  private lazy var host = UIHostingController(rootView: FlaggedAppsStrip(model: model))

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    host.view.backgroundColor = .clear
    addSubview(host.view)
    reload()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.view.frame = bounds
  }

  func reload() {
    model.tokens = Array(FlaggedApps.shared.selection().applicationTokens)
  }
}

@MainActor
final class FlaggedAppsModel: ObservableObject {
  @Published var tokens: [ApplicationToken] = []
}

private struct FlaggedAppsStrip: View {
  @ObservedObject var model: FlaggedAppsModel

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 12) {
        ForEach(model.tokens, id: \.self) { token in
          Label(token)
            .labelStyle(.iconOnly)
            .scaleEffect(1.6)
            .frame(width: 52, height: 52)
            .accessibilityElement(children: .combine)
        }
      }
    }
  }
}
