# App typography

The app now uses a shared type scale and shared Text/TextInput components. All app-authored labels have a 12dp minimum. Native accessibility enlargement remains enabled; smaller system text settings are compensated so they cannot reduce the rendered minimum. Auto-fit is disabled, and labels wrap instead.

| Role | Size / line height | Pairing |
| --- | --- | --- |
| Caption and metadata | 12 / 18 | Geist regular |
| Compact labels and controls | 13 / 19 | Geist regular; semibold for controls |
| Body | 16 / 22 | Geist regular |
| Subheading | 18 / 26 | Geist regular or semibold |
| Card heading | 20 / 28 | Geist semibold |
| Stat | 22 / 28 | Geist semibold |
| Metric | 24 / 32 | Geist semibold |
| Screen title | 32 / 40 | Geist semibold |
| Display heading | 38 / 50 | Geist semibold |

Geist Regular and SemiBold load at the app root before screens render. Existing medium reading weights resolve to Regular; weight 600 and above resolve to the actual SemiBold face, without synthetic bold. All 29 React components use the shared text components, including settings, onboarding, session flows, navigation, coach notes and the History summary. SVG chart labels use Geist at 12dp and the chart scrolls horizontally on narrow layouts instead of scaling the text down. The timer's existing seven-segment digits remain vector artwork. Apple's opaque flagged-app names keep their system-rendered font with an explicit native 12pt floor; OS-owned pickers and notifications retain system typography.

Layout adjustments: the timer hint and navigation labels can grow vertically; the home suggestion wraps; coach sentences can grow instead of truncating; History stat labels reserve two lines at the larger size. Display headings use extra line spacing after enlarged onboarding headings showed glyph clipping.

Validation:

- `npx tsc --noEmit`: clean.
- `npx tsx scripts/typography-check.ts`: hierarchy, family pairing, minimum size at 0.85/1/1.3/2 system scales, and source audit of all 29 components passed.
- History fixtures: 16 passed. Coach fixtures: 87 passed. Live timer fixtures: 20 passed.
- Browser previews at 360dp and font scales 1 and 1.3: 12 History stat states, 16 coach states, and 8 navigation/onboarding/upgrade states passed overflow checks. The latter use the real shared Text component; the card previews simulate native font enlargement. Native libraries and safe-area values are mocked for these browser checks.
- No connected Android device or iOS runtime was available, so on-device rendering and native Swift compilation remain unverified.

Core files: `src/theme/typography.ts`, `src/components/AppText.tsx`, `App.tsx`, `scripts/typography-check.ts`; typography roles are applied throughout `src/screens` and `src/components`. Native floor: `modules/screen-time/ios/FlaggedAppLabelView.swift`.

Updated hierarchy: body stays at 16dp; captions, chart ticks, weekday initials, and secondary metadata use 12dp. Compact control labels, stat labels, pending note titles, and coach actions use 13dp. The shared minimum is now 12dp, superseding the earlier 14dp requirement.
