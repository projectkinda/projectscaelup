export type SessionMode = {
  id: string;
  name: string;
  tabLabel: string;
  defaultMinutes: number;
  gracePeriodSeconds: number;
  frameWidthRange: [number, number];
  detectionModel: 'face' | 'pose';
  isPaid: boolean;
};

export const BUILT_IN_MODES: SessionMode[] = [
  {
    id: 'deep-work',
    defaultMinutes: 50,
    name: 'Deep Work',
    tabLabel: 'DEEP WORK',
    gracePeriodSeconds: 5,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: false,
  },
  {
    id: 'study',
    defaultMinutes: 45,
    name: 'Study',
    tabLabel: 'STUDY',
    gracePeriodSeconds: 12,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: false,
  },
  {
    id: 'creative-work',
    defaultMinutes: 60,
    name: 'Creative Work',
    tabLabel: 'CREATIVE WORK',
    gracePeriodSeconds: 18,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: false,
  },
  {
    id: 'meditation',
    defaultMinutes: 10,
    name: 'Meditation',
    tabLabel: 'MEDITATION',
    gracePeriodSeconds: 45,
    frameWidthRange: [5, 20],
    detectionModel: 'face',
    isPaid: true,
  },
  {
    id: 'exam-prep',
    defaultMinutes: 60,
    name: 'Exam Prep',
    tabLabel: 'EXAM PREP',
    gracePeriodSeconds: 5,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: true,
  },
  {
    id: 'online-class',
    defaultMinutes: 60,
    name: 'Online Class',
    tabLabel: 'ONLINE CLASS',
    gracePeriodSeconds: 20,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: true,
  },
  {
    id: 'exercise',
    defaultMinutes: 30,
    name: 'Exercise',
    tabLabel: 'EXERCISE',
    gracePeriodSeconds: 75,
    frameWidthRange: [0, 100],
    detectionModel: 'pose',
    isPaid: true,
  },
];

/** Custom modes arrive newest-first from the repository; built-in order is stable. */
export function getHomeModes(paidUser: boolean, customModes: readonly SessionMode[] = []): SessionMode[] {
  if (!paidUser) return BUILT_IN_MODES.filter(mode => !mode.isPaid);
  return [BUILT_IN_MODES[0], ...customModes, ...BUILT_IN_MODES.slice(1)];
}

export function customModeToSessionMode(mode: Pick<SessionMode, 'id' | 'name' | 'gracePeriodSeconds' | 'frameWidthRange' | 'defaultMinutes'>): SessionMode {
  return { ...mode, tabLabel: mode.name.toUpperCase(), detectionModel: 'face', isPaid: true };
}
