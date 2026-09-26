package com.projectscaleup.app

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
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
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
}
