import { ensureSchema, getDatabase } from './database';
import { getInstalledApps } from '../domain/appPicker';

export type FlaggedApp = {
  appIdentifier: string;
  displayName: string;
  iconBase64?: string;
};

export type CustomMode = {
  id: string;
  name: string;
  gracePeriodSeconds: number;
  frameWidthRange: [number, number];
};

type FlaggedAppRow = {
  app_identifier: string;
  display_name: string;
  icon_base64: string | null;
};

type CustomModeRow = {
  id: string;
  name: string;
  grace_period_seconds: number;
  frame_width_min: number;
  frame_width_max: number;
};

export type SaveCustomModeInput = {
  id?: string;
  name: string;
  gracePeriodSeconds: number;
};

export type SettingsData = {
  flaggedApps: FlaggedApp[];
  customModes: CustomMode[];
};

export const FREE_TIER_APP_CAP = 3;

const LEGACY_DEFAULT_APPS_SEEDED_KEY = 'defaultAppsSeeded';
const LEGACY_DEFAULT_FLAGGED_APP_IDENTIFIERS = [
  'com.instagram.android',
  'com.zhiliaoapp.musically',
  'com.snapchat.android',
  'com.facebook.katana',
  'com.twitter.android',
];

async function clearLegacyDefaultFlaggedApps() {
  const database = await getDatabase();
  await ensureSchema(database);

  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_state WHERE key = ?;',
    [LEGACY_DEFAULT_APPS_SEEDED_KEY],
  );

  if (row?.value !== 'true') {
    return;
  }

  for (const appIdentifier of LEGACY_DEFAULT_FLAGGED_APP_IDENTIFIERS) {
    await database.runAsync(
      'DELETE FROM flagged_apps WHERE app_identifier = ?;',
      [appIdentifier],
    );
  }

  await database.runAsync('DELETE FROM app_state WHERE key = ?;', [
    LEGACY_DEFAULT_APPS_SEEDED_KEY,
  ]);
}

export async function loadSettingsData({
  isPaidUser = false,
}: {
  isPaidUser?: boolean;
} = {}): Promise<SettingsData> {
  const database = await getDatabase();
  await ensureSchema(database);
  await clearLegacyDefaultFlaggedApps();

  const flaggedRows = await database.getAllAsync<FlaggedAppRow>(
    `
      SELECT app_identifier, display_name, icon_base64
      FROM flagged_apps
      ORDER BY display_name ASC;
    `,
  );
  const flaggedApps = flaggedRows.map(row => ({
    appIdentifier: row.app_identifier,
    displayName: row.display_name,
    iconBase64: row.icon_base64 ?? undefined,
  }));
  const appsMissingIcons = flaggedApps.some(app => !app.iconBase64);

  if (appsMissingIcons) {
    try {
      const installedApps = await getInstalledApps();
      const installedAppsByPackageName = new Map(
        installedApps.map(app => [app.packageName, app]),
      );

      for (const app of flaggedApps) {
        if (app.iconBase64) {
          continue;
        }

        const installedApp = installedAppsByPackageName.get(app.appIdentifier);
        if (!installedApp?.iconBase64) {
          continue;
        }

        app.iconBase64 = installedApp.iconBase64;
        await database.runAsync(
          `
            UPDATE flagged_apps
            SET icon_base64 = ?
            WHERE app_identifier = ?;
          `,
          [installedApp.iconBase64, app.appIdentifier],
        );
      }
    } catch (error) {
      console.warn('Could not hydrate flagged app icons:', error);
    }
  }

  const customModeRows = isPaidUser
    ? await database.getAllAsync<CustomModeRow>(
        `
          SELECT id, name, grace_period_seconds
               , frame_width_min, frame_width_max
          FROM custom_modes
          ORDER BY name ASC;
        `,
      )
    : [];

  return {
    flaggedApps,
    customModes: customModeRows.map(row => ({
      id: row.id,
      name: row.name,
      gracePeriodSeconds: row.grace_period_seconds,
      frameWidthRange: [row.frame_width_min, row.frame_width_max],
    })),
  };
}

export async function canAddAnotherFlaggedApp(
  paidUser: boolean,
): Promise<boolean> {
  if (paidUser) {
    return true;
  }

  const database = await getDatabase();
  await ensureSchema(database);

  const countRow = await database.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM flagged_apps;
    `,
  );

  return (countRow?.count ?? 0) < FREE_TIER_APP_CAP;
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return slug || 'custom-mode';
}

function getFrameWidthRange(gracePeriodSeconds: number): [number, number] {
  return gracePeriodSeconds >= 30 ? [5, 20] : [15, 40];
}

export async function saveCustomMode({
  id,
  name,
  gracePeriodSeconds,
}: SaveCustomModeInput): Promise<CustomMode> {
  const database = await getDatabase();
  await ensureSchema(database);

  const trimmedName = name.trim().slice(0, 20);
  const boundedGracePeriod = Math.max(3, Math.min(90, gracePeriodSeconds));
  const frameWidthRange = getFrameWidthRange(boundedGracePeriod);
  const modeId = id ?? `${slugify(trimmedName)}-${Date.now().toString(36)}`;

  await database.runAsync(
    `
      INSERT INTO custom_modes (
        id,
        name,
        grace_period_seconds,
        frame_width_min,
        frame_width_max
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        grace_period_seconds = excluded.grace_period_seconds,
        frame_width_min = excluded.frame_width_min,
        frame_width_max = excluded.frame_width_max;
    `,
    [
      modeId,
      trimmedName,
      boundedGracePeriod,
      frameWidthRange[0],
      frameWidthRange[1],
    ],
  );

  return {
    id: modeId,
    name: trimmedName,
    gracePeriodSeconds: boundedGracePeriod,
    frameWidthRange,
  };
}

export async function saveFlaggedApp(app: FlaggedApp): Promise<FlaggedApp> {
  const database = await getDatabase();
  await ensureSchema(database);

  await database.runAsync(
    `
      INSERT INTO flagged_apps (app_identifier, display_name, icon_base64)
      VALUES (?, ?, ?)
      ON CONFLICT(app_identifier) DO UPDATE SET
        display_name = excluded.display_name,
        icon_base64 = excluded.icon_base64;
    `,
    [app.appIdentifier, app.displayName, app.iconBase64 ?? null],
  );

  return app;
}

export async function removeFlaggedApp(appIdentifier: string) {
  const database = await getDatabase();
  await ensureSchema(database);

  await database.runAsync(
    'DELETE FROM flagged_apps WHERE app_identifier = ?;',
    [appIdentifier],
  );
}

export async function removeCustomMode(id: string) {
  const database = await getDatabase();
  await ensureSchema(database);

  await database.runAsync('DELETE FROM custom_modes WHERE id = ?;', [id]);
}
