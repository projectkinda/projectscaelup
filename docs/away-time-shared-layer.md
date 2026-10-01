# Away time: shared layer (canonical, v5)

Single source of truth for the parts both platforms use. If either platform spec disagrees with this file, **this file wins.** Build this first, before `away-time-ios-spec.md` or `away-time-android-spec.md`.

v5 changes: a heartbeat/failure log so "verified" can be computed (was: only the last heartbeat); censored "still away" values so the coach sees sessions with no relapse; turning the feature off clears derived data too.

## What the feature is

Show how long the user has stayed away from the apps they flagged, and log when those apps were really used. It powers the paid break-quality insight and the focus coach. It measures time away from **flagged apps**, never "away from the phone"; all copy says "flagged apps."

- **Real use:** a flagged app used for about **60 seconds or more**. iOS counts cumulative use inside a monitoring window; Android counts a continuous visit. They differ at the edges, which is fine for hour-scale numbers.
- **Use log:** a timestamped row each time a real use is detected, including with the app closed and outside sessions.
- **Away time:** time since the last real use, shown rounded.
- **After-session away time:** time from session end to the next real use. An **hour-scale** metric; gaps under about 15 minutes can't be told apart from a short glance and are not shown as precise.

## Schema (one definition for both platforms)

```sql
CREATE TABLE IF NOT EXISTS app_use_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_identifier TEXT NOT NULL,
  used_at TEXT NOT NULL,
  platform TEXT NOT NULL,          -- 'android' | 'ios'
  UNIQUE (app_identifier, used_at)
);

-- Heartbeats and arming failures, one row each. Needed to compute gaps
-- between a session's end and the next use (the last heartbeat alone can't).
CREATE TABLE IF NOT EXISTS tracking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,              -- 'heartbeat' | 'failure'
  platform TEXT NOT NULL,
  UNIQUE (at, kind)
);

-- new columns on sessions (nullable, no backfill)
ended_at                      TEXT     -- set in completeSession and voidSession
after_session_away_seconds    INTEGER  -- exact when censored = 0; a lower bound when censored = 1
after_session_away_censored   INTEGER  -- 1 if the next use isn't known (still away, or a gap hid it)
after_session_away_verified   INTEGER  -- 1 if the stored value is trustworthy as stated, 0 if a tracking gap lay inside the measured stretch
```

- **Identifiers:** iOS reuses the existing format from `src/domain/iosScreenTime.ts`: `ios.app.<appKey>`, or `ios.flagged-apps` when the app is unknown. Those constants are currently private to the file, so **export `IOS_APP_PREFIX` and `IOS_ANY_FLAGGED_APP`** (or add one small helper) instead of redefining them. Android uses the package name, as the rest of the app does. Do not add a second iOS format.
- Away time reads the union of `app_use_log.used_at` and `distraction_events.occurred_at` where `type = 'app_touched'`, because session distractions are real uses too.

## Retention

- **Raw `app_use_log` rows and `tracking_events` rows: 30 days**, purged on app start. Away time needs a few days at most, and every session's derived values are finalized within 24 hours (see below), well inside the window.
- The focus coach does **not** read the raw log. It reads the derived `after_session_away_*` columns on `sessions`, which live as long as the session does. That keeps the sensitive raw data short-lived while the coach has what it needs.
- Add `app_use_log`, `tracking_events`, the derived columns and the retention periods to the "Data at rest" row of `docs/security-privacy-review.md`.

## After-session away values (what the coach reads)

For each ended session, `drainAwayLog()` settles one of three states:

| State | censored | verified | seconds | Coach uses it? |
|---|---|---|---|---|
| **Exact:** next real use is known and no gap lay between `ended_at` and it | 0 | 1 | use time − `ended_at` | Yes, as an exact value |
| **Still away:** no use yet, tracking was continuous so far | 1 | 1 | lower bound: now (or the cutoff) − `ended_at` | Yes, as "at least X" |
| **Gap:** a tracking gap lay inside the measured stretch | 1 | 0 | lower bound up to the start of the first gap | No |

- **Why censored values exist:** without them, a session followed by an afternoon of no relapse never gets a value, and the coach only learns from relapses. The best breaks would be missing.
- **Cutoff:** a "still away" value is finalized when the next session starts or 24 hours after `ended_at`, whichever comes first. Until then it is not stored (the UI computes it live).
- **Late use:** if a real use arrives after a censored value was stored and no gap lay before it, overwrite with the exact value (censored 0, verified 1). If a gap lay before it, keep the lower bound as is.
- **Gap rule:** take `ended_at`, every `heartbeat` row in the stretch, and the stop time (the use, or the cutoff). Any adjacent pair more than the platform's stale threshold apart is a gap, and so is any `failure` row inside the stretch.

## Turning the feature off

Off must mean off:
- stop tracking (iOS: the ambient activity and keepers; Android: unregister the tracker);
- delete all `app_use_log` and `tracking_events` rows;
- **set `after_session_away_seconds`, `after_session_away_censored` and `after_session_away_verified` to NULL on every session.** `ended_at` stays, because it isn't usage data.

The privacy copy says exactly this.

## JS functions (`src/domain/awayTime.ts`)

- `drainAwayLog()`: pull buffered use rows and tracking events from the native side, `INSERT OR IGNORE`, then settle `after_session_away_*` for any ended session as above. Call on app foreground, at session start, and before showing any away number.
- `getAwaySince()`: latest real use across flagged apps (union above).
- `getAwayDisplay()`: applies the display rule below, returns `about | at_least | hidden` plus seconds.
- `formatAwayTime(seconds)`: under 1 h round to the nearest 5 min; 1 to 24 h to the nearest 15 min ("about 3 h 15 min"); over 24 h days and hours.
- `clearAwayData()`: the "turning the feature off" steps above.

## Heartbeat contract (platform-specific writers, shared meaning)

A heartbeat means "usage tracking was **armed and able to fire** at this time." It does not mean "some code ran."

- **Write a heartbeat only after confirming monitoring is armed** (iOS: the ambient activity is in `center.activities`; Android: the accessibility service is connected and the tracker is registered).
- If a restart or arming step fails (throws, activity limit hit, service not connected), **write a `failure` row with a timestamp and no heartbeat.** It counts as a gap.
- Each platform exposes: its heartbeat and failure rows (drained into `tracking_events`), and whether tracking is currently enabled/authorized.
- Writers append to a native buffer (iOS: the shared app-group store); the app drains it, as with use rows.

## Display rule

Inputs: last real use, last heartbeat, tracking enabled/authorized, opted in.

- Not opted in, no heartbeat yet, authorization revoked, or service disabled: **hidden.** The away clock starts at the first heartbeat after opt-in, not at the toggle.
- Heartbeat fresh (age within the platform's stale threshold): **"about X"**, X = now − last use.
- Heartbeat stale: **"at least X"**, X = last heartbeat − last use. Never count the stale stretch.
- After a gap, the count restarts from when tracking resumed.

**Stale thresholds:** iOS 6.5 hours (keepers are 6 hours apart plus slack). Android uses the enabled check, not an age threshold, because the accessibility service runs continuously while enabled.

**Known limit, stated plainly:** on iOS, a quiet period can't be told apart from silent tracker death until the next keeper is due. If tracking dies silently right after a heartbeat, "about X" can overstate by up to the stale threshold (about 6.5 hours). That's why the copy says "about," and why the coach only learns from `verified = 1` values.

## Build order

1. This shared layer (schema, `ended_at`, export, `awayTime.ts`, display rule, retention, privacy doc).
2. iOS: Test 0, then the prototype, then the build (see the iOS spec).
3. Android: after the Play accessibility declaration check (see the Android spec).
