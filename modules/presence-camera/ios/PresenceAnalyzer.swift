import CoreVideo
import Foundation
import Vision

/// What the session logic needs from one camera frame. Same shape and units as
/// Android's `PresenceDetectorBridge`, so `presenceModule.ts` treats both alike.
struct PresenceReading: Equatable {
  var presenceDetected: Bool
  /// Face width as a percentage of the frame width; `nil` for pose detection.
  var faceWidthPercent: Double?
  /// Face centre relative to the frame centre, from -50 (left) to 50 (right).
  var faceHorizontalOffset: Double?

  static let absent = PresenceReading(presenceDetected: false)

  var payload: [String: Any] {
    [
      "presenceDetected": presenceDetected,
      "faceWidthPercent": faceWidthPercent as Any,
      "faceHorizontalOffset": faceHorizontalOffset as Any,
    ]
  }
}

enum PresenceDetector: String {
  case face
  case pose
}

/// Runs Apple's on-device Vision requests on a frame. Nothing leaves the device.
///
/// Frames arrive upright and mirrored like the preview (see `CameraPipeline`),
/// so measurements match what the user sees.
enum PresenceAnalyzer {
  static func analyze(_ pixelBuffer: CVPixelBuffer, with detector: PresenceDetector) -> PresenceReading {
    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up)
    do {
      switch detector {
      case .face:
        let request = VNDetectFaceRectanglesRequest()
        try handler.perform([request])
        return reading(forFaces: request.results ?? [])
      case .pose:
        let request = VNDetectHumanBodyPoseRequest()
        try handler.perform([request])
        return PresenceReading(presenceDetected: !(request.results ?? []).isEmpty)
      }
    } catch {
      return .absent
    }
  }

  /// Uses the largest face, which is the person at the desk rather than someone behind them.
  static func reading(forFaces faces: [VNFaceObservation]) -> PresenceReading {
    guard let face = faces.max(by: { $0.boundingBox.width < $1.boundingBox.width }) else {
      return .absent
    }
    // Vision boxes are normalised to 0...1, so these match Android's
    // `box.width / bitmap.width * 100` and `(centerX - 0.5) * 100`.
    let box = face.boundingBox
    return PresenceReading(
      presenceDetected: true,
      faceWidthPercent: Double(box.width * 100),
      faceHorizontalOffset: Double((box.midX - 0.5) * 100)
    )
  }
}
