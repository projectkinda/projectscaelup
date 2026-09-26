import ExpoModulesCore

public final class PresenceCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PresenceCamera")

    View(PresenceCameraView.self) {
      Events("onCameraReady", "onPresence", "onCameraUnavailable")

      Prop("detector") { (view: PresenceCameraView, value: String) in
        view.detector = PresenceDetector(rawValue: value) ?? .face
      }

      Prop("active") { (view: PresenceCameraView, value: Bool) in
        view.isActive = value
      }

      Prop("analysisIntervalMs") { (view: PresenceCameraView, value: Double) in
        // Faster than 5 Hz buys nothing for presence and costs battery.
        view.analysisInterval = max(value, 200) / 1000
      }
    }
  }
}
