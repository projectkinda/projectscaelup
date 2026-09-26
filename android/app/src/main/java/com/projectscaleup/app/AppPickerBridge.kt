package com.projectscaleup.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.io.ByteArrayOutputStream

class AppPickerBridge(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var pickAppPromise: Promise? = null

  override fun getName() = "AppPickerBridge"

  @ReactMethod
  fun getInstalledApps(promise: Promise) {
    try {
      val result = Arguments.createArray()

      getLaunchablePackageNames().forEach { packageName ->
        result.pushMap(buildAppMap(packageName))
      }

      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("APP_PICKER_ERROR", error)
    }
  }

  @ReactMethod
  fun pickInstalledApp(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("APP_PICKER_NO_ACTIVITY", "No active Android activity.")
      return
    }

    if (pickAppPromise != null) {
      promise.reject("APP_PICKER_IN_PROGRESS", "An app picker is already open.")
      return
    }

    reactContext.runOnUiQueueThread {
      try {
        val apps = getLaunchablePackageNames()
          .map { packageName ->
            val appMap = buildAppMap(packageName)
            PickableApp(
              packageName = packageName,
              displayName = appMap.getString("displayName") ?: packageName,
            )
          }
          .sortedBy { it.displayName.lowercase() }

        if (apps.isEmpty()) {
          promise.resolve(null)
          return@runOnUiQueueThread
        }

        pickAppPromise = promise
        AlertDialog.Builder(activity)
          .setTitle("Add app")
          .setItems(apps.map { it.displayName }.toTypedArray()) { dialog, index ->
            val selectedPackageName = apps[index].packageName
            val activePromise = pickAppPromise ?: return@setItems
            pickAppPromise = null
            dialog.dismiss()

            try {
              activePromise.resolve(buildAppMap(selectedPackageName))
            } catch (error: Exception) {
              activePromise.reject("APP_PICKER_RESULT_ERROR", error)
            }
          }
          .setNegativeButton("Cancel") { dialog, _ ->
            val activePromise = pickAppPromise
            pickAppPromise = null
            activePromise?.resolve(null)
            dialog.dismiss()
          }
          .setOnCancelListener {
            val activePromise = pickAppPromise
            pickAppPromise = null
            activePromise?.resolve(null)
          }
          .show()
      } catch (error: Exception) {
        pickAppPromise = null
        promise.reject("APP_PICKER_OPEN_ERROR", error)
      }
    }
  }

  private fun getLaunchablePackageNames(): List<String> {
    val launcherIntent = Intent(Intent.ACTION_MAIN, null).apply {
      addCategory(Intent.CATEGORY_LAUNCHER)
    }
    val seenPackages = HashSet<String>()

    return reactApplicationContext.packageManager
      .queryIntentActivities(launcherIntent, 0)
      .map { resolveInfo -> resolveInfo.activityInfo.packageName }
      .filter { packageName ->
        packageName != reactApplicationContext.packageName &&
          seenPackages.add(packageName)
      }
  }

  private fun buildAppMap(packageName: String): WritableMap {
    val packageManager = reactApplicationContext.packageManager
    val appInfo = packageManager.getApplicationInfo(packageName, 0)
    val displayName = packageManager.getApplicationLabel(appInfo).toString()
    val iconDrawable = packageManager.getApplicationIcon(packageName)

    return Arguments.createMap().apply {
      putString("packageName", packageName)
      putString("displayName", displayName)
      putString("iconBase64", drawableToBase64(iconDrawable))
    }
  }

  private fun drawableToBase64(drawable: Drawable): String {
    val bitmap = if (drawable is BitmapDrawable) {
      drawable.bitmap
    } else {
      val width = drawable.intrinsicWidth.coerceAtLeast(1)
      val height = drawable.intrinsicHeight.coerceAtLeast(1)
      val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(output)
      drawable.setBounds(0, 0, canvas.width, canvas.height)
      drawable.draw(canvas)
      output
    }

    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
    return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
  }

  companion object {
    private data class PickableApp(
      val packageName: String,
      val displayName: String,
    )
  }
}
