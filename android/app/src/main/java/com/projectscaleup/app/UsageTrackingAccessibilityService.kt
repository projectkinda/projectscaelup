package com.projectscaleup.app

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.view.accessibility.AccessibilityEvent

class UsageTrackingAccessibilityService : AccessibilityService() {
  private var awayTimeTracker: AwayTimeTracker? = null
  private var ruleTracker: RuleForegroundTracker? = null
  private var screenReceiver: BroadcastReceiver? = null
  override fun onServiceConnected() {
    super.onServiceConnected()
    screenReceiver?.let { safely { unregisterReceiver(it) } }; screenReceiver = null
    safely { ruleTracker?.stop() }
    safely { awayTimeTracker?.stop() }
    safely { awayTimeTracker = AwayTimeTracker(applicationContext, packageName).also { it.arm() } }
    safely {
      ruleTracker = RuleForegroundTracker(applicationContext) { pkg, ruleBlocked ->
        // Cancel JS/away visits using our own app, so an inaccessible app never becomes a distraction.
        val reported = if (ruleBlocked) packageName else pkg
        safely { UsageTrackingBridge.emitForegroundAppChanged(reported) }
        safely { awayTimeTracker?.handleWindowChanged(reported) }
      }
      AppRuleRuntime.tracker = ruleTracker
      if (RuleStore.versions(applicationContext).isNotEmpty()) LockdownOverlayService.start(applicationContext)
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        when (intent?.action) {
          Intent.ACTION_SCREEN_ON -> safely { awayTimeTracker?.handleScreenOn() }
          Intent.ACTION_SCREEN_OFF -> {
            safely { awayTimeTracker?.handleScreenOff() }
            safely { ruleTracker?.screenOff() }
          }
          // USER_PRESENT cannot tell which app is foreground without window-content access.
          // Do not guess from a stale package: resume on the next real window-state event.
          Intent.ACTION_USER_PRESENT, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED ->
            safely { AppRuleRuntime.changed(applicationContext) }
        }
      }
    }
    runCatching {
      registerReceiver(receiver, IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_USER_PRESENT); addAction(Intent.ACTION_TIME_CHANGED); addAction(Intent.ACTION_TIMEZONE_CHANGED)
      })
    }.onSuccess { screenReceiver = receiver }.onFailure { android.util.Log.w("UsageTrackingService", "Failed to register screen receiver", it) }
  }
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    safely {
      val tracker = ruleTracker
      if (tracker != null) {
        tracker.windowChanged(pkg, event.className?.toString())
        // Preserve the away tracker's original per-window heartbeat, even for repeat windows
        // in the same package. Rule-state callbacks above also cover timer-triggered blocks.
        val blocked = AppRuleRuntime.blockInfo(applicationContext, pkg, rulesOnly = true) != null
        safely { awayTimeTracker?.handleWindowChanged(if (blocked) packageName else pkg) }
      } else {
        // Preserve the original trackers if the optional rule engine failed to initialize.
        val blocked = AppRuleRuntime.blockInfo(applicationContext, pkg, rulesOnly = true) != null
        val reported = if (blocked) packageName else pkg
        safely { UsageTrackingBridge.emitForegroundAppChanged(reported) }
        safely { awayTimeTracker?.handleWindowChanged(reported) }
        safely { LockdownOverlayService.handleForegroundAppChanged(applicationContext, pkg, event.className?.toString()) }
      }
    }
  }
  override fun onInterrupt() {
    safely { ruleTracker?.stop() }
    safely { awayTimeTracker?.stop() }
  }
  override fun onDestroy() {
    screenReceiver?.let { safely { unregisterReceiver(it) } }; screenReceiver = null
    safely { ruleTracker?.stop() }
    if (AppRuleRuntime.tracker === ruleTracker) AppRuleRuntime.tracker = null
    ruleTracker = null
    safely { awayTimeTracker?.stop() }; awayTimeTracker = null
    super.onDestroy()
  }
  private inline fun safely(block: () -> Unit) {
    runCatching(block).onFailure { android.util.Log.w("UsageTrackingService", "Usage tracker failed", it) }
  }
}
