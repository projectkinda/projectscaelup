package com.projectscaleup.app

import android.content.Context
import org.json.JSONObject

object LockdownStore {
  private const val PREFS_NAME = "project_scaleup_lockdowns"
  private const val LOCKDOWNS_KEY = "active_lockdowns"

  fun applyLockdown(
    context: Context,
    appIdentifiers: List<String>,
    expiresAt: String,
  ) {
    val lockouts = readLockdowns(context)
    appIdentifiers.forEach { appIdentifier ->
      lockouts.put(appIdentifier, expiresAt)
    }
    writeLockdowns(context, lockouts)
  }

  fun getExpiry(context: Context, appIdentifier: String): Long? {
    val lockouts = readLockdowns(context)
    if (!lockouts.has(appIdentifier)) {
      return null
    }

    val expiresAt = lockouts.optString(appIdentifier)
    val expiresAtMs = runCatching { java.time.Instant.parse(expiresAt).toEpochMilli() }
      .getOrNull()
      ?: return null

    if (expiresAtMs <= System.currentTimeMillis()) {
      lockouts.remove(appIdentifier)
      writeLockdowns(context, lockouts)
      return null
    }

    return expiresAtMs
  }

  fun hasActiveLockdowns(context: Context): Boolean {
    val lockouts = readLockdowns(context)
    val now = System.currentTimeMillis()
    val keys = lockouts.keys().asSequence().toList()
    keys.forEach { key ->
      val expiresAtMs = runCatching {
        java.time.Instant.parse(lockouts.optString(key)).toEpochMilli()
      }.getOrNull()

      if (expiresAtMs == null || expiresAtMs <= now) {
        lockouts.remove(key)
      }
    }
    writeLockdowns(context, lockouts)
    return lockouts.length() > 0
  }

  private fun readLockdowns(context: Context): JSONObject {
    val raw = context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(LOCKDOWNS_KEY, "{}")

    return runCatching { JSONObject(raw ?: "{}") }.getOrDefault(JSONObject())
  }

  private fun writeLockdowns(context: Context, lockouts: JSONObject) {
    context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(LOCKDOWNS_KEY, lockouts.toString())
      .apply()
  }
}
