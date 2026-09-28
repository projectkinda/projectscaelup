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

    AsyncFunction("setStrictMode") { (enabled: Bool) -> ScreenTimeStatus in
      ScreenTimePreferences.shared.strictMode = enabled
      return Self.status(engine: Self.engine)
    }

    AsyncFunction("startSession") { (id: Int, modeName: String, endsAtMs: Double) in
      Self.engine.startSession(
        id: id,
        modeName: modeName,
        endsAt: Self.date(fromMs: endsAtMs),
        strict: ScreenTimePreferences.shared.strictMode
      )
    }

    AsyncFunction("pauseSession") {
      Self.engine.pauseSession()
    }

    AsyncFunction("resumeSession") { (endsAtMs: Double) in
      Self.engine.resumeSession(endsAt: Self.date(fromMs: endsAtMs))
    }

    AsyncFunction("endSession") { (id: Int) -> [DistractionRecord] in
      Self.engine.endSession(id: id).map(DistractionRecord.init)
    }

    /// `appKeys` lists the apps to lock; `nil` locks every flagged app.
    AsyncFunction("lockDown") { (untilMs: Double, appKeys: [String]?) in
      Self.engine.lockDown(until: Self.date(fromMs: untilMs), apps: appKeys.map { .only(Set($0)) } ?? .all)
    }

    AsyncFunction("reconcile") {
      Self.engine.reconcile()
    }

    View(FlaggedAppsView.self) {
      Prop("revision") { (view: FlaggedAppsView, _: Int) in
        view.reload()
      }
    }

    View(FlaggedAppLabelView.self) {
      Prop("appKeys") { (view: FlaggedAppLabelView, keys: [String]) in
        view.setAppKeys(keys)
      }
      Prop("display") { (view: FlaggedAppLabelView, display: FlaggedAppLabelModel.Display) in
        view.setDisplay(display)
      }
      Prop("size") { (view: FlaggedAppLabelView, size: Double) in
        view.setSize(size)
      }
      Prop("color") { (view: FlaggedAppLabelView, color: UIColor) in
        view.setColor(color)
      }
      Prop("weight") { (view: FlaggedAppLabelView, weight: FlaggedAppLabelModel.Weight) in
        view.setWeight(weight)
      }
      Prop("align") { (view: FlaggedAppLabelView, align: FlaggedAppLabelModel.Align) in
        view.setAlign(align)
      }
    }
  }

  private static func status(engine: ScreenTimeEngine) -> ScreenTimeStatus {
    let status = ScreenTimeStatus()
    status.authorization = authorizationName(AuthorizationCenter.shared.authorizationStatus)
    status.flaggedAppCount = FlaggedApps.shared.selection().applicationTokens.count
    status.canEditFlaggedApps = engine.canEditFlaggedApps()
    status.strictMode = ScreenTimePreferences.shared.strictMode
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
  @Field var strictMode: Bool = false
}

struct DistractionRecord: Record {
  @Field var occurredAtMs: Double = 0
  /// The flagged app's stable key, or `nil` when iOS can't say which app.
  @Field var appKey: String?

  init() {}

  init(_ distraction: Distraction) {
    occurredAtMs = distraction.occurredAt.timeIntervalSince1970 * 1000
    appKey = distraction.appKey
  }
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
