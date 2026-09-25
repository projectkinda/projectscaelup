import {
  BUILT_IN_MODES,
  type SessionMode,
} from '../domain/sessionModes';
import { ensureSchema, getDatabase } from './database';

type CustomModeRow = {
  id: string;
  name: string;
  grace_period_seconds: number;
  frame_width_min: number;
  frame_width_max: number;
};

export async function loadAvailableModes(
  paidUser: boolean,
): Promise<SessionMode[]> {
  if (!paidUser) {
    return BUILT_IN_MODES.filter(mode => !mode.isPaid);
  }

  const database = await getDatabase();
  await ensureSchema(database);

  const customRows = await database.getAllAsync<CustomModeRow>(
    `
      SELECT id,
             name,
             grace_period_seconds,
             frame_width_min,
             frame_width_max
      FROM custom_modes
      ORDER BY name ASC;
    `,
  );

  const customModes: SessionMode[] = customRows.map(row => ({
    id: row.id,
    name: row.name,
    tabLabel: row.name.toUpperCase(),
    gracePeriodSeconds: row.grace_period_seconds,
    frameWidthRange: [row.frame_width_min, row.frame_width_max],
    detectionModel: 'face',
    isPaid: true,
  }));

  return [...BUILT_IN_MODES, ...customModes];
}
