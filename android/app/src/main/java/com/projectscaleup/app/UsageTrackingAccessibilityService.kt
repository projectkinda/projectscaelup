package com.projectscaleup.app

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.view.accessibility.AccessibilityEvent

class UsageTrackingAccessibilityService : AccessibilityService() {
  private var awayTimeTracker: AwayTimeTracker? = null
  private var screenReceiver: BroadcastReceiver? = null

  override fun onServiceConnected() {
    super.onServiceConnected()
    awayTimeTracker = AwayTimeTracker(applicationContext, packageName).also { tracker ->
      tracker.arm()
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        when (intent?.action) {
          Intent.ACTION_SCREEN_ON -> awayTimeTracker?.handleScreenOn()
          Intent.ACTION_SCREEN_OFF -> awayTimeTracker?.handleScreenOff()
        }
      }
    }
    runCatching {
      registerReceiver(
        receiver,
        IntentFilter().apply {
          addAction(Intent.ACTION_SCREEN_ON)
          addAction(Intent.ACTION_SCREEN_OFF)
        },
      )
    }.onSuccess {
      screenReceiver = receiver
    }.onFailure { error ->
      android.util.Log.w("UsageTrackingService", "Failed to register screen receiver", error)
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
      return
    }

    val packageName = event.packageName?.toString() ?: return
    val className = event.className?.toString()
    UsageTrackingBridge.emitForegroundAppChanged(packageName)
    LockdownOverlayService.handleForegroundAppChanged(applicationContext, packageName, className)
    runCatching {
      awayTimeTracker?.handleWindowChanged(packageName)
    }.onFailure { error ->
      android.util.Log.w("UsageTrackingService", "Away-time tracker failed", error)
    }
  }

  override fun onInterrupt() {
    awayTimeTracker?.stop()
  }

  override fun onDestroy() {
    screenReceiver?.let(::unregisterReceiver)
    screenReceiver = null
    awayTimeTracker?.stop()
    awayTimeTracker = null
    super.onDestroy()
  }
}
