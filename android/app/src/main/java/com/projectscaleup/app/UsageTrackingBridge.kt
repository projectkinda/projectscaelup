package com.projectscaleup.app

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class UsageTrackingBridge(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "UsageTrackingBridge"

  init {
    Companion.reactContext = reactContext
  }

  @ReactMethod
  fun isAccessibilityServiceEnabled(promise: Promise) {
    promise.resolve(AccessibilityPermissionHelper.isEnabled(reactApplicationContext))
  }

  @ReactMethod
  fun openAccessibilitySettings() {
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactApplicationContext.startActivity(intent)
  }

  @ReactMethod
  fun setFlaggedPackages(packages: ReadableArray, promise: Promise) {
    val packageSet = mutableSetOf<String>()
    for (index in 0 until packages.size()) {
      packages.getString(index)?.let(packageSet::add)
    }
    AwayTimeStore.setFlaggedPackages(reactApplicationContext, packageSet)
    promise.resolve(null)
  }

  @ReactMethod
  fun drainUseLog(promise: Promise) {
    val log = AwayTimeStore.drainUseLog(reactApplicationContext)
    val result = Arguments.createArray()
    for (index in 0 until log.length()) {
      val item = log.optJSONObject(index) ?: continue
      result.pushMap(
        Arguments.createMap().apply {
          putString("package", item.optString("package"))
          putDouble("usedAtMs", item.optLong("usedAtMs").toDouble())
        },
      )
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun getLastUsedAt(promise: Promise) {
    val result = Arguments.createMap()
    AwayTimeStore.getLastUsedAt(reactApplicationContext).forEach { (packageName, usedAtMs) ->
      result.putDouble(packageName, usedAtMs.toDouble())
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun setAwayTrackingEnabled(enabled: Boolean, promise: Promise) {
    AwayTimeStore.setTrackingEnabled(reactApplicationContext, enabled)
    promise.resolve(null)
  }

  @ReactMethod
  fun getLastHeartbeatMs(promise: Promise) {
    val heartbeatMs = AwayTimeStore.getLastHeartbeatMs(reactApplicationContext)
    if (heartbeatMs == null) {
      promise.resolve(null)
    } else {
      promise.resolve(heartbeatMs.toDouble())
    }
  }

  @ReactMethod
  fun getLastFailure(promise: Promise) {
    val failure = AwayTimeStore.getLastFailure(reactApplicationContext)
    if (failure == null) {
      promise.resolve(null)
      return
    }

    promise.resolve(
      Arguments.createMap().apply {
        putString("message", failure.first)
        putDouble("failedAtMs", failure.second.toDouble())
      },
    )
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  companion object {
    private var reactContext: ReactApplicationContext? = null

    fun emitForegroundAppChanged(packageName: String) {
      val params = Arguments.createMap().apply {
        putString("packageName", packageName)
      }

      reactContext
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("foregroundAppChanged", params)
    }
  }
}
