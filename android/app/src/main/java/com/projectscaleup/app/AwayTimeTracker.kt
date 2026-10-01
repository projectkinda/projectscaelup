package com.projectscaleup.app

import android.content.Context
import android.os.Handler
import android.os.Looper

class AwayTimeTracker(
  private val context: Context,
  private val ownPackageName: String,
) {
  private val handler = Handler(Looper.getMainLooper())
  private var currentPackage: String? = null
  private var thresholdRunnable: Runnable? = null
  private var heartbeatRunnable: Runnable? = null

  fun arm() {
    runCatching {
      AwayTimeStore.getFlaggedPackages(context)
      val now = System.currentTimeMillis()
      val previousHeartbeatMs = AwayTimeStore.getLastHeartbeatMs(context)
      if (
        AwayTimeStore.isTrackingEnabled(context) &&
        previousHeartbeatMs != null &&
        now - previousHeartbeatMs > STALE_RECONNECT_GAP_MS
      ) {
        AwayTimeStore.appendGap(context, previousHeartbeatMs, now)
      }
      AwayTimeStore.writeHeartbeat(context)
    }.onFailure { error ->
      AwayTimeStore.recordFailure(context, error.message ?: "Away tracker failed to arm")
    }
  }

  fun handleWindowChanged(packageName: String) {
    if (!AwayTimeStore.isTrackingEnabled(context)) {
      cancelVisit()
      return
    }

    AwayTimeStore.writeHeartbeat(context)

    if (shouldIgnorePackage(packageName)) {
      return
    }

    if (packageName == ownPackageName) {
      cancelVisit()
      return
    }

    val flaggedPackages = AwayTimeStore.getFlaggedPackages(context)
    if (!flaggedPackages.contains(packageName)) {
      cancelVisit()
      return
    }

    if (currentPackage == packageName) {
      return
    }

    cancelVisit()
    currentPackage = packageName
    thresholdRunnable = Runnable {
      writeUse(packageName)
      thresholdRunnable = null
      scheduleStillInUse(packageName)
    }.also { runnable ->
      handler.postDelayed(runnable, REAL_USE_THRESHOLD_MS)
    }
  }

  fun handleScreenOn() {
    if (AwayTimeStore.isTrackingEnabled(context)) {
      AwayTimeStore.writeHeartbeat(context)
    }
  }

  fun handleScreenOff() {
    if (AwayTimeStore.isTrackingEnabled(context)) {
      AwayTimeStore.writeHeartbeat(context)
    }
    cancelVisit()
  }

  fun stop() {
    cancelVisit()
    handler.removeCallbacksAndMessages(null)
  }

  private fun scheduleStillInUse(packageName: String) {
    heartbeatRunnable = Runnable {
      if (currentPackage != packageName || !AwayTimeStore.isTrackingEnabled(context)) {
        return@Runnable
      }

      writeUse(packageName)
      scheduleStillInUse(packageName)
    }.also { runnable ->
      handler.postDelayed(runnable, STILL_IN_USE_INTERVAL_MS)
    }
  }

  private fun writeUse(packageName: String) {
    if (currentPackage != packageName) {
      return
    }

    AwayTimeStore.appendUse(context, packageName, System.currentTimeMillis())
  }

  private fun cancelVisit() {
    thresholdRunnable?.let(handler::removeCallbacks)
    heartbeatRunnable?.let(handler::removeCallbacks)
    thresholdRunnable = null
    heartbeatRunnable = null
    currentPackage = null
  }

  private fun shouldIgnorePackage(packageName: String): Boolean {
    val normalized = packageName.lowercase()
    return packageName == "com.android.systemui" ||
      normalized.contains("inputmethod") ||
      normalized.contains("keyboard")
  }

  companion object {
    private const val REAL_USE_THRESHOLD_MS = 60_000L
    private const val STILL_IN_USE_INTERVAL_MS = 5 * 60_000L
    private const val STALE_RECONNECT_GAP_MS = 30 * 60_000L
  }
}
