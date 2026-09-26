import Foundation

/// Everything the app and its extensions need to agree on, persisted in the App Group.
///
/// Transitions are driven by timestamps rather than flags, so any process can
/// settle the state at any moment and reach the same answer (see `ScreenTimePolicy`).
public struct ScreenTimeState: Codable, Equatable, Sendable {
  public var session: FocusSession?
  public var lockdown: Lockdown?
  /// Distractions recorded by the shield extension, waiting for the app to import them.
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
  public var pausedAt: Date?
  /// Flagged apps are unlocked until this moment after the user chose "Open anyway".
  public var graceUntil: Date?
  /// When the most recent grace period ended. Re-opening shortly after counts as the same visit.
  public var lastGraceEndedAt: Date?

  public init(id: Int, modeName: String, endsAt: Date) {
    self.id = id
    self.modeName = modeName
    self.endsAt = endsAt
  }
}

public struct Lockdown: Codable, Equatable, Sendable {
  public var until: Date

  public init(until: Date) {
    self.until = until
  }
}

public struct Distraction: Codable, Equatable, Sendable {
  public let sessionId: Int
  public let occurredAt: Date

  public init(sessionId: Int, occurredAt: Date) {
    self.sessionId = sessionId
    self.occurredAt = occurredAt
  }
}

/// A named set of flagged-app shields; each maps to its own `ManagedSettingsStore`.
public enum ShieldLayer: String, CaseIterable, Sendable {
  case session
  case lockdown
}
