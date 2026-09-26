import Foundation
import Testing
@testable import ScreenTimeCore

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private func minutes(_ value: Double) -> Date { now.addingTimeInterval(value * 60) }

@Suite("Wake planning (15-min minimum, 44-min hops)")
struct WakePlannerTests {
  @Test func `short waits use a 15 minute interval with a warning`() {
    let window = WakePlanner.window(toWakeAt: minutes(2), now: now)
    #expect(window.end == minutes(15))
    #expect(window.warningMinutes == 13)
    #expect(window.wakesAt == minutes(2))
  }

  @Test func `partial minutes round so the wake-up is never early`() {
    let window = WakePlanner.window(toWakeAt: minutes(2.5), now: now)
    #expect(window.warningMinutes == 12)
    #expect(window.wakesAt == minutes(3))
  }

  @Test func `a ten minute lockdown wakes at ten minutes (partner feedback F1)`() {
    #expect(WakePlanner.window(toWakeAt: minutes(10), now: now).wakesAt == minutes(10))
  }

  @Test func `waits between 15 and 44 minutes end exactly on time`() {
    let window = WakePlanner.window(toWakeAt: minutes(30), now: now)
    #expect(window.end == minutes(30))
    #expect(window.warningMinutes == nil)
  }

  @Test func `long waits hop at most 44 minutes`() {
    let window = WakePlanner.window(toWakeAt: minutes(60), now: now)
    #expect(window.end == minutes(44))
    #expect(window.warningMinutes == nil)
  }

  @Test func `overdue targets get the minimum lead time`() {
    let window = WakePlanner.window(toWakeAt: minutes(-5), now: now)
    #expect(window.wakesAt == minutes(1))
  }

  @Test func `a wait just under 15 minutes needs no warning`() {
    let window = WakePlanner.window(toWakeAt: minutes(14.5), now: now)
    #expect(window.warningMinutes == nil)
    #expect(window.end == minutes(15))
  }
}
