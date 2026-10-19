# Shared upgrade screen

PaywallProvider remains the single host above the mounted tabs. Its five callers still use usePaywall().show(feature). The full-screen PaywallScreen modal replaces the bottom sheet without navigating or unmounting the caller. X, Not now and the Android onRequestClose callback dismiss it. The provider passes the safe-area top and bottom insets.

PAYWALL_LAYOUT in src/domain/paywall.ts selects list or table; the default is list. Both use PRO_FEATURES, proFeaturesFor and the unchanged PAYWALL_COPY. The triggered supported feature is first. App rules is Android-only; forcing its trigger on iOS still omits that row.

## Header investigation

The previous title and X shared the first row inside the scrolling content of an intrinsically sized sheet capped at 85% height. There was no separate persistent close control, so scrolling/clipping that row hid both together while the following subtitle could remain visible. The apps title also used a separate native Text auto-fit path, bypassing AppText. No conditional in the component hid the header.

That code-level failure path is removed: the root fills the modal; X has its own nonshrinking 40dp row outside the ScrollView; the hero is nonshrinking and noncollapsable, uses AppText throughout, and has no flex-basis title or auto-fit branch. Child clipping is explicitly disabled. New feature keys reset scrolling. The specific native disappearance reported by the user could not be reproduced without a connected device; native layout/clipping as the cause remains unconfirmed.

## Layout

The background is the existing #121212 token. Hero and body scroll; X and the footer stay fixed. The hero keeps the complete copy, accents only the word Pro, and wraps naturally without line clamps. At the checked 360dp width and font scales 1/1.3, titles fit within two lines and subtitles within three.

List rows use outline SVG icons, descriptions from PRO_FEATURES and the triggered icon's amber accent. Descriptions remain complete within three lines at the checked scales. The table uses the existing panelBottom surface, an amber Pro strip, fixed 80/104dp columns and 56dp rows. Its labels use the existing caption size so all labels fit at font scale 1.3. The 3dp trigger bar occupies the card inset to preserve label width. Numeric cells retain gate values; other availability cells render SVG checks or dashes. Free coach availability is still Basic in the data and accessibility label.

The scroll content's 16dp bottom space plus the footer's 16dp top space provide a minimum 32dp body-to-CTA gap. Remaining space on tall screens stays below the body. Footer bottom padding is max(24, safeAreaBottom + 16). The disabled ink CTA has 40% opacity, with the existing Purchases coming soon caption and DEV_FLAGS gating unchanged.

## Gate audit

- Apps: FREE_TIER_APP_CAP backs the add/picker guards and settingsRepository canAdd check. The list reads that constant.
- History: historyRepository computes its free cutoff with FREE_HISTORY_DAYS. The list reads the same constant. The existing cutoff is local midnight fourteen calendar days before today, including that boundary date and today; the nominal 14-day copy is preserved.
- App rules: Android-only and paid-gated.
- Coach: the free basic selection omits paid coaching sections.
- Custom modes: free loaders/UI exclude custom modes; there is no numeric custom-mode count cap, so no numeric Free sentence is claimed.

No unsupported Free limit was added. No purchase or entitlement behavior changed.

## Verification

scripts/paywall-ui-preview.cjs builds ignored browser previews through the real provider for both layouts, all five triggers, Android/iOS platform filters, font scales 1/1.3 and 360x640. Checks cover complete glyph bounds, hero line counts, descriptions, labels/cells, trigger ordering and amber accents, Pro-strip alignment, pinned controls, safe-area padding, purchase gating, scroll reset, and preserved caller state on all three dismissal callbacks. Browser text scaling and Modal presentation are simulated; these are not native device renders.

TypeScript, canonical paywall/gate checks, flagged-app cap checks and typography checks pass. The older app-rules integration preview now expects the screen/list rather than the removed sheet. Source scans show one PaywallScreen instance in PaywallProvider, one provider in App.tsx, and no old sheet component, stub screen, or paywall navigation route/call.

Not verified on a device: native header rendering, Android hardware back delivery and status-bar/edge-to-edge insets, iOS full-screen presentation and modal stacking above a picker, native font measurement, VoiceOver/TalkBack and focus restoration. Browser callbacks verify the host behavior only. No screenshots are committed; previews remain under ignored .artifacts/.
