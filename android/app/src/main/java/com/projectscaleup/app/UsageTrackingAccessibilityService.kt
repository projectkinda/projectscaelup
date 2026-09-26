package com.projectscaleup.app

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

class UsageTrackingAccessibilityService : AccessibilityService() {
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
      return
    }

    val packageName = event.packageName?.toString() ?: return
    UsageTrackingBridge.emitForegroundAppChanged(packageName)
    LockdownOverlayService.handleForegroundAppChanged(applicationContext, packageName)
  }

  override fun onInterrupt() = Unit
}
