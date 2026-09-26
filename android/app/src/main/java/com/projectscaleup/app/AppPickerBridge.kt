package com.projectscaleup.app

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
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

  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
    ) {
      if (requestCode != PICK_APP_REQUEST_CODE) {
        return
      }

      val promise = pickAppPromise ?: return
      pickAppPromise = null

      if (resultCode != Activity.RESULT_OK) {
        promise.resolve(null)
        return
      }

      val packageName = data?.component?.packageName
      if (packageName.isNullOrBlank()) {
        promise.resolve(null)
        return
      }

      try {
        promise.resolve(buildAppMap(packageName))
      } catch (error: Exception) {
        promise.reject("APP_PICKER_RESULT_ERROR", error)
      }
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName() = "AppPickerBridge"

  @ReactMethod
  fun getInstalledApps(promise: Promise) {
    try {
      val launcherIntent = Intent(Intent.ACTION_MAIN, null).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }
      val launchableApps =
        reactApplicationContext.packageManager.queryIntentActivities(
          launcherIntent,
          0,
        )
      val result = Arguments.createArray()
      val seenPackages = HashSet<String>()

      launchableApps.forEach { resolveInfo ->
        val packageName = resolveInfo.activityInfo.packageName
        if (packageName == reactApplicationContext.packageName) {
          return@forEach
        }
        if (!seenPackages.add(packageName)) {
          return@forEach
        }

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

    val launcherIntent = Intent(Intent.ACTION_MAIN, null).apply {
      addCategory(Intent.CATEGORY_LAUNCHER)
    }
    val pickIntent = Intent(Intent.ACTION_PICK_ACTIVITY).apply {
      putExtra(Intent.EXTRA_INTENT, launcherIntent)
      putExtra(Intent.EXTRA_TITLE, "Add app")
    }

    try {
      pickAppPromise = promise
      activity.startActivityForResult(pickIntent, PICK_APP_REQUEST_CODE)
    } catch (error: Exception) {
      pickAppPromise = null
      promise.reject("APP_PICKER_OPEN_ERROR", error)
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
    private const val PICK_APP_REQUEST_CODE = 9317
  }
}
