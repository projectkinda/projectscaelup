// swift-tools-version: 6.0
// Lets the platform-independent rules run under `swift test` on a Mac.
// The app and its extensions consume the same sources through ScreenTimeCore.podspec.
import PackageDescription

let package = Package(
  name: "ScreenTimeCore",
  platforms: [.iOS(.v18), .macOS(.v15)],
  products: [.library(name: "ScreenTimeCore", targets: ["ScreenTimeCore"])],
  targets: [
    .target(name: "ScreenTimeCore"),
    .testTarget(name: "ScreenTimeCoreTests", dependencies: ["ScreenTimeCore"]),
  ]
)
