import Foundation
import Synchronization
import Testing
@testable import ScreenTimeCore

final class InMemoryStore: ScreenTimeStateStore {
  private let state = Mutex(ScreenTimeState())

  func read() -> ScreenTimeState { state.withLock { $0 } }

  func update(_ transform: (ScreenTimeState) -> ScreenTimeState) -> ScreenTimeState {
    state.withLock { current in
      current = transform(current)
      return current
    }
  }
}

final class RecordingShields: ShieldApplying {
  private let applied = Mutex<[ShieldPlan]>([])
  var last: ShieldPlan? { applied.withLock { $0.last } }
  func apply(_ plan: ShieldPlan) { applied.withLock { $0.append(plan) } }
}

final class RecordingScheduler: WakeScheduling {
  private let windows = Mutex<[WakeWindow?]>([])
  var last: WakeWindow?? { windows.withLock { $0.last } }
  func scheduleWake(_ window: WakeWindow?) { windows.withLock { $0.append(window) } }
}

final class RecordingUsage: UsageMonitoring {
  private let plans = Mutex<[UsagePlan?]>([])
  var last: UsagePlan?? { plans.withLock { $0.last } }
  func monitorUsage(_ plan: UsagePlan?) { plans.withLock { $0.append(plan) } }
}

final class Clock: Sendable {
  private let value = Mutex(Date(timeIntervalSince1970: 1_800_000_000))
  var now: Date { value.withLock { $0 } }
  func advance(minutes: Double) { value.withLock { $0 = $0.addingTimeInterval(minutes * 60) } }
}

@Suite("Engine")
struct ScreenTimeEngineTests {
  let store = InMemoryStore()
  let shields = RecordingShields()
  let scheduler = RecordingScheduler()
  let usage = RecordingUsage()
  let clock = Clock()

  func makeEngine() -> ScreenTimeEngine {
    let clock = clock
    return ScreenTimeEngine(store: store, shields: shields, scheduler: scheduler, usage: usage, now: { clock.now })
  }

  func minutes(_ value: Double) -> Date { clock.now.addingTimeInterval(value * 60) }

  @Test func `a normal session tracks silently and never shields`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: minutes(25), strict: false)
    #expect(shields.last == ShieldPlan.none)
    #expect(usage.last??.sessionId == 1)
    #expect(scheduler.last??.wakesAt == minutes(25))
  }

  @Test func `used apps are counted, then only they are locked down`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: minutes(25), strict: false)
    clock.advance(minutes: 3)
    #expect(engine.recordUsage(appKey: "insta"))
    #expect(usage.last??.excludedAppKeys == ["insta"])

    let distractions = engine.endSession(id: 1)
    #expect(distractions.map(\.appKey) == ["insta"])
    #expect(usage.last == .some(nil))

    engine.lockDown(until: minutes(12), apps: .only(["insta"]))
    #expect(shields.last?.lockdown == .only(["insta"]))
    clock.advance(minutes: 12)
    engine.reconcile()
    #expect(shields.last == ShieldPlan.none)
  }

  @Test func `a strict session shields, open anyway lifts it, and reconcile restores it`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: minutes(25), strict: true)
    #expect(shields.last?.session == true)
    #expect(usage.last == .some(nil))

    #expect(engine.openAnyway() == .unlocked(countedAsDistraction: true))
    #expect(shields.last?.session == false)
    clock.advance(minutes: 2)
    engine.reconcile()
    #expect(shields.last?.session == true)
  }

  @Test func `reconciling twice changes nothing`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: minutes(25), strict: false)
    #expect(engine.reconcile() == engine.reconcile())
  }
}
