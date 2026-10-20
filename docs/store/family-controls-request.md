# Family Controls (distribution) entitlement request

**Submit this first, and as early as possible.** Apple reviews it by hand and it can take weeks. The development
entitlement already works on your own devices; shipping needs the *distribution* entitlement.
Request it at https://developer.apple.com/contact/request/family-controls-distribution (needs the paid Developer
Program account and the Account Holder).

Request it for **all four bundle IDs** (each target is signed separately):

| Target | Bundle ID |
| --- | --- |
| App | `com.projectscaleup.app` |
| Device Activity Monitor extension | `com.projectscaleup.app.ActivityMonitor` |
| Shield Configuration extension | `com.projectscaleup.app.ShieldConfiguration` |
| Shield Action extension | `com.projectscaleup.app.ShieldAction` |

App Group (register it and add it to all four): `group.com.projectscaleup.app`. Also set `ios.appleTeamId` in `app.json`.

## Text to paste (adjust the contact lines)

**App name:** Project ScaleUp

**What does your app do?**
Project ScaleUp is a focus timer for individuals. A person starts a timed session and the app confirms, using the front
camera analysed on device, that they stay at their desk. They also choose a short list of apps that distract them.
During the session the app records, on the device, if they open one of those apps. When the session ends, only the apps
they actually opened are locked for a short time (10 minutes plus 2 minutes per distraction, up to 60 minutes), so the
person feels the cost of the distraction. An optional strict mode locks the chosen apps for the whole session instead.

**How do you use the Family Controls entitlement?**
We use the individual authorization (`AuthorizationCenter.requestAuthorization(for: .individual)`) so a person can
manage their own use of their own device. We use `FamilyActivityPicker` so the person chooses the apps, and we receive only
opaque `ApplicationToken`s. We use `DeviceActivityMonitor` to learn that a chosen app was used during a session, and
`ManagedSettingsStore` plus the Shield Configuration and Shield Action extensions to lock those apps and explain why.

**Who is the user, and do they consent?**
The user is the device owner. The person grants Screen Time access in the system prompt and chooses every app that is
tracked or locked. They can remove access in Settings at any time. The app is not for parental control and never
manages another person's device.

**What data do you collect, and where does it go?**
None leaves the device. The app never sees which apps were chosen (tokens are opaque) or the person's Screen Time data.
Session history (times and counts) is stored only in the app's local database and an App Group container shared with the
extensions. We make no network requests, use no analytics or advertising SDKs, and do not track users.

**Privacy policy URL:** ⚠ `https://<your-host>/privacy`

**Contact:** ⚠ name, email, phone
