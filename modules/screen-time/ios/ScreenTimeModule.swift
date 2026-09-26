import ExpoModulesCore
import FamilyControls
import ScreenTimeCore

/// JavaScript entry point. It only translates between JS values and
/// `ScreenTimeEngine`; every rule lives in ScreenTimeCore, shared with the extensions.
public final class ScreenTimeModule: Module {
  private static var engine: ScreenTimeEngine { .live }

  public func definition() -> ModuleDefinition {
    Name("ScreenTime")

    Function("getStatus") { () -> ScreenTimeStatus in
      Self.status(engine: Self.engine)
    }

    AsyncFunction("requestAuthorization") { () async throws -> ScreenTimeStatus in
      do {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      } catch {
        throw AuthorizationFailedException(error.localizedDescription)
      }
      // Apply any lock that couldn't take effect before access was granted.
      Self.engine.reconcile()
      return Self.status(engine: Self.engine)
    }

    AsyncFunction("presentFlaggedAppsPicker") { (maxApps: Int?, promise: Promise) in
      guard Self.engine.canEditFlaggedApps() else {
        throw FlaggedAppsLockedException()
      }
      guard let presenter = appContext?.utilities?.currentViewController() else {
        throw NoPresenterException()
      }
      // `runOnQueue(.main)` below guarantees we're on the main thread here.
      MainActor.assumeIsolated {
        FlaggedAppsPickerSheet.present(
          from: presenter,
          selection: FlaggedApps.shared.selection(),
          maxApps: maxApps
        ) { chosen in
          if let chosen {
            FlaggedApps.shared.save(chosen)
            Self.engine.reconcile()
          }
          promise.resolve(Self.status(engine: Self.engine))
        }
      }
    }
    .runOnQueue(.main)

    AsyncFunction("startSession") { (id: Int, modeName: String, endsAtMs: Double) in
      Self.engine.startSession(id: id, modeName: modeName, endsAt: Self.date(fromMs: endsAtMs))
    }

    AsyncFunction("pauseSession") {
      Self.engine.pauseSession()
    }

    AsyncFunction("resumeSession") { (endsAtMs: Double) in
      Self.engine.resumeSession(endsAt: Self.date(fromMs: endsAtMs))
    }

    AsyncFunction("endSession") { (id: Int) -> [Double] in
      Self.engine.endSession(id: id).map { $0.occurredAt.timeIntervalSince1970 * 1000 }
    }

    AsyncFunction("lockDown") { (untilMs: Double) in
      Self.engine.lockDown(until: Self.date(fromMs: untilMs))
    }

    AsyncFunction("reconcile") {
      Self.engine.reconcile()
    }

    View(FlaggedAppsView.self) {
      Prop("revision") { (view: FlaggedAppsView, _: Int) in
        view.reload()
      }
    }
  }

  private static func status(engine: ScreenTimeEngine) -> ScreenTimeStatus {
    let status = ScreenTimeStatus()
    status.authorization = authorizationName(AuthorizationCenter.shared.authorizationStatus)
    status.flaggedAppCount = FlaggedApps.shared.selection().applicationTokens.count
    status.canEditFlaggedApps = engine.canEditFlaggedApps()
    return status
  }

  private static func authorizationName(_ status: AuthorizationStatus) -> String {
    switch status {
    case .approved:
      return "approved"
    case .denied:
      return "denied"
    case .notDetermined:
      return "notDetermined"
    default:
      // iOS 26.4 added `approvedWithDataAccess`; it grants everything we use.
      if #available(iOS 26.4, *), status == .approvedWithDataAccess {
        return "approved"
      }
      return "notDetermined"
    }
  }

  private static func date(fromMs milliseconds: Double) -> Date {
    Date(timeIntervalSince1970: milliseconds / 1000)
  }
}

struct ScreenTimeStatus: Record {
  @Field var authorization: String = "notDetermined"
  @Field var flaggedAppCount: Int = 0
  @Field var canEditFlaggedApps: Bool = true
}

final class AuthorizationFailedException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Screen Time access wasn't granted: \(param)"
  }
}

final class FlaggedAppsLockedException: Exception, @unchecked Sendable {
  override var reason: String {
    "Flagged apps can't be changed during a focus session or lockdown"
  }
}

final class NoPresenterException: Exception, @unchecked Sendable {
  override var reason: String {
    "There's no screen to present the app picker from"
  }
}
