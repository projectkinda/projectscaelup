import Foundation
import Testing
@testable import ScreenTimeCore

private let t0 = Date(timeIntervalSince1970: 1_800_000_000)
private func at(_ minutes: Double) -> Date { t0.addingTimeInterval(minutes * 60) }

private let policy = ScreenTimePolicy()

private func runningSession(endsInMinutes minutes: Double = 25) -> ScreenTimeState {
  policy.startingSession(id: 7, modeName: "Deep Work", endsAt: at(minutes), in: ScreenTimeState(), at: t0)
}

@Suite("Session lock")
struct SessionLockTests {
  @Test func `a running session locks flagged apps`() {
    #expect(policy.activeShields(in: runningSession()) == [.session])
  }

  @Test func `the session lock lifts when the session ends`() {
    let state = policy.settled(runningSession(endsInMinutes: 25), at: at(25))
    #expect(state.session == nil)
    #expect(policy.activeShields(in: state).isEmpty)
  }

  @Test func `pausing lifts the lock and resuming restores it with the new end time`() {
    let paused = policy.pausingSession(runningSession(), at: at(5))
    #expect(policy.activeShields(in: paused).isEmpty)
    #expect(policy.nextTransition(in: paused, after: at(5)) == at(5).addingTimeInterval(policy.maximumPause))

    let resumed = policy.resumingSession(endsAt: at(40), in: paused, at: at(20))
    #expect(policy.activeShields(in: resumed) == [.session])
    #expect(resumed.session?.endsAt == at(40))
  }

  @Test func `a paused session is not ended by its old end time`() {
    let paused = policy.pausingSession(runningSession(endsInMinutes: 25), at: at(5))
    #expect(policy.settled(paused, at: at(30)).session != nil)
  }

  @Test func `a session abandoned mid-pause is cleared eventually`() {
    let paused = policy.pausingSession(runningSession(), at: at(5))
    let later = at(5).addingTimeInterval(policy.maximumPause + 1)
    #expect(policy.settled(paused, at: later).session == nil)
  }

  @Test func `starting a session drops distractions left over from an earlier one`() {
    var state = ScreenTimeState(pendingDistractions: [Distraction(sessionId: 3, occurredAt: t0)])
    state = policy.startingSession(id: 7, modeName: "Study", endsAt: at(10), in: state, at: t0)
    #expect(state.pendingDistractions.isEmpty)
  }
}

@Suite("Open anyway and visits (partner feedback F2)")
struct OpenAnywayTests {
  @Test func `open anyway counts one distraction and unlocks for the grace period`() {
    let (state, outcome) = policy.openingAnyway(runningSession(), at: at(3))
    #expect(outcome == .unlocked(countedAsDistraction: true))
    #expect(state.pendingDistractions == [Distraction(sessionId: 7, occurredAt: at(3))])
    #expect(policy.activeShields(in: state).isEmpty)
    #expect(state.session?.graceUntil == at(5))
  }

  @Test func `the lock returns when the grace period ends`() {
    let (unlocked, _) = policy.openingAnyway(runningSession(), at: at(3))
    let relocked = policy.settled(unlocked, at: at(5))
    #expect(policy.activeShields(in: relocked) == [.session])
    #expect(relocked.session?.lastGraceEndedAt == at(5))
  }

  @Test func `one long scroll across several re-locks is one distraction`() {
    var state = runningSession(endsInMinutes: 30)
    // Opens at 3, re-locks at 5, re-opens 20 s later, re-locks at 7:20, re-opens 30 s later.
    for minute in [3.0, 5.0 + 20.0 / 60, 7.0 + 20.0 / 60 + 0.5] {
      state = policy.openingAnyway(state, at: at(minute)).state
    }
    #expect(state.pendingDistractions.count == 1)
  }

  @Test func `coming back after the same-visit window is a new distraction`() {
    var state = policy.openingAnyway(runningSession(), at: at(3)).state
    let (next, outcome) = policy.openingAnyway(state, at: at(5 + 1.5))
    state = next
    #expect(outcome == .unlocked(countedAsDistraction: true))
    #expect(state.pendingDistractions.count == 2)
  }

  @Test func `grace never outlasts the session`() {
    let state = policy.openingAnyway(runningSession(endsInMinutes: 4), at: at(3)).state
    #expect(state.session?.graceUntil == at(4))
  }

  @Test func `open anyway is refused during a lockdown`() {
    var state = policy.lockingDown(until: at(12), in: runningSession(), at: t0)
    let result = policy.openingAnyway(state, at: at(1))
    state = result.state
    #expect(result.outcome == .refused)
    #expect(state.pendingDistractions.isEmpty)
  }

  @Test func `open anyway is refused when no session is running`() {
    #expect(policy.openingAnyway(ScreenTimeState(), at: t0).outcome == .refused)
  }
}

@Suite("Ending and lockdown")
struct EndingAndLockdownTests {
  @Test func `ending returns that session's distractions and clears them`() {
    let state = policy.openingAnyway(runningSession(), at: at(3)).state
    let ended = policy.endingSession(id: 7, in: state)
    #expect(ended.distractions.count == 1)
    #expect(ended.state.session == nil)
    #expect(ended.state.pendingDistractions.isEmpty)
  }

  @Test func `ending a different session leaves the running one alone`() {
    let ended = policy.endingSession(id: 99, in: runningSession())
    #expect(ended.state.session?.id == 7)
    #expect(ended.distractions.isEmpty)
  }

  @Test func `a lockdown locks until it expires`() {
    let state = policy.lockingDown(until: at(12), in: ScreenTimeState(), at: t0)
    #expect(policy.activeShields(in: state) == [.lockdown])
    #expect(policy.settled(state, at: at(12)).lockdown == nil)
  }

  @Test func `a lockdown is never shortened`() {
    var state = policy.lockingDown(until: at(30), in: ScreenTimeState(), at: t0)
    state = policy.lockingDown(until: at(12), in: state, at: at(1))
    #expect(state.lockdown?.until == at(30))
  }

  @Test func `a lockdown in the past is ignored`() {
    #expect(policy.lockingDown(until: at(-1), in: ScreenTimeState(), at: t0).lockdown == nil)
  }

  @Test func `flagged apps are editable only when nothing is locked`() {
    #expect(policy.canEditFlaggedApps(in: ScreenTimeState()))
    #expect(!policy.canEditFlaggedApps(in: runningSession()))
    #expect(!policy.canEditFlaggedApps(in: policy.lockingDown(until: at(10), in: ScreenTimeState(), at: t0)))
  }

  @Test func `the next transition is the earliest pending change`() {
    var state = policy.openingAnyway(runningSession(endsInMinutes: 25), at: at(3)).state
    state = policy.lockingDown(until: at(40), in: state, at: at(3))
    #expect(policy.nextTransition(in: state, after: at(3)) == at(5))
    #expect(policy.nextTransition(in: ScreenTimeState(), after: t0) == nil)
  }
}

@Suite("Lock screen text")
struct ShieldCopyTests {
  @Test func `session copy offers a way out and shows minutes left`() {
    let copy = policy.shieldCopy(for: runningSession(endsInMinutes: 12), appName: "Instagram", at: at(0.5))
    #expect(copy.title == "Instagram is paused")
    #expect(copy.subtitle == "You're in a Deep Work session. 12 min left.")
    #expect(copy.secondaryButton == "Open anyway")
  }

  @Test func `lockdown copy has no way out and wins over a session`() {
    let state = policy.lockingDown(until: at(1), in: runningSession(), at: t0)
    let copy = policy.shieldCopy(for: state, appName: nil, at: t0)
    #expect(copy.title == "This app is locked")
    #expect(copy.subtitle == "Locked after your focus session. 1 min left.")
    #expect(copy.secondaryButton == nil)
  }
}
