package com.projectscaleup.app

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppRulesBridge(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val handler = Handler(Looper.getMainLooper())
  override fun getName() = "AppRulesBridge"
  @ReactMethod fun setRules(json: String, promise: Promise) {
    handler.post {
      runCatching {
        AppRuleRuntime.tracker?.flush()
        RuleStore.set(reactApplicationContext, json)
        AppRuleRuntime.changed(reactApplicationContext)
        if (RuleStore.versions(reactApplicationContext).isNotEmpty()) LockdownOverlayService.start(reactApplicationContext)
      }.onSuccess { promise.resolve(null) }.onFailure { promise.reject("APP_RULES_SYNC", it) }
    }
  }
  @ReactMethod fun getTodayUsage(packages: ReadableArray, promise: Promise) {
    handler.post {
      runCatching {
        AppRuleRuntime.tracker?.flush()
        val tracked = RuleStore.trackedPackages(reactApplicationContext)
        val usage = UsageLedger.today(reactApplicationContext)
        val result = Arguments.createMap()
        for (i in 0 until packages.size()) {
          val pkg = packages.getString(i) ?: continue
          if (pkg in tracked) result.putDouble(pkg, (usage[pkg] ?: 0L).toDouble())
        }
        AppRuleRuntime.tracker?.reevaluate()
        result
      }.onSuccess { promise.resolve(it) }.onFailure { promise.reject("APP_RULES_USAGE", it) }
    }
  }
  @ReactMethod fun getExcludedPackages(promise: Promise) {
    runCatching {
      Arguments.createArray().apply { AppRulePackages.excluded(reactApplicationContext).forEach { pushString(it) } }
    }.onSuccess { promise.resolve(it) }.onFailure { promise.reject("APP_RULES_PACKAGES", it) }
  }
}
