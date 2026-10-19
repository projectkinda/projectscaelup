import {
  getHomeModes,
  customModeToSessionMode,
  type SessionMode,
} from '../domain/sessionModes';
import { ensureSchema, getDatabase } from './database';

// This table has no created_at; upserts preserve rowid when editing.
export const CUSTOM_MODE_ORDER_BY = 'rowid DESC';

type CustomModeRow = {
  id: string;
  name: string;
  grace_period_seconds: number;
  default_minutes: number;
  frame_width_min: number;
  frame_width_max: number;
};

export async function loadAvailableModes(
  paidUser: boolean,
): Promise<SessionMode[]> {
  if (!paidUser) {
    return getHomeModes(false);
  }

  const database = await getDatabase();
  await ensureSchema(database);

  const customRows = await database.getAllAsync<CustomModeRow>(
    `
      SELECT id,
             name,
             grace_period_seconds,
             default_minutes,
             frame_width_min,
             frame_width_max
      FROM custom_modes
      ORDER BY ${CUSTOM_MODE_ORDER_BY};
    `,
  );

  const customModes: SessionMode[] = customRows.map(row => customModeToSessionMode({
    id: row.id,
    name: row.name,
    gracePeriodSeconds: row.grace_period_seconds,
    defaultMinutes: row.default_minutes,
    frameWidthRange: [row.frame_width_min, row.frame_width_max],
  }));

  return getHomeModes(true, customModes);
}
