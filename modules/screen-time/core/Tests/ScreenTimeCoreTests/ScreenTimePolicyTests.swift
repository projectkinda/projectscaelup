import Foundation
import Testing
@testable import ScreenTimeCore

private let t0 = Date(timeIntervalSince1970: 1_800_000_000)
private func at(_ minutes: Double) -> Date { t0.addingTimeInterval(minutes * 60) }

private let policy = ScreenTimePolicy()

private func session(endsInMinutes minutes: Double = 25, strict: Bool = false) -> ScreenTimeState {
  policy.startingSession(id: 7, modeName: "Deep Work", endsAt: at(minutes), strict: strict, in: ScreenTimeState(), at: t0)
}

@Suite("Silent tracking (default, matches Android)")
struct SilentTrackingTests {
  @Test func `a normal session never locks flagged apps`() {
    #expect(policy.shieldPlan(in: session()) == .none)
  }

  @Test func `a normal session monitors usage from its start to its end`() {
    let plan = policy.usagePlan(in: session(endsInMinutes: 25))
    #expect(plan?.start == t0)
    #expect(plan?.end == at(25))
    #expect(plan?.threshold == 60)
  }

  @Test func `short sessions still get DeviceActivity's 15 minute minimum interval`() {
    #expect(policy.usagePlan(in: session(endsInMinutes: 10))?.end == at(15))
  }

  @Test func `passing the threshold in a flagged app counts one distraction for that app`() {
    let (state, counted) = policy.recordingUsage(appKey: "insta", in: session(), at: at(3))
    #expect(counted)
    #expect(state.pendingDistractions == [Distraction(sessionId: 7, occurredAt: at(3), appKey: "insta")])
  }

  @Test func `each app counts once per session and stops being watched`() {
    var state = policy.recordingUsage(appKey: "insta", in: session(), at: at(3)).state
    let again = policy.recordingUsage(appKey: "insta", in: state, at: at(9))
    state = again.state
    #expect(!again.counted)
    #expect(policy.usagePlan(in: state)?.excludedAppKeys == ["insta"])
    state = policy.recordingUsage(appKey: "tiktok", in: state, at: at(10)).state
    #expect(state.pendingDistractions.map(\.appKey) == ["insta", "tiktok"])
  }

  @Test func `reports in the first seconds are ignored (iOS 26 fires some immediately)`() {
    #expect(!policy.recordingUsage(appKey: "insta", in: session(), at: t0.addingTimeInterval(3)).counted)
  }

  @Test func `use after the session's real end is ignored`() {
    // A 10 minute session is monitored for 15 minutes; minute 12 is outside it.
    #expect(!policy.recordingUsage(appKey: "insta", in: session(endsInMinutes: 10), at: at(12)).counted)
  }

  @Test func `pausing stops monitoring and resuming starts a fresh segment`() {
    var state = policy.recordingUsage(appKey: "insta", in: session(), at: at(3)).state
    state = policy.pausingSession(state, at: at(5))
    #expect(policy.usagePlan(in: state) == nil)
    #expect(!policy.recordingUsage(appKey: "tiktok", in: state, at: at(6)).counted)

    state = policy.resumingSession(endsAt: at(30), in: state, at: at(8))
    let plan = policy.usagePlan(in: state)
    #expect(plan?.segment == 1)
    #expect(plan?.start == at(8))
    #expect(plan?.excludedAppKeys == ["insta"])
  }

  @Test func `restarting the same session (+5 min) keeps what it counted`() {
    var state = policy.recordingUsage(appKey: "insta", in: session(endsInMinutes: 10), at: at(3)).state
    state = policy.settled(state, at: at(10))
    state = policy.startingSession(id: 7, modeName: "Deep Work", endsAt: at(15), strict: false, in: state, at: at(10))
    #expect(!policy.recordingUsage(appKey: "insta", in: state, at: at(12)).counted)
    #expect(state.pendingDistractions.count == 1)
  }

  @Test func `strict sessions don't use silent tracking`() {
    #expect(policy.usagePlan(in: session(strict: true)) == nil)
    #expect(!policy.recordingUsage(appKey: "insta", in: session(strict: true), at: at(3)).counted)
  }
}

@Suite("Strict mode (optional live lock)")
struct StrictModeTests {
  @Test func `a strict session locks flagged apps until it ends`() {
    #expect(policy.shieldPlan(in: session(strict: true)).session)
    #expect(!policy.shieldPlan(in: policy.settled(session(strict: true), at: at(25))).session)
  }

  @Test func `open anyway counts one distraction and unlocks for the grace period`() {
    let (state, outcome) = policy.openingAnyway(session(strict: true), at: at(3))
    #expect(outcome == .unlocked(countedAsDistraction: true))
    #expect(state.pendingDistractions == [Distraction(sessionId: 7, occurredAt: at(3), appKey: nil)])
    #expect(!policy.shieldPlan(in: state).session)
    #expect(state.session?.graceUntil == at(5))
  }

  @Test func `the lock returns when the grace period ends`() {
    let (unlocked, _) = policy.openingAnyway(session(strict: true), at: at(3))
    #expect(policy.shieldPlan(in: policy.settled(unlocked, at: at(5))).session)
  }

  @Test func `one long scroll across several re-locks is one distraction`() {
    var state = session(endsInMinutes: 30, strict: true)
    for minute in [3.0, 5.0 + 20.0 / 60, 7.0 + 20.0 / 60 + 0.5] {
      state = policy.openingAnyway(state, at: at(minute)).state
    }
    #expect(state.pendingDistractions.count == 1)
  }

  @Test func `coming back after the same-visit window is a new distraction`() {
    let state = policy.openingAnyway(session(strict: true), at: at(3)).state
    #expect(policy.openingAnyway(state, at: at(6.5)).outcome == .unlocked(countedAsDistraction: true))
  }

  @Test func `open anyway is refused outside strict mode and during a lockdown`() {
    #expect(policy.openingAnyway(session(), at: at(1)).outcome == .refused)
    let locked = policy.lockingDown(until: at(12), apps: .all, in: session(strict: true), at: t0)
    #expect(policy.openingAnyway(locked, at: at(1)).outcome == .refused)
  }
}

@Suite("Sessions")
struct SessionTests {
  @Test func `a session paused past the limit is abandoned`() {
    let paused = policy.pausingSession(session(), at: at(5))
    #expect(policy.settled(paused, at: at(30)).session != nil)
    #expect(policy.settled(paused, at: at(5).addingTimeInterval(policy.maximumPause + 1)).session == nil)
  }

  @Test func `starting a session drops distractions left over from another one`() {
    let state = ScreenTimeState(pendingDistractions: [Distraction(sessionId: 3, occurredAt: t0, appKey: "x")])
    #expect(policy.startingSession(id: 7, modeName: "Study", endsAt: at(10), strict: false, in: state, at: t0)
      .pendingDistractions.isEmpty)
  }

  @Test func `ending returns that session's distractions and clears them`() {
    let state = policy.recordingUsage(appKey: "insta", in: session(), at: at(3)).state
    let ended = policy.endingSession(id: 7, in: state)
    #expect(ended.distractions.map(\.appKey) == ["insta"])
    #expect(ended.state.session == nil)
    #expect(ended.state.pendingDistractions.isEmpty)
  }

  @Test func `flagged apps are editable only when nothing is running or locked`() {
    #expect(policy.canEditFlaggedApps(in: ScreenTimeState()))
    #expect(!policy.canEditFlaggedApps(in: session()))
  }
}

@Suite("Lockdown")
struct LockdownTests {
  @Test func `a lockdown shields only the apps that were used`() {
    let state = policy.lockingDown(until: at(12), apps: .only(["insta"]), in: ScreenTimeState(), at: t0)
    #expect(policy.shieldPlan(in: state).lockdown == .only(["insta"]))
    #expect(policy.settled(state, at: at(12)).lockdown == nil)
  }

  @Test func `extending a lockdown keeps the longer time and both sets of apps`() {
    var state = policy.lockingDown(until: at(30), apps: .only(["insta"]), in: ScreenTimeState(), at: t0)
    state = policy.lockingDown(until: at(12), apps: .only(["tiktok"]), in: state, at: at(1))
    #expect(state.lockdown == Lockdown(until: at(30), apps: .only(["insta", "tiktok"])))
    state = policy.lockingDown(until: at(20), apps: .all, in: state, at: at(1))
    #expect(state.lockdown?.apps == .all)
  }

  @Test func `a lockdown in the past is ignored`() {
    #expect(policy.lockingDown(until: at(-1), apps: .all, in: ScreenTimeState(), at: t0).lockdown == nil)
  }

  @Test func `the next transition is the earliest pending change`() {
    var state = policy.openingAnyway(session(endsInMinutes: 25, strict: true), at: at(3)).state
    state = policy.lockingDown(until: at(40), apps: .all, in: state, at: at(3))
    #expect(policy.nextTransition(in: state, after: at(3)) == at(5))
  }
}

@Suite("Lock screen text")
struct ShieldCopyTests {
  @Test func `strict session copy offers a way out and shows minutes left`() {
    let copy = policy.shieldCopy(for: session(endsInMinutes: 12, strict: true), appName: "Instagram", at: at(0.5))
    #expect(copy.title == "Instagram is paused")
    #expect(copy.subtitle == "You're in a Deep Work session. 12 min left.")
    #expect(copy.secondaryButton == "Open anyway")
  }

  @Test func `lockdown copy has no way out`() {
    let state = policy.lockingDown(until: at(1), apps: .all, in: ScreenTimeState(), at: t0)
    let copy = policy.shieldCopy(for: state, appName: nil, at: t0)
    #expect(copy.title == "This app is locked")
    #expect(copy.secondaryButton == nil)
  }
}
