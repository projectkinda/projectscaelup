# Presence camera (iOS)

The front-camera preview for readiness and running sessions on iOS. It checks
presence on device with Apple Vision on **live video frames**: no photos, so no
shutter sound (legally forced in some regions), no stills, and no images sent
through JavaScript.

- `ios/CameraPipeline.swift`: capture session plus frame throttling (`analysisIntervalMs`).
- `ios/PresenceAnalyzer.swift`: Vision face and body-pose requests. Readings use
  the same units as Android's `PresenceDetectorBridge` (face width % of frame,
  horizontal offset −50…50).
- JS: `src/components/LivePresenceCamera.tsx` feeds readings into `PresenceModule`.

The Simulator has no camera, so simulator builds emit simulated "present"
readings to keep session flows testable. Device builds never include that code.
