export type SessionMode = {
  id: string;
  name: string;
  tabLabel: string;
  gracePeriodSeconds: number;
  frameWidthRange: [number, number];
  detectionModel: 'face' | 'pose';
  isPaid: boolean;
};

export const BUILT_IN_MODES: SessionMode[] = [
  {
    id: 'deep-work',
    name: 'Deep Work',
    tabLabel: 'DEEP WORK',
    gracePeriodSeconds: 5,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: false,
  },
  {
    id: 'study',
    name: 'Study',
    tabLabel: 'STUDY',
    gracePeriodSeconds: 12,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: false,
  },
  {
    id: 'creative-work',
    name: 'Creative Work',
    tabLabel: 'CREATIVE WORK',
    gracePeriodSeconds: 18,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: false,
  },
  {
    id: 'meditation',
    name: 'Meditation',
    tabLabel: 'MEDITATION',
    gracePeriodSeconds: 45,
    frameWidthRange: [5, 20],
    detectionModel: 'face',
    isPaid: true,
  },
  {
    id: 'exam-prep',
    name: 'Exam Prep',
    tabLabel: 'EXAM PREP',
    gracePeriodSeconds: 5,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: true,
  },
  {
    id: 'online-class',
    name: 'Online Class',
    tabLabel: 'ONLINE CLASS',
    gracePeriodSeconds: 20,
    frameWidthRange: [15, 40],
    detectionModel: 'face',
    isPaid: true,
  },
  {
    id: 'exercise',
    name: 'Exercise',
    tabLabel: 'EXERCISE',
    gracePeriodSeconds: 75,
    frameWidthRange: [0, 100],
    detectionModel: 'pose',
    isPaid: true,
  },
];

export function getHomeModes(paidUser: boolean): SessionMode[] {
  return paidUser
    ? BUILT_IN_MODES
    : BUILT_IN_MODES.filter(mode => !mode.isPaid);
}
