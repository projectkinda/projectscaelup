package com.projectscaleup.app

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class DailyLimitCopyTest {
  private val zone = ZoneId.of("America/New_York")
  private fun time(value: String) = ZonedDateTime.parse(value + "[America/New_York]").toInstant().toEpochMilli()

  @Test fun springResetUsesThe23HourCalendarDay() {
    val now = time("2026-03-08T00:00:00-05:00")
    val reset = BlockEvaluator.midnight(now, zone)
    assertEquals(time("2026-03-09T00:00:00-04:00"), reset)
    assertEquals("23h 0m", DailyLimitCopy.resetCountdown(now, reset))
    assertEquals("12:00 am", DailyLimitCopy.resetTime(reset, zone, false))
    assertEquals("00:00", DailyLimitCopy.resetTime(reset, zone, true))
  }
  @Test fun autumnResetUsesThe25HourCalendarDay() {
    val now = time("2026-11-01T00:00:00-04:00")
    val reset = BlockEvaluator.midnight(now, zone)
    assertEquals(time("2026-11-02T00:00:00-05:00"), reset)
    assertEquals("25h 0m", DailyLimitCopy.resetCountdown(now, reset))
    assertEquals("12:00 am", DailyLimitCopy.resetTime(reset, zone, false))
    assertEquals("00:00", DailyLimitCopy.resetTime(reset, zone, true))
  }
  @Test fun underAnHourAndExactlyAnHour() {
    val now = time("2026-10-19T23:18:00-04:00")
    val reset = BlockEvaluator.midnight(now, zone)
    assertEquals("42 min", DailyLimitCopy.resetCountdown(now, reset))
    assertEquals("1h 0m", DailyLimitCopy.resetCountdown(reset - 3_600_000, reset))
    assertEquals("1h 7m", DailyLimitCopy.resetCountdown(reset - 4_020_000, reset))
  }
  @Test fun roundsUpAndTicksDownWithoutGoingNegativeAcrossMidnight() {
    val reset = time("2027-01-01T00:00:00-05:00")
    assertEquals("2 min", DailyLimitCopy.resetCountdown(reset - 60_001, reset))
    assertEquals("1 min", DailyLimitCopy.resetCountdown(reset - 60_000, reset))
    assertEquals("1 min", DailyLimitCopy.resetCountdown(reset - 1, reset))
    assertEquals("0 min", DailyLimitCopy.resetCountdown(reset, reset))
    assertEquals("0 min", DailyLimitCopy.resetCountdown(reset + 1, reset))
    assertEquals("12:00 am", DailyLimitCopy.resetTime(reset, zone, false))
    assertEquals("00:00", DailyLimitCopy.resetTime(reset, zone, true))
  }
  @Test fun formatsTheSuppliedLocalInstantInBothClockModes() {
    // Some zones have historical midnight gaps: format the engine's instant, not a literal midnight.
    val instant = time("2026-10-19T17:05:00-04:00")
    assertEquals("5:05 pm", DailyLimitCopy.resetTime(instant, zone, false))
    assertEquals("17:05", DailyLimitCopy.resetTime(instant, zone, true))
  }
}
