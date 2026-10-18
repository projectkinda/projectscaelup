package com.projectscaleup.app

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.inputmethod.InputMethodManager

object AppRulePackages {
  fun excluded(context: Context): Set<String> = exclusionReasons(context).keys
  // Resolve current roles, never every candidate for HOME, Settings or tel: links.
  fun exclusionReasons(context: Context): Map<String, String> = buildMap {
    AppRuleDenylist.PACKAGES.forEach { put(it, "denylist") }
    put(context.packageName, "own app")
    val pm = context.packageManager
    fun defaultHandler(intent: Intent, reason: String, allowThirdParty: Boolean = false) {
      val info = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo ?: return
      if (allowThirdParty || info.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0) put(info.packageName, reason)
    }
    defaultHandler(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), "default home", true)
    defaultHandler(Intent(Settings.ACTION_SETTINGS), "default settings")
    val dialer = (context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage
    if (dialer != null) put(dialer, "default dialer")
    (context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)?.enabledInputMethodList
      ?.forEach { put(it.packageName, "enabled ime") }
    for (action in listOf("android.intent.action.DIAL_EMERGENCY", "android.intent.action.EMERGENCY_ASSISTANCE")) {
      pm.queryIntentActivities(Intent(action), 0).forEach { handler ->
        if (handler.activityInfo.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0)
          put(handler.activityInfo.packageName, "system emergency handler: " + action)
      }
    }
  }
}
