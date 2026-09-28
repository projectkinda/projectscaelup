import { ensureSchema, getDatabase } from './database';

export async function getAppState(key: string): Promise<string | null> {
  const database = await getDatabase();
  await ensureSchema(database);

  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_state WHERE key = ?;',
    [key],
  );

  return row?.value ?? null;
}

export async function setAppState(
  key: string,
  value: string,
): Promise<void> {
  const database = await getDatabase();
  await ensureSchema(database);

  await database.runAsync(
    'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?);',
    [key, value],
  );
}
