package com.projectscaleup.app

import android.content.Context
import android.app.KeyguardManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import java.time.Instant
import java.time.ZoneId

/** Lives with the accessibility service; never retrieves window content. */
class RuleForegroundTracker(
  private val context: Context,
  private val report: (String, Boolean) -> Unit,
) {
  private val handler = Handler(Looper.getMainLooper())
  private var foreground: String? = null
  private var segmentStart: Long? = null
  private var segmentElapsedStart: Long = 0
  private var reported: Pair<String, Boolean>? = null
  private val tick = Runnable { safely { reevaluate() } }

  fun windowChanged(pkg: String, className: String?): Unit = safely {
    // The overlay itself emits our package with a widget class. Keep the target, not the overlay.
    if (pkg == context.packageName && className != MainActivity::class.java.name) return@safely
    closeSegment()
    handler.removeCallbacks(tick)
    foreground = pkg
    reevaluate()
  }
  fun flush(): Unit = safely { closeSegment() }
  fun usage(now: Long = System.currentTimeMillis()): Map<String, Long> {
    val usage = UsageLedger.today(context, now).toMutableMap()
    val pkg = foreground ?: return usage
    val start = segmentStart ?: return usage
    if (pkg !in RuleStore.trackedPackages(context, now)) return usage
    val midnight = Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault()).toLocalDate().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    val amount = minOf(SystemClock.elapsedRealtime() - segmentElapsedStart, (now - maxOf(start, midnight)).coerceAtLeast(0)).coerceAtLeast(0)
    usage[pkg] = (usage[pkg] ?: 0L) + amount
    return usage
  }
  fun reevaluate(): Unit = safely {
    handler.removeCallbacks(tick)
    closeSegment()
    val pkg = foreground ?: return@safely
    val now = System.currentTimeMillis()
    val interactive = (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive
    val locked = (context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
    if (!interactive || locked) { screenOff(); return@safely }
    val blocked = AppRuleRuntime.blockInfo(context, pkg, now)
    val ruleBlocked = AppRuleRuntime.blockInfo(context, pkg, now, rulesOnly = true) != null
    val nextReport = pkg to ruleBlocked
    if (reported != nextReport) { reported = nextReport; report(pkg, ruleBlocked) }
    if (blocked == null && pkg in RuleStore.trackedPackages(context, now)) {
      segmentStart = now; segmentElapsedStart = SystemClock.elapsedRealtime()
    }
    LockdownOverlayService.handleForegroundAppChanged(context, pkg)
    // Midnight/retirement, next scheduled start/end, and the remaining shared budget.
    val next = BlockEvaluator.nextTransition(RuleStore.versions(context, now), usage(now), pkg, now, ZoneId.systemDefault())
    val deadline = minOf(next, blocked?.untilMs ?: Long.MAX_VALUE)
    handler.postDelayed(tick, minOf(30_000L, (deadline - now).coerceAtLeast(1L)))
  }
  fun screenOff(): Unit = safely {
    closeSegment()
    foreground = null
    reported = null
    handler.removeCallbacks(tick)
    report(context.packageName, false)
    LockdownOverlayService.hideForScreenOff()
  }
  fun stop() { screenOff(); handler.removeCallbacksAndMessages(null) }
  private fun closeSegment() {
    val start = segmentStart ?: return
    segmentStart = null
    val pkg = foreground ?: return
    UsageLedger.add(context, pkg, start, System.currentTimeMillis(), SystemClock.elapsedRealtime() - segmentElapsedStart)
  }
  private inline fun safely(block: () -> Unit) {
    runCatching(block).onFailure { android.util.Log.w("AppRules", "Foreground rule tracking failed", it) }
  }
}
