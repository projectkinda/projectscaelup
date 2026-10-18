package com.projectscaleup.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object RuleStore {
  private fun prefs(context: Context) = context.getSharedPreferences("project_scaleup_app_rules", Context.MODE_PRIVATE)
  fun setTestToolsEnabled(context: Context, enabled: Boolean) {
    check(prefs(context).edit().putBoolean("test_tools", enabled).commit()) { "Could not persist test tools flag" }
  }
  fun enabled(context: Context): Boolean = prefs(context).getBoolean("enabled", false)
  /** Only AppRulesBridge writes this store. Empty sync disables rules, never lockdowns. */
  @Synchronized fun set(context: Context, json: String) {
    val array = JSONArray(json)
    val excluded = AppRulePackages.excluded(context)
    val testTools = prefs(context).getBoolean("test_tools", false)
    val clean = JSONArray()
    for (i in 0 until array.length()) {
      val row = array.getJSONObject(i)
      val v = parse(row) ?: continue
      val apps = v.apps.filter { AppRuleDenylist.allows(it, excluded) }.distinct()
      if (apps.isEmpty() || v.apps.size > 20 || !valid(v, testTools)) continue
      row.put("apps", JSONArray(apps)); clean.put(row)
    }
    check((0 until clean.length()).map { clean.getJSONObject(it).getString("ruleId") }.toSet().size <= 10) { "Too many app rules" }
    check(prefs(context).edit().putString("versions", clean.toString()).putBoolean("enabled", clean.length() > 0).commit()) { "Could not persist app rules" }
  }
  fun versions(context: Context, now: Long = System.currentTimeMillis()): List<RuleVersion> {
    if (!enabled(context)) return emptyList()
    return runCatching {
      val array = JSONArray(prefs(context).getString("versions", "[]") ?: "[]")
      val testTools = prefs(context).getBoolean("test_tools", false)
      (0 until array.length()).mapNotNull { parse(array.getJSONObject(it)) }.filter { valid(it, testTools) }
        .filter { it.enforcedUntilMs == null || it.enforcedUntilMs > now }
    }.getOrDefault(emptyList())
  }
  fun trackedPackages(context: Context, now: Long = System.currentTimeMillis()): Set<String> {
    val excluded = AppRulePackages.excluded(context)
    return versions(context, now).filter { it.kind == "limit" }.flatMap { it.apps }
      .filter { AppRuleDenylist.allows(it, excluded) }.toSet()
  }
  private fun valid(v: RuleVersion, testTools: Boolean): Boolean {
    if (v.apps.isEmpty() || v.apps.size > 20) return false
    if (v.kind == "limit") return v.limitMinutes in (if (testTools) 1 else 5)..1440
    val duration = (v.endMin - v.startMin + 1440) % 1440
    return v.kind == "schedule" && v.days in 1..127 && v.startMin in 0..1439 && v.endMin in 0..1439 &&
      (if (duration == 0) 1440 else duration) >= (if (testTools) 1 else 15)
  }
  private fun parse(row: JSONObject): RuleVersion? = runCatching {
    if (row.has("enabled") && !row.optBoolean("enabled", true)) return null
    val kind = row.getString("kind")
    if (kind !in listOf("schedule", "limit")) return null
    val apps = row.getJSONArray("apps")
    RuleVersion(row.getString("ruleId"), kind, (0 until apps.length()).map { apps.getString(it) },
      row.optInt("days", 0), row.optInt("startMin", 0), row.optInt("endMin", 0), row.optInt("limitMinutes", 0),
      if (row.has("enforcedUntilMs") && !row.isNull("enforcedUntilMs")) row.getLong("enforcedUntilMs") else null)
  }.getOrNull()
}
