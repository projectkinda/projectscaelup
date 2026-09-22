import { ensureSchema, getDatabase } from './database';

export type FlaggedApp = {
  appIdentifier: string;
  displayName: string;
};

export type CustomMode = {
  id: string;
  name: string;
  gracePeriodSeconds: number;
};

type FlaggedAppRow = {
  app_identifier: string;
  display_name: string;
};

type CustomModeRow = {
  id: string;
  name: string;
  grace_period_seconds: number;
};

export type SettingsData = {
  flaggedApps: FlaggedApp[];
  customModes: CustomMode[];
};

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
    })),
  };
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
