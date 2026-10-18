package com.projectscaleup.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Drawable
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
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.ceil

class LockdownOverlayService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var currentAppIdentifier: String? = null
  private var currentBlock: BlockInfo? = null
  private var ruleDetailText: TextView? = null
  private var remainingText: TextView? = null

  private val refreshOverlay = object : Runnable {
    override fun run() {
      runCatching {
        val pkg = currentAppIdentifier ?: return
        val info = AppRuleRuntime.blockInfo(this@LockdownOverlayService, pkg)
        if (info == null) { hideOverlay(); stopIfNoActiveLockdowns(); return }
        if (currentBlock?.reason != info.reason || currentBlock?.detail != info.detail) {
          showOverlay(pkg, info); return
        }
        currentBlock = info
        remainingText?.text = when (info.reason) {
          BlockReason.LOCKDOWN -> formatRemaining(info.untilMs - System.currentTimeMillis())
          BlockReason.SCHEDULE -> "Until " + java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.US)
            .format(java.time.Instant.ofEpochMilli(info.untilMs).atZone(java.time.ZoneId.systemDefault())).lowercase(java.util.Locale.US)
          BlockReason.LIMIT -> "Back tomorrow"
        }
        ruleDetailText?.text = when (info.reason) {
          BlockReason.LOCKDOWN -> ""
          BlockReason.SCHEDULE -> "Your schedule"
          BlockReason.LIMIT -> info.detail + " per day"
        }
        handler.postDelayed(this, 1000)
      }.onFailure { hideOverlay() }
    }
  }
  private val serviceSweep = object : Runnable {
    override fun run() {
      runCatching { stopIfNoActiveLockdowns() }
      handler.postDelayed(this, 30_000)
    }
  }

  private val hideRunnable = Runnable {
    hideOverlay()
    stopIfNoActiveLockdowns()
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    startForeground(NOTIFICATION_ID, buildNotification())
    handler.postDelayed(serviceSweep, 30_000)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    pendingShow?.let { (packageName, _) ->
      runCatching { AppRuleRuntime.blockInfo(this, packageName)?.let { showOverlay(packageName, it) } }
    }
    pendingShow = null
    stopIfNoActiveLockdowns()
    return START_STICKY
  }

  override fun onDestroy() {
    hideOverlay()
    if (instance === this) {
      instance = null
    }
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun showOverlay(appIdentifier: String, info: BlockInfo) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      return
    }

    val appChanged = currentAppIdentifier != appIdentifier || currentBlock?.reason != info.reason || currentBlock?.detail != info.detail
    currentAppIdentifier = appIdentifier
    currentBlock = info

    if (appChanged && overlayView != null) {
      hideOverlay()
      currentAppIdentifier = appIdentifier
      currentBlock = info
    }

    if (overlayView == null) {
      overlayView = buildOverlayView(appIdentifier, info).also { view ->
        windowManager?.addView(view, overlayLayoutParams())
      }
    }

    handler.removeCallbacks(refreshOverlay)
    refreshOverlay.run()
  }

  private fun scheduleHide() {
    handler.removeCallbacks(hideRunnable)
    handler.postDelayed(hideRunnable, 300)
  }

  private fun cancelScheduledHide() {
    handler.removeCallbacks(hideRunnable)
  }

  private fun hideOverlay() {
    handler.removeCallbacks(hideRunnable)
    handler.removeCallbacks(refreshOverlay)
    overlayView?.let { view ->
      runCatching { windowManager?.removeView(view) }
    }
    overlayView = null
    remainingText = null
    ruleDetailText = null
    currentAppIdentifier = null
    currentBlock = null
  }

  private fun buildOverlayView(appIdentifier: String, info: BlockInfo): View {
    val (label, icon) = loadAppLabelAndIcon(appIdentifier)
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

    val iconView = ImageView(this).apply {
      layoutParams = LinearLayout.LayoutParams(dp(80), dp(80)).apply {
        bottomMargin = dp(20)
      }
      if (icon != null) {
        setImageDrawable(icon)
      } else {
        visibility = View.GONE
      }
    }

    val title = TextView(this).apply {
      text = when (info.reason) {
        BlockReason.LOCKDOWN -> "Locked"
        BlockReason.SCHEDULE -> "Blocked"
        BlockReason.LIMIT -> "Daily limit reached"
      }
      setTextColor(Color.rgb(205, 115, 88))
      textSize = 30f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }

    val appName = TextView(this).apply {
      text = label
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

    ruleDetailText = TextView(this).apply {
      setTextColor(Color.rgb(139, 139, 139))
      textSize = 13f
      gravity = Gravity.CENTER
      setPadding(0, 12, 0, 0)
      visibility = if (info.reason == BlockReason.LOCKDOWN) View.GONE else View.VISIBLE
    }
    content.addView(iconView)
    content.addView(title)
    content.addView(appName)
    content.addView(remainingText)
    content.addView(ruleDetailText)
    root.addView(
      content,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ),
    )
    return root
  }

  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

  private fun loadAppLabelAndIcon(packageName: String): Pair<String, Drawable?> =
    try {
      val applicationInfo = packageManager.getApplicationInfo(packageName, 0)
      val label = packageManager.getApplicationLabel(applicationInfo).toString()
      label to packageManager.getApplicationIcon(packageName)
    } catch (error: Exception) {
      packageName to null
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
    if (!LockdownStore.hasActiveLockdowns(this) && RuleStore.versions(this).isEmpty()) {
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
    private var pendingShow: Pair<String, BlockInfo>? = null

    fun start(context: Context) {
      val intent = Intent(context, LockdownOverlayService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun hideForScreenOff() {
      pendingShow = null
      instance?.handler?.post { runCatching { instance?.hideOverlay() } }
    }
    fun refreshCurrent(context: Context) {
      val service = instance ?: return
      service.handler.post {
        runCatching {
          val pkg = service.currentAppIdentifier
          if (pkg != null) {
            val info = AppRuleRuntime.blockInfo(context, pkg)
            if (info == null) service.hideOverlay() else service.showOverlay(pkg, info)
          }
          service.stopIfNoActiveLockdowns()
        }
      }
    }
    fun handleForegroundAppChanged(context: Context, packageName: String, className: String? = null) {
      runCatching {
        // Ignore our own overlay's window event, but not the actual app activity.
        if (packageName == context.packageName && className != null && className != MainActivity::class.java.name) return
        val info = AppRuleRuntime.blockInfo(context, packageName)
        if (info == null) { pendingShow = null; instance?.scheduleHide(); return }
        if (instance == null) {
          pendingShow = packageName to info
          start(context)
        } else {
          instance?.cancelScheduledHide()
          instance?.showOverlay(packageName, info)
        }
      }.onFailure { android.util.Log.w("AppRules", "Could not display app block", it) }
    }
  }
}
