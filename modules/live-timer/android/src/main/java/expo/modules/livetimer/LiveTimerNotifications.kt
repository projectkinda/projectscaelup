package expo.modules.livetimer

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import java.util.Locale

internal const val OPEN_TIMER = "expo.modules.livetimer.OPEN_TIMER"
private const val NOTIFICATION_ID = 50421
private const val CHANNEL_ID = "focus_timer_v1"
private const val PREFS = "focus_timer_notification"
private const val DISMISS = "expo.modules.livetimer.DISMISS"
private const val EXPIRE = "expo.modules.livetimer.EXPIRE"
private const val TOKEN = "session_token"

internal class LiveTimerNotifications(private val context: Context) {
  private val manager = context.getSystemService(NotificationManager::class.java)
  private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun styleOverride(): String = if (!BuildConfig.TEST_TOOLS_ENABLED) "custom" else prefs.getString("style_override", "custom").let { if (it == "standard") "standard" else "custom" }

  fun setStyleOverride(value: String, testToolsEnabled: Boolean): Boolean {
    if (!BuildConfig.TEST_TOOLS_ENABLED || !testToolsEnabled || value !in listOf("custom", "standard")) return false
    return prefs.edit().putString("style_override", value).commit()
  }

  fun newSession() {
    // Pin the override once; pause/resume/extend must retain this session's style.
    prefs.edit().putBoolean("dismissed", false).putLong(TOKEN, System.nanoTime())
      .putString("session_style", styleOverride()).apply()
  }

  fun running(endsAtMs: Long, label: String) {
    val remainingMs = (endsAtMs - System.currentTimeMillis()).coerceAtLeast(0L)
    if (remainingMs == 0L) {
      stop()
      return
    }
    post(label, remainingMs) { builder, custom ->
      if (custom) {
        val row = focusRow(label)
        row.setViewVisibility(R.id.focus_countdown, View.VISIBLE)
        row.setViewVisibility(R.id.focus_paused, View.GONE)
        row.setChronometerCountDown(R.id.focus_countdown, true)
        row.setChronometer(R.id.focus_countdown, SystemClock.elapsedRealtime() + remainingMs, null, true)
        decorate(builder, row)
      } else {
        builder.setWhen(endsAtMs).setShowWhen(true)
        if (Build.VERSION.SDK_INT >= 24) builder.setUsesChronometer(true).setChronometerCountDown(true)
        else builder.setUsesChronometer(false).setContentText(formatTime(remainingMs))
        // Only the standard path is Live Update / status-bar chip eligible.
        // SDK 36.1 adds a Builder method; the documented extra works with compileSdk 36.
        if (Build.VERSION.SDK_INT >= 36) {
          builder.addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })
        }
      }
    }
  }

  fun paused(remainingMs: Long, timeoutMs: Long, label: String) {
    if (remainingMs <= 0L || timeoutMs <= 0L) {
      stop()
      return
    }
    post(label, timeoutMs) { builder, custom ->
      val time = formatTime(remainingMs)
      builder.setUsesChronometer(false).setShowWhen(false).setContentText(if (custom) "$time paused" else "$time \u00b7 Paused")
      if (custom) {
        val row = focusRow(label)
        row.setViewVisibility(R.id.focus_countdown, View.GONE)
        row.setViewVisibility(R.id.focus_paused, View.VISIBLE)
        row.setChronometer(R.id.focus_countdown, 0L, null, false)
        row.setTextViewText(R.id.focus_paused, "$time paused")
        decorate(builder, row)
      }
      // A paused activity remains visible in the shade, without requesting promotion.
    }
  }

  private fun formatTime(remainingMs: Long): String {
    val seconds = (remainingMs + 999L) / 1000L
    return String.format(Locale.getDefault(), "%d:%02d", seconds / 60L, seconds % 60L)
  }

  private fun focusRow(label: String) = RemoteViews(context.packageName, R.layout.notification_focus_row).apply {
    val name = label.trim().ifBlank { "Focus" }.take(40)
    setTextViewText(R.id.focus_name, name)
    setContentDescription(R.id.focus_row, "$name, focus session")
  }

  private fun decorate(builder: Notification.Builder, row: RemoteViews) {
    // All required custom APIs exist at minSdk 24. Older APIs use the plain path.
    if (Build.VERSION.SDK_INT >= 24) {
      builder.setUsesChronometer(false).setShowWhen(false)
        .setStyle(Notification.DecoratedCustomViewStyle())
        .setCustomContentView(row).setCustomBigContentView(row)
    }
  }

  private fun post(label: String, timeoutMs: Long, configure: (Notification.Builder, Boolean) -> Unit) {
    if (prefs.getBoolean("dismissed", false) || !manager.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= 33 &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return

    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Focus timer", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Your countdown during a focus session"
        setSound(null, null)
        enableVibration(false)
        enableLights(false)
        lockscreenVisibility = Notification.VISIBILITY_SECRET
        setShowBadge(false)
      })
    }
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    launch.putExtra(OPEN_TIMER, true)
    val tap = PendingIntent.getActivity(context, NOTIFICATION_ID, launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val delete = PendingIntent.getBroadcast(context, NOTIFICATION_ID,
      Intent(context, LiveTimerReceiver::class.java).setAction(DISMISS)
        .putExtra(TOKEN, prefs.getLong(TOKEN, 0L)),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)
    builder.setSmallIcon(R.drawable.ic_focus_timer)
      .setContentTitle(label.trim().ifBlank { "Focus" }.take(40))
      .setContentIntent(tap).setDeleteIntent(delete)
      .setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(true)
      .setCategory(if (Build.VERSION.SDK_INT >= 31) Notification.CATEGORY_STOPWATCH else Notification.CATEGORY_STATUS)
      .setVisibility(Notification.VISIBILITY_SECRET)
    if (Build.VERSION.SDK_INT >= 26) {
      // Relative duration, NOT the absolute endsAtMs timestamp.
      builder.setTimeoutAfter(timeoutMs.coerceAtLeast(1L))
    } else {
      @Suppress("DEPRECATION")
      builder.setPriority(Notification.PRIORITY_LOW).setSound(null).setVibrate(longArrayOf(0L))
      // SDK 57 supports API 24/25, which have no Notification.setTimeoutAfter.
      // Inexact OS cleanup needs no service or exact-alarm permission.
      context.getSystemService(AlarmManager::class.java).set(
        AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + timeoutMs, expiryIntent())
    }
    val custom = Build.VERSION.SDK_INT >= 24 &&
      (!BuildConfig.TEST_TOOLS_ENABLED || prefs.getString("session_style", "custom") != "standard")
    try {
      configure(builder, custom)
      manager.notify(NOTIFICATION_ID, builder.build())
    } catch (error: RuntimeException) {
      if (!custom) throw error
      // Retain a plain, titled notification if custom-view construction/posting fails.
      Log.w("LiveTimer", "Custom row unavailable; using standard notification", error)
      if (Build.VERSION.SDK_INT >= 24) {
        builder.setCustomContentView(null).setCustomBigContentView(null).setStyle(null)
      }
      configure(builder, false)
      manager.notify(NOTIFICATION_ID, builder.build())
    }
  }

  private fun expiryIntent() = PendingIntent.getBroadcast(context, NOTIFICATION_ID + 1,
    Intent(context, LiveTimerReceiver::class.java).setAction(EXPIRE),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun stop() {
    manager.cancel(NOTIFICATION_ID)
    context.getSystemService(AlarmManager::class.java).cancel(expiryIntent())
  }
}

class LiveTimerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      if (intent.action == DISMISS) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (intent.getLongExtra(TOKEN, -1L) == prefs.getLong(TOKEN, 0L)) {
          // Respect a user's dismissal until the next explicitly started session.
          prefs.edit().putBoolean("dismissed", true).apply()
        }
      } else if (intent.action == EXPIRE) {
        LiveTimerNotifications(context).stop()
      }
    } catch (error: Exception) {
      Log.w("LiveTimer", "Notification cleanup unavailable", error)
    }
  }
}
