package com.projectscaleup.app

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.inputmethod.InputMethodManager

object AppRulePackages {
  // Re-resolve after configuration/window changes: third-party keyboards and launchers change.
  fun excluded(context: Context): Set<String> = buildSet {
    addAll(AppRuleDenylist.PACKAGES)
    add(context.packageName)
    val pm = context.packageManager
    fun addHandlers(intent: Intent) {
      runCatching { pm.queryIntentActivities(intent, 0) }.getOrDefault(emptyList())
        .forEach { add(it.activityInfo.packageName) }
      runCatching { pm.resolveActivity(intent, 0)?.activityInfo?.packageName }.getOrNull()?.let(::add)
    }
    addHandlers(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))
    addHandlers(Intent(Settings.ACTION_SETTINGS))
    addHandlers(Intent(Intent.ACTION_DIAL))
    addHandlers(Intent("android.intent.action.DIAL_EMERGENCY"))
    addHandlers(Intent("android.intent.action.EMERGENCY_ASSISTANCE"))
    runCatching { (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).inputMethodList }
      .getOrDefault(emptyList()).forEach { add(it.packageName) }
    runCatching { (context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage }
      .getOrNull()?.let(::add)
  }
}
