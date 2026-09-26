import FamilyControls
import SwiftUI
import UIKit

/// Apple's app picker in a sheet with Cancel and Done. The picker itself can't
/// cap how many apps are chosen, so Done is disabled above the free-plan limit.
struct FlaggedAppsPickerSheet: View {
  @State private var selection: FamilyActivitySelection
  let maxApps: Int?
  let onFinish: (FamilyActivitySelection?) -> Void

  init(selection: FamilyActivitySelection, maxApps: Int?, onFinish: @escaping (FamilyActivitySelection?) -> Void) {
    _selection = State(initialValue: selection)
    self.maxApps = maxApps
    self.onFinish = onFinish
  }

  private var appCount: Int { selection.applicationTokens.count }
  private var isOverLimit: Bool { maxApps.map { appCount > $0 } ?? false }

  var body: some View {
    NavigationStack {
      FamilyActivityPicker(
        headerText: "Pick the apps that distract you. They're locked during focus sessions.",
        footerText: footerText,
        selection: $selection
      )
      .navigationTitle("Flagged apps")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { onFinish(nil) }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { onFinish(selection) }
            .disabled(isOverLimit)
        }
      }
    }
    // Only Cancel and Done close the sheet, so the caller always gets an answer.
    .interactiveDismissDisabled()
  }

  private var footerText: String {
    let scope = "Only individual apps are used; categories and websites are ignored."
    guard let maxApps else { return scope }
    let count = "\(appCount) of \(maxApps) apps selected on the free plan."
    return isOverLimit ? "\(count) Remove some to continue. \(scope)" : "\(count) \(scope)"
  }

  @MainActor
  static func present(
    from presenter: UIViewController,
    selection: FamilyActivitySelection,
    maxApps: Int?,
    completion: @escaping (FamilyActivitySelection?) -> Void
  ) {
    var host: UIViewController?
    let sheet = FlaggedAppsPickerSheet(selection: selection, maxApps: maxApps) { chosen in
      host?.dismiss(animated: true)
      completion(chosen)
    }
    let controller = UIHostingController(rootView: sheet)
    host = controller
    presenter.present(controller, animated: true)
  }
}
