package com.projectscaleup.app

import android.content.Context
import java.time.Instant
import java.time.ZoneId
import org.json.JSONObject

/** Aggregate milliseconds only: no visit log, window content, or unrelated apps. */
object UsageLedger {
  private fun prefs(context: Context) = context.getSharedPreferences("project_scaleup_rule_usage", Context.MODE_PRIVATE)
  private fun day(now: Long, zone: ZoneId) = Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toString()
  @Synchronized fun today(context: Context, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): Map<String, Long> {
    val prefs = prefs(context)
    if (prefs.getString("date", "") != day(now, zone)) {
      prefs.edit().putString("date", day(now, zone)).putString("usage", "{}").commit()
      return emptyMap()
    }
    val json = runCatching { JSONObject(prefs.getString("usage", "{}") ?: "{}") }.getOrDefault(JSONObject())
    return json.keys().asSequence().associateWith { json.optLong(it, 0).coerceAtLeast(0) }
  }
  @Synchronized fun add(context: Context, pkg: String, startMs: Long, endMs: Long, elapsedMs: Long) {
    if (pkg !in RuleStore.trackedPackages(context, startMs) || pkg !in RuleStore.trackedPackages(context, endMs) || !AppRuleDenylist.allows(pkg, AppRulePackages.excluded(context))) return
    val zone = ZoneId.systemDefault()
    val midnight = Instant.ofEpochMilli(endMs).atZone(zone).toLocalDate().atStartOfDay(zone).toInstant().toEpochMilli()
    val amount = minOf(elapsedMs.coerceAtLeast(0), (endMs - maxOf(startMs, midnight)).coerceAtLeast(0))
    val usage = today(context, endMs, zone).toMutableMap()
    if (amount > 0) usage[pkg] = (usage[pkg] ?: 0) + amount
    prefs(context).edit().putString("date", day(endMs, zone)).putString("usage", JSONObject(usage as Map<*, *>).toString()).commit()
  }
}
