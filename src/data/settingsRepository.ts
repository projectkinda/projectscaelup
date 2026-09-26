import { ensureSchema, getDatabase } from './database';
import { getInstalledApps } from '../domain/appPicker';

export type FlaggedApp = {
  appIdentifier: string;
  displayName: string;
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

const DEFAULT_APPS_SEEDED_KEY = 'defaultAppsSeeded';

const DEFAULT_FLAGGED_PACKAGES: FlaggedApp[] = [
  { appIdentifier: 'com.instagram.android', displayName: 'Instagram' },
  { appIdentifier: 'com.zhiliaoapp.musically', displayName: 'TikTok' },
  { appIdentifier: 'com.snapchat.android', displayName: 'Snapchat' },
  { appIdentifier: 'com.facebook.katana', displayName: 'Facebook' },
  { appIdentifier: 'com.twitter.android', displayName: 'X' },
];

async function getAppStateFlag(key: string): Promise<boolean> {
  const database = await getDatabase();
  await ensureSchema(database);

  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_state WHERE key = ?;',
    [key],
  );

  return row?.value === 'true';
}

async function setAppStateFlag(key: string, value: boolean): Promise<void> {
  const database = await getDatabase();
  await ensureSchema(database);

  await database.runAsync(
    `
      INSERT INTO app_state (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value;
    `,
    [key, value ? 'true' : 'false'],
  );
}

export async function loadSettingsData({
  isPaidUser = false,
}: {
  isPaidUser?: boolean;
} = {}): Promise<SettingsData> {
  const database = await getDatabase();
  await ensureSchema(database);

  const flaggedRows = await database.getAllAsync<FlaggedAppRow>(
    `
      SELECT app_identifier, display_name
      FROM flagged_apps
      ORDER BY display_name ASC;
    `,
  );

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
    flaggedApps: flaggedRows.map(row => ({
      appIdentifier: row.app_identifier,
      displayName: row.display_name,
    })),
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

export async function seedDefaultFlaggedApps({
  isPaidUser = false,
}: {
  isPaidUser?: boolean;
} = {}): Promise<void> {
  const alreadySeeded = await getAppStateFlag(DEFAULT_APPS_SEEDED_KEY);
  if (alreadySeeded) {
    return;
  }

  const installedApps = await getInstalledApps();
  const installedPackageNames = new Set(
    installedApps.map(app => app.packageName),
  );
  const database = await getDatabase();
  await ensureSchema(database);

  for (const app of DEFAULT_FLAGGED_PACKAGES) {
    if (!installedPackageNames.has(app.appIdentifier)) {
      continue;
    }

    const canAdd = await canAddAnotherFlaggedApp(isPaidUser);
    if (!canAdd) {
      break;
    }

    await database.runAsync(
      `
        INSERT OR IGNORE INTO flagged_apps (app_identifier, display_name)
        VALUES (?, ?);
      `,
      [app.appIdentifier, app.displayName],
    );
  }

  await setAppStateFlag(DEFAULT_APPS_SEEDED_KEY, true);
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
      INSERT INTO flagged_apps (app_identifier, display_name)
      VALUES (?, ?)
      ON CONFLICT(app_identifier) DO UPDATE SET
        display_name = excluded.display_name;
    `,
    [app.appIdentifier, app.displayName],
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
