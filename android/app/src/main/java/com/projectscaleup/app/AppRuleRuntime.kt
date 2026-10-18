package com.projectscaleup.app

import android.content.Context
import java.time.ZoneId

object AppRuleRuntime {
  var tracker: RuleForegroundTracker? = null
  fun blockInfo(context: Context, pkg: String, now: Long = System.currentTimeMillis(), rulesOnly: Boolean = false): BlockInfo? =
    BlockEvaluator.evaluate(RuleStore.versions(context, now), tracker?.usage(now) ?: UsageLedger.today(context, now),
      pkg, now, ZoneId.systemDefault(), if (rulesOnly) null else LockdownStore.getExpiry(context, pkg),
      RuleStore.enabled(context), AppRulePackages.excluded(context))
  fun changed(context: Context) {
    tracker?.reevaluate()
    LockdownOverlayService.refreshCurrent(context)
  }
}
