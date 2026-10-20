# App Review notes (paste into App Store Connect > App Review Information)

⚠ Fill in the contact fields: first/last name, phone, email. No sign-in is needed, so leave "Sign-in required" off.

## Notes for the reviewer

Project ScaleUp is a focus timer. There is no account or login, and the app makes no network requests.

**To try it (about 2 minutes):**
1. Open the app and tap *Get started*.
2. Allow **Camera** when asked. The front camera checks, on device, that the user is at their desk during a session. No photo or video is stored or sent.
3. Allow **Screen Time** (Apple's Family Controls authorization) when asked. This is used only to notice when the user opens apps *they chose* during a session, and to lock those apps afterwards.
4. Choose the apps to flag in Apple's own picker (the app never sees which apps were picked; it only receives opaque tokens).
5. On Home, pick a mode and tap *Start*. After a short camera check the timer runs. Use *Pause* or *End Early* at any time.
6. When a session ends, apps the user opened during it are locked for 10 minutes plus 2 minutes per distraction (maximum 60). The shield on a locked app is a standard system shield with a short message.

**Family Controls.** The app uses the Family Controls, Device Activity, and Managed Settings frameworks, with the individual authorization (`.individual`), on the user's own device and for the user's own benefit. It does not manage another person's device, show web content, or send any usage data anywhere. The app and its three extensions (Activity Monitor, Shield Configuration, Shield Action) share one App Group for local state only.

**Camera.** Live frames are analysed with Apple's Vision framework on device to detect whether a face or upper body is in view. Frames are never saved, uploaded or shown to anyone.

**Background activity.** The app does not declare any background modes. The Device Activity Monitor extension is woken by the system only to end a lock on schedule or record that a flagged app was used.

**If Screen Time is declined,** the app still works: the timer and camera check run, and Progress is available. Flagged-app tracking and locking are simply off. Settings > Permission status explains how to turn them on.

**Purchases.** ⚠ Update this paragraph after deciding the Pro question (see `app-store-listing.md`). If 1.0 ships fully free, say: "This version has no in-app purchases."

**Demo data.** Nothing to seed; a fresh install is the intended first-run experience.
