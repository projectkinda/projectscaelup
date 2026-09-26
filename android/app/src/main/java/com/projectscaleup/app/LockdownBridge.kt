package com.projectscaleup.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class LockdownBridge(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "LockdownBridge"

  @ReactMethod
  fun applyLockdown(appIdentifiers: ReadableArray, expiresAt: String, promise: Promise) {
    val identifiers = mutableListOf<String>()
    for (index in 0 until appIdentifiers.size()) {
      appIdentifiers.getString(index)?.let { identifiers.add(it) }
    }

    LockdownStore.applyLockdown(reactApplicationContext, identifiers, expiresAt)
    LockdownOverlayService.start(reactApplicationContext)
    promise.resolve(null)
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    promise.resolve(
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
        Settings.canDrawOverlays(reactApplicationContext),
    )
  }

  @ReactMethod
  fun openOverlaySettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return
    }

    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactApplicationContext.packageName}"),
    ).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactApplicationContext.startActivity(intent)
  }
}
