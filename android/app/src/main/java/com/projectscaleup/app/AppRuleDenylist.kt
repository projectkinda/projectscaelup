package com.projectscaleup.app

/** Mirrored by APP_RULE_DENYLIST in appRules.ts. Runtime roles extend this list. */
object AppRuleDenylist {
  val PACKAGES = setOf(
    BuildConfig.APPLICATION_ID, "com.android.systemui", "com.android.settings",
    "com.android.phone", "com.android.server.telecom", "com.samsung.android.incallui",
    "com.android.emergency", "com.google.android.apps.safetyhub",
  )
  fun allows(pkg: String, excluded: Set<String> = emptySet()): Boolean {
    val lower = pkg.lowercase()
    return pkg.matches(Regex("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z0-9_]+)+")) &&
      lower !in PACKAGES && pkg !in excluded && !lower.contains("inputmethod") &&
      !lower.contains("keyboard") && !lower.contains("emergency")
  }
}
