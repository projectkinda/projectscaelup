package com.projectscaleup.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object AwayTimeStore {
  private const val PREFS_NAME = "project_scaleup_away_time"
  private const val FLAGGED_PACKAGES_KEY = "flagged_packages"
  private const val USE_LOG_KEY = "use_log"
  private const val LAST_USED_AT_PREFIX = "last_used_at_"
  private const val LAST_HEARTBEAT_MS_KEY = "last_heartbeat_ms"
  private const val TRACKING_ENABLED_KEY = "tracking_enabled"
  private const val LAST_FAILURE_MESSAGE_KEY = "last_failure_message"
  private const val LAST_FAILURE_AT_MS_KEY = "last_failure_at_ms"
  private const val MAX_BUFFERED_ROWS = 500

  fun setFlaggedPackages(context: Context, packages: Set<String>) {
    prefs(context).edit().putStringSet(FLAGGED_PACKAGES_KEY, packages).apply()
  }

  fun getFlaggedPackages(context: Context): Set<String> =
    prefs(context).getStringSet(FLAGGED_PACKAGES_KEY, emptySet()) ?: emptySet()

  fun setTrackingEnabled(context: Context, enabled: Boolean) {
    val editor = prefs(context).edit().putBoolean(TRACKING_ENABLED_KEY, enabled)
    if (!enabled) {
      editor
        .remove(USE_LOG_KEY)
        .remove(LAST_HEARTBEAT_MS_KEY)
    }
    editor.apply()
  }

  fun isTrackingEnabled(context: Context): Boolean =
    prefs(context).getBoolean(TRACKING_ENABLED_KEY, false)

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

  fun drainUseLog(context: Context): JSONArray {
    val log = readUseLog(context)
    prefs(context).edit().remove(USE_LOG_KEY).apply()
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
    prefs(context)
      .edit()
      .putString(LAST_FAILURE_MESSAGE_KEY, message)
      .putLong(LAST_FAILURE_AT_MS_KEY, System.currentTimeMillis())
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

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
