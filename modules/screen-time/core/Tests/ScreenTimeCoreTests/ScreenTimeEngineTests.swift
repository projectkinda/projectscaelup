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
  private let applied = Mutex<[Set<ShieldLayer>]>([])
  var last: Set<ShieldLayer>? { applied.withLock { $0.last } }
  func apply(_ layers: Set<ShieldLayer>) { applied.withLock { $0.append(layers) } }
}

final class RecordingScheduler: WakeScheduling {
  private let windows = Mutex<[WakeWindow?]>([])
  var last: WakeWindow?? { windows.withLock { $0.last } }
  func scheduleWake(_ window: WakeWindow?) { windows.withLock { $0.append(window) } }
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
  let clock = Clock()

  func makeEngine() -> ScreenTimeEngine {
    let clock = clock
    return ScreenTimeEngine(store: store, shields: shields, scheduler: scheduler, now: { clock.now })
  }

  @Test func `starting a session raises the lock and schedules its end`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: clock.now.addingTimeInterval(25 * 60))
    #expect(shields.last == [.session])
    #expect(scheduler.last??.wakesAt == clock.now.addingTimeInterval(25 * 60))
  }

  @Test func `open anyway lifts the lock and a later reconcile restores it`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: clock.now.addingTimeInterval(25 * 60))

    #expect(engine.openAnyway() == .unlocked(countedAsDistraction: true))
    #expect(shields.last == [])
    #expect(scheduler.last??.wakesAt == clock.now.addingTimeInterval(2 * 60))

    clock.advance(minutes: 2)
    engine.reconcile()
    #expect(shields.last == [.session])
  }

  @Test func `ending hands back distractions and clears everything`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: clock.now.addingTimeInterval(25 * 60))
    _ = engine.openAnyway()

    #expect(engine.endSession(id: 1).count == 1)
    #expect(shields.last == [])
    #expect(scheduler.last == .some(nil))
  }

  @Test func `a lockdown locks, then lifts on the reconcile after it expires`() {
    let engine = makeEngine()
    engine.lockDown(until: clock.now.addingTimeInterval(10 * 60))
    #expect(shields.last == [.lockdown])
    #expect(scheduler.last??.wakesAt == clock.now.addingTimeInterval(10 * 60))

    clock.advance(minutes: 10)
    engine.reconcile()
    #expect(shields.last == [])
  }

  @Test func `reconciling twice changes nothing`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: clock.now.addingTimeInterval(25 * 60))
    let first = engine.reconcile()
    let second = engine.reconcile()
    #expect(first == second)
  }
}
