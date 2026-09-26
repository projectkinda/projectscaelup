# Screen Time (iOS)

Locks flagged apps during focus sessions and after them (lockdown). Design and
reasoning: [docs/ios-screen-time-design.md](../../docs/ios-screen-time-design.md).

| Path | What it is |
|---|---|
| `core/` | **ScreenTimeCore**: all rules and state, shared by the app and the extensions. `Rules/` is Foundation-only and unit-tested; `Platform/` talks to FamilyControls, ManagedSettings and DeviceActivity. |
| `ios/` | **ScreenTime** Expo module: the JavaScript bridge, Apple's app picker sheet, and the flagged-app icon view. No rules live here. |
| `src/`, `index.ts` | TypeScript API. Every call is a no-op where the native module isn't present (Android, web). |
| `../../targets/` | The three app extensions (`@bacons/apple-targets`): ActivityMonitor, ShieldConfiguration and ShieldAction. Each is a thin shell over ScreenTimeCore. |

## Rules of the road

- **Every process calls `ScreenTimeEngine.live`.** Each operation updates the
  shared state and then reconciles (settle due transitions, set shields,
  schedule the next wake-up). Reconciling is idempotent, so any process may do
  it at any time.
- **Put decisions in `ScreenTimePolicy`** as pure functions of `(state, now)`,
  with a test. The extensions and the module should only read, call the
  policy, and apply the result.
- **Tokens never reach JavaScript.** JS sees counts and statuses only.

## Testing

```bash
cd modules/screen-time/core && swift test
```

The Simulator can build and run the app, request authorization and exercise the
JavaScript ↔ native session calls. Shields, the lock screen and DeviceActivity
wake-ups need a real iPhone signed with the Family Controls entitlement; test
with the app killed and disconnected from Xcode.
