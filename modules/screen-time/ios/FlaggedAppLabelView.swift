import ExpoModulesCore
import FamilyControls
import ManagedSettings
import ScreenTimeCore
import SwiftUI

/// Draws the flagged apps behind distraction keys: their icons, or their names.
/// Only iOS can render a token, so JavaScript passes keys and never learns the app.
final class FlaggedAppLabelView: ExpoView {
  private let model = FlaggedAppLabelModel()
  private lazy var host = UIHostingController(rootView: FlaggedAppLabel(model: model))

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    host.view.backgroundColor = .clear
    addSubview(host.view)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.view.frame = bounds
  }

  func setDisplay(_ display: FlaggedAppLabelModel.Display) {
    model.display = display
  }

  func setSize(_ size: Double) {
    model.size = size
  }

  func setColor(_ color: UIColor) {
    model.color = Color(uiColor: color)
  }

  func setWeight(_ weight: FlaggedAppLabelModel.Weight) {
    model.weight = weight
  }

  func setAlign(_ align: FlaggedAppLabelModel.Align) {
    model.align = align
  }

  func setAppKeys(_ keys: [String]) {
    // Unknown keys (an app flagged on another install) still take a slot, drawn generically.
    model.apps = keys.map { FlaggedAppLabelModel.App(key: $0, token: FlaggedApps.shared.token(forKey: $0)) }
  }
}

@MainActor
final class FlaggedAppLabelModel: ObservableObject {
  struct App: Identifiable {
    let key: String
    let token: ApplicationToken?
    var id: String { key }
  }

  enum Display: String, Enumerable {
    case icons
    case names
  }

  enum Weight: String, Enumerable {
    case regular
    case medium
  }

  enum Align: String, Enumerable {
    case start
    case center
  }

  @Published var apps: [App] = []
  @Published var display: Display = .names
  @Published var size: Double = 13
  @Published var color: Color = .white
  @Published var weight: Weight = .regular
  @Published var align: Align = .start

  var fontWeight: Font.Weight { weight == .medium ? .medium : .regular }
  var alignment: Alignment { align == .center ? .center : .leading }
}

private struct FlaggedAppLabel: View {
  /// The side of the icon `Label(ApplicationToken)` draws at the default font.
  private static let systemIconSize = 32.0

  @ObservedObject var model: FlaggedAppLabelModel

  var body: some View {
    switch model.display {
    case .icons:
      icons
    case .names:
      names
    }
  }

  /// Overlapping icons, like the History card's Android row.
  private var icons: some View {
    HStack(spacing: -model.size / 4) {
      ForEach(model.apps) { app in
        Group {
          if let token = app.token {
            // `Label` draws its icon at a fixed size; scale it to the requested one.
            Label(token).labelStyle(.iconOnly).scaleEffect(model.size / Self.systemIconSize)
          } else {
            RoundedRectangle(cornerRadius: model.size / 4).fill(Color(white: 0.165))
          }
        }
        .frame(width: model.size, height: model.size)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: model.alignment)
    .accessibilityHidden(true)
  }

  /// Names separated by commas, truncated on one line.
  private var names: some View {
    HStack(spacing: 0) {
      ForEach(Array(model.apps.enumerated()), id: \.element.id) { index, app in
        if index > 0 {
          Text(", ")
        }
        if let token = app.token {
          Label(token).labelStyle(.titleOnly)
        } else {
          Text("A flagged app")
        }
      }
    }
    .font(.system(size: model.size, weight: model.fontWeight))
    .foregroundStyle(model.color)
    .lineLimit(1)
    .fixedSize(horizontal: true, vertical: false)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: model.alignment)
    .accessibilityElement(children: .combine)
  }
}
