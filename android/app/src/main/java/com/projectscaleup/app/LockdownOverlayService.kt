package com.projectscaleup.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.ceil

class LockdownOverlayService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var currentAppIdentifier: String? = null
  private var currentExpiresAtMs: Long? = null
  private var remainingText: TextView? = null

  private val refreshOverlay = object : Runnable {
    override fun run() {
      val expiresAtMs = currentExpiresAtMs ?: return hideOverlay()
      val remainingMs = expiresAtMs - System.currentTimeMillis()
      if (remainingMs <= 0) {
        hideOverlay()
        stopIfNoActiveLockdowns()
        return
      }

      remainingText?.text = formatRemaining(remainingMs)
      handler.postDelayed(this, 1000)
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    startForeground(NOTIFICATION_ID, buildNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    stopIfNoActiveLockdowns()
    return START_STICKY
  }

  override fun onDestroy() {
    hideOverlay()
    if (instance === this) {
      instance = null
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun showOverlay(appIdentifier: String, expiresAtMs: Long) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      return
    }

    currentAppIdentifier = appIdentifier
    currentExpiresAtMs = expiresAtMs

    if (overlayView == null) {
      overlayView = buildOverlayView(appIdentifier).also { view ->
        windowManager?.addView(view, overlayLayoutParams())
      }
    }

    handler.removeCallbacks(refreshOverlay)
    refreshOverlay.run()
  }

  private fun hideOverlay() {
    handler.removeCallbacks(refreshOverlay)
    overlayView?.let { view ->
      runCatching { windowManager?.removeView(view) }
    }
    overlayView = null
    remainingText = null
    currentAppIdentifier = null
    currentExpiresAtMs = null
  }

  private fun buildOverlayView(appIdentifier: String): View {
    val root = FrameLayout(this).apply {
      setBackgroundColor(Color.rgb(20, 20, 20))
      isClickable = true
      isFocusable = true
    }

    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(40, 40, 40, 40)
    }

    val title = TextView(this).apply {
      text = "Locked"
      setTextColor(Color.rgb(205, 115, 88))
      textSize = 30f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }

    val appName = TextView(this).apply {
      text = appIdentifier
      setTextColor(Color.rgb(246, 249, 253))
      textSize = 18f
      gravity = Gravity.CENTER
      setPadding(0, 18, 0, 0)
    }

    remainingText = TextView(this).apply {
      setTextColor(Color.rgb(139, 139, 139))
      textSize = 16f
      gravity = Gravity.CENTER
      setPadding(0, 12, 0, 0)
    }

    content.addView(title)
    content.addView(appName)
    content.addView(remainingText)
    root.addView(
      content,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ),
    )
    return root
  }

  private fun overlayLayoutParams(): WindowManager.LayoutParams {
    val overlayType =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }

    return WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      android.graphics.PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
    }
  }

  private fun stopIfNoActiveLockdowns() {
    if (!LockdownStore.hasActiveLockdowns(this)) {
      stopSelf()
    }
  }

  private fun buildNotification(): Notification {
    val channelId = "project_scaleup_lockdown"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        channelId,
        "Project ScaleUp lockdown",
        NotificationManager.IMPORTANCE_LOW,
      )
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, channelId)
        .setContentTitle(getString(R.string.lockdown_notification_title))
        .setSmallIcon(R.mipmap.ic_launcher)
        .setOngoing(true)
        .build()
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
        .setContentTitle(getString(R.string.lockdown_notification_title))
        .setSmallIcon(R.mipmap.ic_launcher)
        .setOngoing(true)
        .build()
    }
  }

  private fun formatRemaining(remainingMs: Long): String {
    val minutes = ceil(remainingMs / 60000.0).toInt().coerceAtLeast(1)
    return "$minutes min remaining"
  }

  companion object {
    private const val NOTIFICATION_ID = 4205
    private var instance: LockdownOverlayService? = null

    fun start(context: Context) {
      val intent = Intent(context, LockdownOverlayService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun handleForegroundAppChanged(context: Context, packageName: String) {
      val expiresAtMs = LockdownStore.getExpiry(context, packageName)
      if (expiresAtMs == null) {
        instance?.hideOverlay()
        instance?.stopIfNoActiveLockdowns()
        return
      }

      if (instance == null) {
        start(context)
      }
      instance?.showOverlay(packageName, expiresAtMs)
    }
  }
}
