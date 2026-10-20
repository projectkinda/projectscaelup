import Foundation
import Synchronization
import Testing
@testable import ScreenTimeCore

final class InMemoryAwayStore: AwayStateStore {
  private let state = Mutex(AwayState())

  func read() -> AwayState { state.withLock { $0 } }

  func update(_ transform: (AwayState) -> AwayState) -> AwayState {
    state.withLock { current in
      current = transform(current)
      return current
    }
  }
}

/// A stand-in for the DeviceActivity ambient activity that records what it was asked to do.
final class FakeAmbient: AmbientMonitoring {
  struct Calls: Equatable {
    var arm = 0
    var rearm = 0
    var pause = 0
    var stopAll = 0
  }

  private let inner = Mutex((running: false, result: AmbientArmResult.armed, calls: Calls()))

  var isRunning: Bool { inner.withLock { $0.running } }
  var calls: Calls { inner.withLock { $0.calls } }
  /// What the next `arm()` / `rearm()` reports.
  var result: AmbientArmResult {
    get { inner.withLock { $0.result } }
    set { inner.withLock { $0.result = newValue } }
  }

  func arm() -> AmbientArmResult {
    inner.withLock { state in
      state.calls.arm += 1
      state.running = state.result == .armed
      return state.result
    }
  }

  func rearm() -> AmbientArmResult {
    inner.withLock { state in
      state.calls.rearm += 1
      state.running = state.result == .armed
      return state.result
    }
  }

  func pause() { inner.withLock { $0.calls.pause += 1; $0.running = false } }
  func stopAll() { inner.withLock { $0.calls.stopAll += 1; $0.running = false } }
}

final class SessionFlag: Sendable {
  private let value = Mutex(false)
  var active: Bool {
    get { value.withLock { $0 } }
    set { value.withLock { $0 = newValue } }
  }
}

@Suite("Away policy")
struct AwayPolicyTests {
  let policy = AwayPolicy()
  let t0 = Date(timeIntervalSince1970: 1_800_000_000)

  func later(_ minutes: Double) -> Date { t0.addingTimeInterval(minutes * 60) }

  @Test func `nothing is recorded until the user opts in`() {
    let state = policy.recordingUse(appKey: "insta", in: AwayState(), at: t0, sessionActive: false)
    #expect(state.uses.isEmpty)
    #expect(policy.recordingHeartbeat(in: AwayState(), at: t0).lastHeartbeat == nil)
  }

  @Test func `a session owns usage, so ambient never records during one`() {
    let on = policy.enabling(AwayState())
    #expect(policy.shouldRun(on, sessionActive: true) == false)
    #expect(policy.recordingUse(appKey: "insta", in: on, at: t0, sessionActive: true).uses.isEmpty)
    #expect(policy.shouldRun(on, sessionActive: false))
  }

  @Test func `uses are buffered in order, capped, and drained once`() {
    let small = AwayPolicy(maximumBuffered: 2)
    var state = small.enabling(AwayState())
    for index in 0..<3 {
      state = small.recordingUse(appKey: "app\(index)", in: state, at: later(Double(index)), sessionActive: false)
    }
    #expect(state.uses.map(\.appKey) == ["app1", "app2"])

    let drained = small.drainingUses(state)
    #expect(drained.uses.map(\.appKey) == ["app1", "app2"])
    #expect(drained.state.uses.isEmpty)
    #expect(small.drainingUses(drained.state).uses.isEmpty)
  }

  @Test func `a report right after monitoring restarts is too early to be real`() {
    var state = policy.enabling(AwayState())
    state.armedAt = t0
    #expect(policy.recordingUse(appKey: "insta", in: state, at: t0.addingTimeInterval(5), sessionActive: false).uses.isEmpty)
    #expect(policy.recordingUse(appKey: "insta", in: state, at: t0.addingTimeInterval(60), sessionActive: false).uses.count == 1)
  }

  @Test func `heartbeats within the spacing are collapsed`() {
    var state = policy.enabling(AwayState())
    state = policy.recordingHeartbeat(in: state, at: t0)
    state = policy.recordingHeartbeat(in: state, at: later(2))
    #expect(state.lastHeartbeat == t0)
    state = policy.recordingHeartbeat(in: state, at: later(6))
    #expect(state.lastHeartbeat == later(6))
    #expect(state.gaps.isEmpty)
  }

  @Test func `a heartbeat after too long a silence reports the gap`() {
    var state = policy.enabling(AwayState())
    state = policy.recordingHeartbeat(in: state, at: t0)
    state = policy.recordingHeartbeat(in: state, at: later(7 * 60))
    #expect(state.gaps == [AwayGap(startedAt: t0, endedAt: later(7 * 60))])
    #expect(state.lastHeartbeat == later(7 * 60))
  }

  @Test func `a failure writes no heartbeat and the next heartbeat closes the gap`() {
    var state = policy.enabling(AwayState())
    state = policy.recordingHeartbeat(in: state, at: t0)
    state = policy.recordingFailure(in: state, at: later(30))
    #expect(state.lastHeartbeat == t0)
    #expect(state.lastFailure == later(30))
    #expect(state.gaps.isEmpty)

    // Repeated failures keep the original start.
    state = policy.recordingFailure(in: state, at: later(60))
    state = policy.recordingHeartbeat(in: state, at: later(90))
    #expect(state.gaps == [AwayGap(startedAt: t0, endedAt: later(90))])
    #expect(state.openGapStart == nil)
  }

  @Test func `opting out forgets everything`() {
    var state = policy.enabling(AwayState())
    state = policy.recordingHeartbeat(in: state, at: t0)
    state = policy.recordingUse(appKey: "insta", in: state, at: later(1), sessionActive: false)
    #expect(policy.disabling(state) == AwayState())
  }
}

@Suite("Away tracker")
struct AwayTrackerTests {
  let store = InMemoryAwayStore()
  let monitor = FakeAmbient()
  let session = SessionFlag()
  let clock = Clock()

  func makeTracker() -> AwayTracker {
    let clock = clock
    let session = session
    return AwayTracker(store: store, monitor: monitor, sessionActive: { _ in session.active }, now: { clock.now })
  }

  @Test func `opting in arms ambient tracking and writes a heartbeat`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)
    #expect(monitor.isRunning)
    #expect(store.read().lastHeartbeat == clock.now)
  }

  @Test func `a failed arm writes a failure and no heartbeat`() {
    let tracker = makeTracker()
    monitor.result = .failed
    tracker.setEnabled(true)
    #expect(store.read().lastHeartbeat == nil)
    #expect(store.read().lastFailure == clock.now)
    #expect(store.read().openGapStart != nil)
  }

  @Test func `with no flagged apps nothing is armed, claimed, or failed`() {
    let tracker = makeTracker()
    monitor.result = .nothingToMonitor
    tracker.setEnabled(true)
    #expect(store.read().lastHeartbeat == nil)
    #expect(store.read().lastFailure == nil)
  }

  @Test func `a session pauses ambient, and a keeper mid-session never restarts it`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)

    session.active = true
    tracker.reconcile(sessionActive: true)
    #expect(!monitor.isRunning)

    let armsBefore = monitor.calls.arm
    clock.advance(minutes: 6 * 60)
    tracker.wake()
    #expect(!monitor.isRunning)
    #expect(monitor.calls.arm == armsBefore)
    #expect(store.read().lastFailure == nil)
  }

  @Test func `when the session ends ambient resumes without the app`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)
    session.active = true
    tracker.reconcile(sessionActive: true)

    session.active = false
    clock.advance(minutes: 30)
    tracker.reconcile(sessionActive: false)
    #expect(monitor.isRunning)
    #expect(store.read().lastHeartbeat == clock.now)
  }

  @Test func `a keeper restarts ambient that died, and a dead restart is a gap`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)
    let armedAt = clock.now

    monitor.pause()
    clock.advance(minutes: 6 * 60)
    monitor.result = .failed
    tracker.wake()
    #expect(store.read().lastHeartbeat == armedAt)
    #expect(store.read().openGapStart == armedAt)

    clock.advance(minutes: 6 * 60)
    monitor.result = .armed
    tracker.wake()
    #expect(store.read().gaps == [AwayGap(startedAt: armedAt, endedAt: clock.now)])
    #expect(store.read().lastHeartbeat == clock.now)
  }

  @Test func `a reported use is recorded and ambient restarts for the next one`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)
    clock.advance(minutes: 5)
    tracker.recordUse(appKey: "insta")
    #expect(monitor.calls.rearm == 1)
    // The restart makes the very next report suspect until it settles.
    tracker.recordUse(appKey: "insta")
    #expect(tracker.status().uses.count == 1)
    #expect(tracker.drainUses() == [AwayUse(appKey: "insta", usedAt: clock.now)])
    #expect(tracker.drainUses().isEmpty)
  }

  @Test func `a use reported during a session is ignored and does not restart ambient`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)
    session.active = true
    tracker.recordUse(appKey: "insta")
    #expect(tracker.drainUses().isEmpty)
    #expect(monitor.calls.rearm == 0)
  }

  @Test func `a failed restart after a use is a gap and the use is still kept`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)
    clock.advance(minutes: 5)
    monitor.result = .failed
    tracker.recordUse(appKey: "insta")
    #expect(store.read().uses.count == 1)
    #expect(store.read().lastFailure != nil)
  }

  @Test func `draining uses leaves gaps for their own drain`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)
    clock.advance(minutes: 5)
    tracker.recordUse(appKey: "insta")
    clock.advance(minutes: 7 * 60)
    tracker.wake()
    #expect(tracker.drainUses().count == 1)
    #expect(tracker.drainGaps().count == 1)
    #expect(tracker.drainGaps().isEmpty)
  }

  @Test func `opting out stops everything and clears the buffers`() {
    let tracker = makeTracker()
    tracker.setEnabled(true)
    tracker.recordUse(appKey: "insta")
    tracker.setEnabled(false)
    #expect(monitor.calls.stopAll == 1)
    #expect(store.read() == AwayState())

    tracker.wake()
    #expect(!monitor.isRunning)
  }
}

@Suite("Away tracking and sessions")
struct AwayEngineIntegrationTests {
  let store = InMemoryStore()
  let awayStore = InMemoryAwayStore()
  let monitor = FakeAmbient()
  let clock = Clock()

  func makeEngine() -> ScreenTimeEngine {
    let clock = clock
    let store = store
    let tracker = AwayTracker(
      store: awayStore,
      monitor: monitor,
      sessionActive: { now in ScreenTimePolicy().settled(store.read(), at: now).session != nil },
      now: { clock.now }
    )
    tracker.setEnabled(true)
    return ScreenTimeEngine(
      store: store,
      shields: RecordingShields(),
      scheduler: RecordingScheduler(),
      usage: RecordingUsage(),
      away: tracker,
      now: { clock.now }
    )
  }

  @Test func `a session pauses ambient tracking and it resumes when the session ends`() {
    let engine = makeEngine()
    #expect(monitor.isRunning)

    engine.startSession(id: 1, modeName: "Study", endsAt: clock.now.addingTimeInterval(25 * 60), strict: false)
    #expect(!monitor.isRunning)

    _ = engine.endSession(id: 1)
    #expect(monitor.isRunning)
  }

  @Test func `a session the app never ended still resumes ambient tracking at its end time`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: clock.now.addingTimeInterval(25 * 60), strict: false)
    #expect(!monitor.isRunning)

    // The app was killed: only the wake-up extension runs reconcile().
    clock.advance(minutes: 26)
    engine.reconcile()
    #expect(monitor.isRunning)
    #expect(awayStore.read().lastFailure == nil)
  }

  @Test func `a paused session keeps ambient tracking off`() {
    let engine = makeEngine()
    engine.startSession(id: 1, modeName: "Study", endsAt: clock.now.addingTimeInterval(25 * 60), strict: false)
    engine.pauseSession()
    engine.reconcile()
    #expect(!monitor.isRunning)
  }
}
