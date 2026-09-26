package com.projectscaleup.app

import android.content.Context
import android.provider.Settings
import android.text.TextUtils

object AccessibilityPermissionHelper {
  fun isEnabled(context: Context): Boolean {
    val accessibilityEnabled = try {
      Settings.Secure.getInt(
        context.contentResolver,
        Settings.Secure.ACCESSIBILITY_ENABLED,
      )
    } catch (_: Settings.SettingNotFoundException) {
      0
    }

    if (accessibilityEnabled != 1) {
      return false
    }

    val expectedService = "${context.packageName}/${UsageTrackingAccessibilityService::class.java.name}"
    val enabledServices = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false

    val splitter = TextUtils.SimpleStringSplitter(':')
    splitter.setString(enabledServices)
    while (splitter.hasNext()) {
      if (splitter.next().equals(expectedService, ignoreCase = true)) {
        return true
      }
    }

    return false
  }
}
