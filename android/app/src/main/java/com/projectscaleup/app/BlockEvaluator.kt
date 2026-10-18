package com.projectscaleup.app

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

enum class BlockReason { LOCKDOWN, SCHEDULE, LIMIT }
data class BlockInfo(val reason: BlockReason, val untilMs: Long, val detail: String = "")
data class RuleVersion(
  val ruleId: String, val kind: String, val apps: List<String>, val days: Int = 0,
  val startMin: Int = 0, val endMin: Int = 0, val limitMinutes: Int = 0,
  val enforcedUntilMs: Long? = null,
)

/** No Android dependencies. All windows use calendar dates in the supplied zone. */
object BlockEvaluator {
  fun midnight(nowMs: Long, zone: ZoneId): Long = Instant.ofEpochMilli(nowMs).atZone(zone)
    .toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
  private fun window(v: RuleVersion, day: LocalDate, zone: ZoneId): Pair<Long, Long>? {
    if (v.kind != "schedule" || v.days and (1 shl (day.dayOfWeek.value - 1)) == 0) return null
    val start = day.atTime(v.startMin / 60, v.startMin % 60).atZone(zone).toInstant().toEpochMilli()
    val endDay = if (v.endMin <= v.startMin) day.plusDays(1) else day
    val end = endDay.atTime(v.endMin / 60, v.endMin % 60).atZone(zone).toInstant().toEpochMilli()
    return start to end
  }
  fun evaluate(
    versions: List<RuleVersion>, usage: Map<String, Long>, pkg: String, nowMs: Long, zone: ZoneId,
    lockdownUntilMs: Long? = null, rulesEnabled: Boolean = true, excluded: Set<String> = emptySet(),
  ): BlockInfo? {
    if (!AppRuleDenylist.allows(pkg, excluded)) return null
    val matches = mutableListOf<BlockInfo>()
    if (lockdownUntilMs != null && lockdownUntilMs > nowMs) matches.add(BlockInfo(BlockReason.LOCKDOWN, lockdownUntilMs))
    if (rulesEnabled) {
      val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
      for (v in versions) {
        if (pkg !in v.apps || (v.enforcedUntilMs != null && v.enforcedUntilMs <= nowMs)) continue
        val cap = v.enforcedUntilMs ?: Long.MAX_VALUE
        if (v.kind == "schedule") {
          for (day in listOf(today.minusDays(1), today)) {
            val (start, end) = window(v, day, zone) ?: continue
            if (nowMs >= start && nowMs < end) matches.add(BlockInfo(BlockReason.SCHEDULE, minOf(end, cap), "Your schedule"))
          }
        } else if (v.kind == "limit" && v.limitMinutes > 0 &&
          v.apps.distinct().filter { AppRuleDenylist.allows(it, excluded) }.sumOf { usage[it]?.coerceAtLeast(0) ?: 0L } >= v.limitMinutes * 60_000L) {
          matches.add(BlockInfo(BlockReason.LIMIT, minOf(midnight(nowMs, zone), cap), formatBudget(v.limitMinutes)))
        }
      }
    }
    return matches.maxByOrNull { it.untilMs }
  }
  fun nextTransition(versions: List<RuleVersion>, usage: Map<String, Long>, pkg: String, nowMs: Long, zone: ZoneId): Long {
    val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
    val candidates = mutableListOf(midnight(nowMs, zone))
    for (v in versions) {
      if (pkg !in v.apps || (v.enforcedUntilMs != null && v.enforcedUntilMs <= nowMs)) continue
      v.enforcedUntilMs?.let { candidates.add(it) }
      if (v.kind == "schedule") {
        for (offset in -1L..7L) {
          val (start, end) = window(v, today.plusDays(offset), zone) ?: continue
          if (start < (v.enforcedUntilMs ?: Long.MAX_VALUE)) candidates.add(start)
          candidates.add(minOf(end, v.enforcedUntilMs ?: Long.MAX_VALUE))
        }
      } else if (v.kind == "limit") {
        val used = v.apps.distinct().sumOf { usage[it]?.coerceAtLeast(0) ?: 0L }
        val remaining = v.limitMinutes * 60_000L - used
        if (remaining > 0) candidates.add(nowMs + remaining)
      }
    }
    return candidates.filter { it > nowMs }.minOrNull() ?: midnight(nowMs, zone)
  }
  fun formatBudget(minutes: Int): String = when {
    minutes < 60 -> minutes.toString() + "m"
    minutes % 60 == 0 -> (minutes / 60).toString() + "h"
    else -> (minutes / 60).toString() + "h " + (minutes % 60) + "m"
  }
}
