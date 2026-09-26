import AVFoundation
import QuartzCore

/// Front camera → Vision, analysing live video frames rather than taking photos:
/// no shutter sound (legally forced in some regions), no stills, and no images
/// passing through JavaScript. At most one frame per `analysisInterval` is analysed.
///
/// Threading: the capture session is configured and started on `sessionQueue`;
/// frames arrive and are analysed on `analysisQueue`; callbacks run on main.
final class CameraPipeline: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  enum Unavailable: String {
    case permissionDenied
    case noCamera
    case configurationFailed
  }

  var onReady: (() -> Void)?
  var onReading: ((PresenceReading) -> Void)?
  var onUnavailable: ((Unavailable) -> Void)?

  let session = AVCaptureSession()

  private let sessionQueue = DispatchQueue(label: "com.projectscaleup.presence.session")
  private let analysisQueue = DispatchQueue(label: "com.projectscaleup.presence.analysis", qos: .userInitiated)

  // Only touched on `sessionQueue`.
  private var isConfigured = false
  // Only touched on `analysisQueue`.
  private var detector = PresenceDetector.face
  private var analysisInterval: TimeInterval = 1
  private var lastAnalysisTime: CFTimeInterval = 0

  #if targetEnvironment(simulator)
  private var simulatedFrames: Timer?
  #endif

  func configure(detector: PresenceDetector, analysisInterval: TimeInterval) {
    analysisQueue.async {
      self.detector = detector
      self.analysisInterval = analysisInterval
    }
    #if targetEnvironment(simulator)
    simulatedInterval = analysisInterval
    #endif
  }

  func start() {
    #if targetEnvironment(simulator)
    startSimulatedFrames()
    #else
    sessionQueue.async {
      guard self.configureSessionIfNeeded() else { return }
      if !self.session.isRunning {
        self.session.startRunning()
      }
      DispatchQueue.main.async { self.onReady?() }
    }
    #endif
  }

  func stop() {
    #if targetEnvironment(simulator)
    simulatedFrames?.invalidate()
    simulatedFrames = nil
    #else
    sessionQueue.async {
      if self.session.isRunning {
        self.session.stopRunning()
      }
    }
    #endif
  }

  // MARK: - Capture

  private func configureSessionIfNeeded() -> Bool {
    if isConfigured { return true }

    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      report(.permissionDenied)
      return false
    }
    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
      let input = try? AVCaptureDeviceInput(device: camera)
    else {
      report(.noCamera)
      return false
    }

    session.beginConfiguration()
    defer { session.commitConfiguration() }

    if session.canSetSessionPreset(.hd1280x720) {
      session.sessionPreset = .hd1280x720
    }

    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: analysisQueue)

    guard session.canAddInput(input), session.canAddOutput(output) else {
      report(.configurationFailed)
      return false
    }
    session.addInput(input)
    session.addOutput(output)

    // Deliver frames upright (the app is portrait-only) and mirrored like the
    // preview, so face offsets match what the user sees, as on Android.
    if let connection = output.connection(with: .video) {
      if connection.isVideoRotationAngleSupported(90) {
        connection.videoRotationAngle = 90
      }
      if connection.isVideoMirroringSupported {
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = true
      }
    }

    isConfigured = true
    return true
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let now = CACurrentMediaTime()
    guard now - lastAnalysisTime >= analysisInterval,
      let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
    else { return }
    lastAnalysisTime = now

    let reading = PresenceAnalyzer.analyze(pixelBuffer, with: detector)
    DispatchQueue.main.async { self.onReading?(reading) }
  }

  private func report(_ reason: Unavailable) {
    DispatchQueue.main.async { self.onUnavailable?(reason) }
  }

  // MARK: - Simulator

  #if targetEnvironment(simulator)
  // The Simulator has no camera. Simulated "present" frames keep session flows
  // usable during development; device builds never compile this.
  private var simulatedInterval: TimeInterval = 1

  private func startSimulatedFrames() {
    simulatedFrames?.invalidate()
    onReady?()
    simulatedFrames = Timer.scheduledTimer(withTimeInterval: simulatedInterval, repeats: true) { [weak self] _ in
      self?.onReading?(PresenceReading(presenceDetected: true, faceWidthPercent: 28, faceHorizontalOffset: 0))
    }
  }
  #endif
}
