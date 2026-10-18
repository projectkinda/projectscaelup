package com.projectscaleup.app

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Presentation only: the engine supplies the actual local-midnight reset instant. */
object DailyLimitCopy {
  fun resetTime(resetAtMs: Long, zone: ZoneId, use24Hour: Boolean): String =
    DateTimeFormatter.ofPattern(if (use24Hour) "HH:mm" else "h:mm a", Locale.US)
      .format(Instant.ofEpochMilli(resetAtMs).atZone(zone)).lowercase(Locale.US)

  fun resetCountdown(nowMs: Long, resetAtMs: Long): String {
    // Round up so an active block never promises a reset before it happens.
    val remainingMs = (resetAtMs - nowMs).coerceAtLeast(0)
    val minutes = remainingMs / 60_000 + if (remainingMs % 60_000 > 0) 1 else 0
    return if (minutes < 60) "$minutes min" else "${minutes / 60}h ${minutes % 60}m"
  }
}
