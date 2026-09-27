import Foundation

/// Everything the app and its extensions need to agree on, persisted in the App Group.
///
/// Transitions are driven by timestamps rather than flags, so any process can
/// settle the state at any moment and reach the same answer (see `ScreenTimePolicy`).
public struct ScreenTimeState: Codable, Equatable, Sendable {
  public var session: FocusSession?
  public var lockdown: Lockdown?
  /// Distractions recorded by the extensions, waiting for the app to import them.
  public var pendingDistractions: [Distraction]

  public init(
    session: FocusSession? = nil,
    lockdown: Lockdown? = nil,
    pendingDistractions: [Distraction] = []
  ) {
    self.session = session
    self.lockdown = lockdown
    self.pendingDistractions = pendingDistractions
  }
}

public struct FocusSession: Codable, Equatable, Sendable {
  public let id: Int
  public var modeName: String
  public var endsAt: Date
  /// Strict mode locks flagged apps during the session ("Open anyway" counts a
  /// distraction). Otherwise apps stay usable and usage is tracked silently,
  /// matching Android.
  public let strict: Bool
  public var pausedAt: Date?

  // Silent tracking.
  /// Bumps on every resume so usage monitoring restarts from a clean interval.
  public var segment: Int
  public var segmentStartedAt: Date
  /// Apps already counted this session; silent tracking counts each app once.
  public var countedAppKeys: [String]

  // Strict mode.
  /// Flagged apps are unlocked until this moment after the user chose "Open anyway".
  public var graceUntil: Date?
  /// When the most recent grace period ended. Re-opening shortly after counts as the same visit.
  public var lastGraceEndedAt: Date?

  public init(id: Int, modeName: String, endsAt: Date, strict: Bool, startedAt: Date) {
    self.id = id
    self.modeName = modeName
    self.endsAt = endsAt
    self.strict = strict
    self.segment = 0
    self.segmentStartedAt = startedAt
    self.countedAppKeys = []
  }
}

public struct Lockdown: Codable, Equatable, Sendable {
  public var until: Date
  public var apps: AppSelection

  public init(until: Date, apps: AppSelection) {
    self.until = until
    self.apps = apps
  }
}

/// Which flagged apps something applies to. Apps are identified by
/// `FlaggedApps.key(for:)`, a stable digest of their opaque token.
public enum AppSelection: Codable, Equatable, Sendable {
  case all
  case only(Set<String>)

  public func union(_ other: AppSelection) -> AppSelection {
    switch (self, other) {
    case (.only(let left), .only(let right)):
      return .only(left.union(right))
    default:
      return .all
    }
  }
}

public struct Distraction: Codable, Equatable, Sendable {
  public let sessionId: Int
  public let occurredAt: Date
  /// The flagged app it happened in, or `nil` when iOS can't say (strict mode's
  /// "Open anyway" is shown for whichever flagged app was opened).
  public let appKey: String?

  public init(sessionId: Int, occurredAt: Date, appKey: String?) {
    self.sessionId = sessionId
    self.occurredAt = occurredAt
    self.appKey = appKey
  }
}

/// A named set of flagged-app shields; each maps to its own `ManagedSettingsStore`.
public enum ShieldLayer: String, CaseIterable, Sendable {
  case session
  case lockdown
}

/// The shields that should be up, as `ScreenTimePolicy` decides them.
public struct ShieldPlan: Equatable, Sendable {
  /// Strict mode's session lock covers every flagged app.
  public var session: Bool
  public var lockdown: AppSelection?

  public init(session: Bool = false, lockdown: AppSelection? = nil) {
    self.session = session
    self.lockdown = lockdown
  }

  public static let none = ShieldPlan()
}

/// What to monitor for silent tracking: each flagged app's use during one
/// session segment, reported once it passes `threshold`.
public struct UsagePlan: Equatable, Sendable {
  public let sessionId: Int
  public let segment: Int
  public let start: Date
  /// At least 15 minutes after `start` (DeviceActivity's minimum interval). Use
  /// after the session's real end is ignored when it's reported.
  public let end: Date
  public let threshold: TimeInterval
  /// Apps already counted this session don't need watching again.
  public let excludedAppKeys: Set<String>
}
