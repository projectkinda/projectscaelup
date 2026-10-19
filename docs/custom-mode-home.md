# Custom modes on Home

Home and Settings now share CustomModeEditorModal, including form state, name validation, the Look-away allowance slider/copy, persistence and save feedback. Settings retains create, edit and delete. Home opens the same editor in create mode for paid users; its free plus button uses the existing single paywall host with feature modes. The plus keeps the same left-end position and styling for both tiers. All mode tabs use the same rendering/styles, with no custom-specific treatment or gestures.

The existing custom_modes schema has no created_at. Both repository queries therefore use the shared rowid DESC ordering, with no migration. Existing ON CONFLICT DO UPDATE writes preserve rowid on edits. Home composes [first built-in, custom newest-first, remaining built-ins]; free lists retain their previous non-paid built-ins. Settings prepends newly saved modes and updates edited items in place, matching its repository order.

Home currently has no persisted last-used mode key. Its activeModeId is component state initialized to the first built-in (Deep Work), and remains while Home stays mounted. Reloading leaves a valid selection intact. If the selected mode was deleted or is no longer available, the existing fallback selects the first mode. Creating from Home intentionally selects the newly saved mode after reloading; a load generation protects that result from older in-flight reloads. The target tab is revealed through ScrollView.scrollTo after its layout and the strip width are measured. The new tab receives exactly the same active style as built-ins.

Verification:

- scripts/custom-modes-check.ts: pure zero/two-custom ordering, unchanged built-in/free order and default; real SQLite queries using the current custom_modes schema; matching Home/Settings newest-first order; edits preserve rowid/position; free loaders exclude custom modes.
- scripts/custom-modes-ui-preview.cjs: browser fixtures extract the production mode-bar JSX, state, reload/save handlers and Settings custom-mode section. They use the real shared editor and paywall provider with repository fixtures. At 360dp and font scales 1/1.3, all eight cases / 70 checks pass: paid zero/two modes, existing selection after reload, validation, create/save/reload/select, scrollTo and full visibility from a previously scrolled strip, matching tab styling, Settings create/edit/delete/order, and free modes paywall.
- The updated existing app-rules preview uses the shared editor and passes 54 cases / 1,502 assertions.
- TypeScript, paywall/gate, app-cap, typography and app-rules checks pass.

The browser fixture runs against real layout frames. Browser scroll animation is made immediate for measurement; native animation is not simulated. Native Modal presentation, keyboard behavior, Android/iOS scrolling and focus restoration were not verified on a device. Screenshots are not committed; local generated fixtures are under ignored .artifacts/.
