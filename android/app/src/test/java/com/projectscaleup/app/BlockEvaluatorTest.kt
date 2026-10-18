package com.projectscaleup.app

import org.junit.Assert.*
import org.junit.Test
import java.time.ZonedDateTime
import java.time.ZoneId

class BlockEvaluatorTest {
  private val zone = ZoneId.of("America/New_York")
  private val app = "example.social"
  private fun time(value: String) = ZonedDateTime.parse(value + "[America/New_York]").toInstant().toEpochMilli()
  private val noon = time("2026-10-19T12:00:00-04:00") // Monday
  private val schedule = RuleVersion("s", "schedule", listOf(app), 1, 11 * 60, 13 * 60)
  private val limit = RuleVersion("l", "limit", listOf(app, "example.video"), limitMinutes = 5)
  private fun checkBlock(v: List<RuleVersion>, now: Long = noon, used: Map<String, Long> = emptyMap()) =
    BlockEvaluator.evaluate(v, used, app, now, zone)

  @Test fun scheduleInsideOutsideAndEndExclusive() {
    assertEquals(BlockReason.SCHEDULE, checkBlock(listOf(schedule))?.reason)
    assertNull(checkBlock(listOf(schedule), time("2026-10-19T10:59:59-04:00")))
    assertNull(checkBlock(listOf(schedule), time("2026-10-19T13:00:00-04:00")))
    assertNull(checkBlock(listOf(schedule), time("2026-10-20T12:00:00-04:00")))
  }
  @Test fun crossingMidnightUsesStartWeekday() {
    val v = schedule.copy(startMin = 23 * 60, endMin = 60)
    assertNotNull(checkBlock(listOf(v), time("2026-10-20T00:30:00-04:00")))
    assertNull(checkBlock(listOf(v), time("2026-10-19T00:30:00-04:00")))
    assertNull(checkBlock(listOf(v), time("2026-10-20T01:00:00-04:00")))
  }
  @Test fun equalTimesMeanFullStartDay() {
    val v = schedule.copy(startMin = 600, endMin = 600)
    assertNotNull(checkBlock(listOf(v), time("2026-10-20T09:59:00-04:00")))
    assertNull(checkBlock(listOf(v), time("2026-10-20T10:00:00-04:00")))
  }
  @Test fun sharedBudgetUnderAtAndOver() {
    assertNull(checkBlock(listOf(limit), used = mapOf(app to 299_999L)))
    val used = mapOf(app to 120_000L, "example.video" to 180_000L)
    assertEquals(BlockReason.LIMIT, checkBlock(listOf(limit), used = used)?.reason)
    assertEquals(BlockEvaluator.midnight(noon, zone), checkBlock(listOf(limit), used = used)?.untilMs)
    assertNotNull(checkBlock(listOf(limit), used = mapOf(app to 999_999L)))
  }
  @Test fun previousVersionsExpireExactlyAtMidnightAndCapLongWindows() {
    val midnight = BlockEvaluator.midnight(noon, zone)
    val v = schedule.copy(startMin = 0, endMin = 0, enforcedUntilMs = midnight)
    assertEquals(midnight, checkBlock(listOf(v))?.untilMs)
    assertNull(checkBlock(listOf(v), midnight))
  }
  @Test fun latestEndWinsIncludingLockdown() {
    val rules = listOf(schedule)
    assertEquals(BlockReason.SCHEDULE, BlockEvaluator.evaluate(rules, emptyMap(), app, noon, zone, noon + 60_000)?.reason)
    assertEquals(BlockReason.LOCKDOWN, BlockEvaluator.evaluate(rules, emptyMap(), app, noon, zone, noon + 7_200_000)?.reason)
    assertEquals(BlockReason.LIMIT, checkBlock(listOf(schedule, limit), used = mapOf(app to 300_000L))?.reason)
  }
  @Test fun unpaidHasNoRuleEnforcementAndDoesNotChangeExistingLockdown() {
    assertNull(BlockEvaluator.evaluate(listOf(schedule, limit), mapOf(app to 300_000L), app, noon, zone, rulesEnabled = false))
    assertEquals(BlockReason.LOCKDOWN, BlockEvaluator.evaluate(listOf(schedule), emptyMap(), app, noon, zone, noon + 60_000, false)?.reason)
  }
  @Test fun protectedPackagesNeverBlockOrContributeToBudget() {
    for (pkg in AppRuleDenylist.PACKAGES + "vendor.keyboard" + "vendor.inputmethod" + "vendor.emergency") {
      assertNull(BlockEvaluator.evaluate(listOf(schedule.copy(apps = listOf(pkg))), emptyMap(), pkg, noon, zone, noon + 60_000))
    }
    assertNull(BlockEvaluator.evaluate(listOf(limit.copy(apps = listOf(app, "com.android.settings"))), mapOf("com.android.settings" to 999_999L), app, noon, zone))
    assertNull(BlockEvaluator.evaluate(listOf(schedule), emptyMap(), app, noon, zone, excluded = setOf(app)))
  }
  @Test fun nextScheduleAndBudgetFireMidUse() {
    val before = time("2026-10-19T10:59:00-04:00")
    assertEquals(time("2026-10-19T11:00:00-04:00"), BlockEvaluator.nextTransition(listOf(schedule), emptyMap(), app, before, zone))
    assertEquals(noon + 10_000L, BlockEvaluator.nextTransition(listOf(limit), mapOf(app to 290_000L), app, noon, zone))
  }
  @Test fun dstUsesCalendarMidnightsNotTwentyFourHours() {
    val spring = time("2026-03-08T00:00:00-05:00")
    val autumn = time("2026-11-01T00:00:00-04:00")
    assertEquals(23 * 3_600_000L, BlockEvaluator.midnight(spring, zone) - spring)
    assertEquals(25 * 3_600_000L, BlockEvaluator.midnight(autumn, zone) - autumn)
    val v = schedule.copy(days = 64, startMin = 90, endMin = 210)
    val result = checkBlock(listOf(v), time("2026-03-08T03:00:00-04:00"))
    assertEquals(time("2026-03-08T03:30:00-04:00"), result?.untilMs)
  }
  @Test fun expiredVersionsCannotScheduleFurtherWakeups() {
    val retired = schedule.copy(enforcedUntilMs = noon)
    assertEquals(BlockEvaluator.midnight(noon, zone), BlockEvaluator.nextTransition(listOf(retired), emptyMap(), app, noon, zone))
  }
  @Test fun budgetFormatting() {
    assertEquals("5h", BlockEvaluator.formatBudget(300))
    assertEquals("1h 30m", BlockEvaluator.formatBudget(90))
    assertEquals("5m", BlockEvaluator.formatBudget(5))
  }
}
