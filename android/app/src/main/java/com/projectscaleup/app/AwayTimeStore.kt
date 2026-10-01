package com.projectscaleup.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object AwayTimeStore {
  private const val PREFS_NAME = "project_scaleup_away_time"
  private const val FLAGGED_PACKAGES_KEY = "flagged_packages"
  private const val USE_LOG_KEY = "use_log"
  private const val GAP_LOG_KEY = "gap_log"
  private const val LAST_USED_AT_PREFIX = "last_used_at_"
  private const val LAST_HEARTBEAT_MS_KEY = "last_heartbeat_ms"
  private const val TRACKING_ENABLED_KEY = "tracking_enabled"
  private const val TRACKING_DISABLED_AT_MS_KEY = "tracking_disabled_at_ms"
  private const val LAST_FAILURE_MESSAGE_KEY = "last_failure_message"
  private const val LAST_FAILURE_AT_MS_KEY = "last_failure_at_ms"
  private const val MAX_BUFFERED_ROWS = 500

  fun setFlaggedPackages(context: Context, packages: Set<String>) {
    prefs(context).edit().putStringSet(FLAGGED_PACKAGES_KEY, packages).apply()
  }

  fun getFlaggedPackages(context: Context): Set<String> =
    prefs(context).getStringSet(FLAGGED_PACKAGES_KEY, emptySet()) ?: emptySet()

  fun setTrackingEnabled(context: Context, enabled: Boolean) {
    val prefs = prefs(context)
    val wasEnabled = prefs.getBoolean(TRACKING_ENABLED_KEY, false)
    val now = System.currentTimeMillis()
    val editor = prefs.edit().putBoolean(TRACKING_ENABLED_KEY, enabled)
    if (!enabled) {
      if (wasEnabled) {
        editor.putLong(TRACKING_DISABLED_AT_MS_KEY, now)
      }
      val keysToClear = prefs.all.keys
        .filter { key -> key.startsWith(LAST_USED_AT_PREFIX) }
      keysToClear.forEach(editor::remove)
      editor
        .remove(USE_LOG_KEY)
        .remove(LAST_HEARTBEAT_MS_KEY)
    } else {
      val disabledAtMs = prefs.getLong(TRACKING_DISABLED_AT_MS_KEY, -1L)
      if (disabledAtMs > 0L) {
        appendGap(context, disabledAtMs, now)
        editor.remove(TRACKING_DISABLED_AT_MS_KEY)
      }
      editor.putLong(LAST_HEARTBEAT_MS_KEY, now)
    }
    editor.apply()
  }

  fun isTrackingEnabled(context: Context): Boolean =
    prefs(context).getBoolean(TRACKING_ENABLED_KEY, false)

  @Synchronized
  fun appendUse(context: Context, packageName: String, usedAtMs: Long) {
    if (!isTrackingEnabled(context)) {
      return
    }

    val log = readUseLog(context)
    log.put(
      JSONObject()
        .put("package", packageName)
        .put("usedAtMs", usedAtMs),
    )

    val start = maxOf(0, log.length() - MAX_BUFFERED_ROWS)
    val capped = JSONArray()
    for (index in start until log.length()) {
      capped.put(log.getJSONObject(index))
    }

    prefs(context)
      .edit()
      .putString(USE_LOG_KEY, capped.toString())
      .putLong("$LAST_USED_AT_PREFIX$packageName", usedAtMs)
      .apply()
  }

  @Synchronized
  fun drainUseLog(context: Context): JSONArray {
    val log = readUseLog(context)
    prefs(context).edit().remove(USE_LOG_KEY).apply()
    return log
  }

  fun appendGap(context: Context, startedMs: Long, endedMs: Long) {
    if (endedMs < startedMs) {
      return
    }

    val log = readGapLog(context)
    log.put(
      JSONObject()
        .put("startedMs", startedMs)
        .put("endedMs", endedMs),
    )
    prefs(context).edit().putString(GAP_LOG_KEY, log.toString()).apply()
  }

  fun drainGaps(context: Context): JSONArray {
    val log = readGapLog(context)
    prefs(context).edit().remove(GAP_LOG_KEY).apply()
    return log
  }

  fun getLastUsedAt(context: Context): Map<String, Long> {
    val allPrefs = prefs(context).all
    return allPrefs
      .filterKeys { key -> key.startsWith(LAST_USED_AT_PREFIX) }
      .mapNotNull { (key, value) ->
        val timestamp = value as? Long ?: return@mapNotNull null
        key.removePrefix(LAST_USED_AT_PREFIX) to timestamp
      }
      .toMap()
  }

  fun writeHeartbeat(context: Context, heartbeatMs: Long = System.currentTimeMillis()) {
    if (!isTrackingEnabled(context)) {
      return
    }

    prefs(context).edit().putLong(LAST_HEARTBEAT_MS_KEY, heartbeatMs).apply()
  }

  fun getLastHeartbeatMs(context: Context): Long? {
    val value = prefs(context).getLong(LAST_HEARTBEAT_MS_KEY, -1L)
    return if (value > 0L) value else null
  }

  fun recordFailure(context: Context, message: String) {
    val now = System.currentTimeMillis()
    val startedMs = getLastHeartbeatMs(context) ?: now
    appendGap(context, startedMs, now)
    prefs(context)
      .edit()
      .putString(LAST_FAILURE_MESSAGE_KEY, message)
      .putLong(LAST_FAILURE_AT_MS_KEY, now)
      .apply()
  }

  fun getLastFailure(context: Context): Pair<String, Long>? {
    val message = prefs(context).getString(LAST_FAILURE_MESSAGE_KEY, null)
      ?: return null
    val failedAtMs = prefs(context).getLong(LAST_FAILURE_AT_MS_KEY, -1L)
    if (failedAtMs <= 0L) {
      return null
    }
    return message to failedAtMs
  }

  private fun readUseLog(context: Context): JSONArray {
    val raw = prefs(context).getString(USE_LOG_KEY, "[]")
    return runCatching { JSONArray(raw ?: "[]") }.getOrDefault(JSONArray())
  }

  private fun readGapLog(context: Context): JSONArray {
    val raw = prefs(context).getString(GAP_LOG_KEY, "[]")
    return runCatching { JSONArray(raw ?: "[]") }.getOrDefault(JSONArray())
  }

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
