#if os(iOS)
import Foundation
import os

let screenTimeLog = Logger(subsystem: "com.projectscaleup.app", category: "ScreenTime")

/// The App Group shared by the app and its Screen Time extensions.
public enum AppGroup {
  public static let identifier = "group.com.projectscaleup.app"

  /// The shared container, or the app's own Application Support directory when
  /// the App Group isn't provisioned (Simulator builds without a team). The
  /// fallback keeps the app working; extensions can't run in that setup anyway.
  static let directory: URL = {
    if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier) {
      return url
    }
    screenTimeLog.fault("App Group \(identifier, privacy: .public) is unavailable; using local storage")
    let local = URL.applicationSupportDirectory.appending(path: "ScreenTime", directoryHint: .isDirectory)
    try? FileManager.default.createDirectory(at: local, withIntermediateDirectories: true)
    return local
  }()
}

/// A JSON file in the App Group, read and written under `NSFileCoordinator` so
/// the app and extensions (separate processes) never interleave an update.
final class CoordinatedFile<Value: Codable>: Sendable {
  private let url: URL

  init(named name: String) {
    url = AppGroup.directory.appending(path: name)
  }

  func read() -> Value? {
    var value: Value?
    var coordinationError: NSError?
    NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) {
      value = Self.decode(at: $0)
    }
    if let coordinationError {
      screenTimeLog.error("Reading \(self.url.lastPathComponent, privacy: .public) failed: \(coordinationError)")
    }
    return value
  }

  /// Reads, transforms and writes the value as one coordinated operation.
  @discardableResult
  func update(_ transform: (Value?) -> Value) -> Value {
    var result: Value?
    var coordinationError: NSError?
    NSFileCoordinator().coordinate(writingItemAt: url, options: .forMerging, error: &coordinationError) {
      let next = transform(Self.decode(at: $0))
      Self.write(next, to: $0)
      result = next
    }
    if let result {
      return result
    }
    screenTimeLog.error(
      "Updating \(self.url.lastPathComponent, privacy: .public) failed: \(String(describing: coordinationError))"
    )
    return transform(read())
  }

  private static func decode(at url: URL) -> Value? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    do {
      return try JSONDecoder().decode(Value.self, from: data)
    } catch {
      screenTimeLog.error("Discarding unreadable \(url.lastPathComponent, privacy: .public): \(error)")
      return nil
    }
  }

  private static func write(_ value: Value, to url: URL) {
    do {
      try JSONEncoder().encode(value).write(
        to: url,
        options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
      )
    } catch {
      screenTimeLog.error("Writing \(url.lastPathComponent, privacy: .public) failed: \(error)")
    }
  }
}
#endif
