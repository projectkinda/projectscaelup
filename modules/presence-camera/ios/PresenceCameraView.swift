import AVFoundation
import ExpoModulesCore

/// The front-camera preview that also reports presence. Runs only while it's
/// on screen and `active`, so the camera is never on in the background.
final class PresenceCameraView: ExpoView {
  let onCameraReady = EventDispatcher()
  let onPresence = EventDispatcher()
  let onCameraUnavailable = EventDispatcher()

  var detector = PresenceDetector.face {
    didSet { applyConfiguration() }
  }
  var analysisInterval: TimeInterval = 1 {
    didSet { applyConfiguration() }
  }
  var isActive = true {
    didSet { updateRunning() }
  }

  private let pipeline = CameraPipeline()
  private lazy var previewLayer = AVCaptureVideoPreviewLayer(session: pipeline.session)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true
    previewLayer.videoGravity = .resizeAspectFill
    if let connection = previewLayer.connection, connection.isVideoRotationAngleSupported(90) {
      connection.videoRotationAngle = 90
    }
    layer.addSublayer(previewLayer)

    pipeline.onReady = { [weak self] in self?.onCameraReady() }
    pipeline.onReading = { [weak self] reading in self?.onPresence(reading.payload) }
    pipeline.onUnavailable = { [weak self] reason in self?.onCameraUnavailable(["reason": reason.rawValue]) }
    applyConfiguration()
  }

  deinit {
    pipeline.stop()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateRunning()
  }

  private func applyConfiguration() {
    pipeline.configure(detector: detector, analysisInterval: analysisInterval)
  }

  private func updateRunning() {
    if window != nil && isActive {
      pipeline.start()
    } else {
      pipeline.stop()
    }
  }
}
