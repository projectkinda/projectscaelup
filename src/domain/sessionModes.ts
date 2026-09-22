export type SessionMode = {
  id: string;
  name: string;
  tabLabel: string;
  gracePeriodSeconds: number;
  isPaid: boolean;
};

export const BUILT_IN_MODES: SessionMode[] = [
  {
    id: 'deep-work',
    name: 'Deep Work',
    tabLabel: 'DEEP WORK',
    gracePeriodSeconds: 5,
    isPaid: false,
  },
  {
    id: 'home-work',
    name: 'Home Work',
    tabLabel: 'HOME WORK',
    gracePeriodSeconds: 12,
    isPaid: false,
  },
  {
    id: 'meditation',
    name: 'Meditation',
    tabLabel: 'MEDITATION',
    gracePeriodSeconds: 45,
    isPaid: true,
  },
  {
    id: 'exam-prep',
    name: 'Exam Prep',
    tabLabel: 'EXAM PREP',
    gracePeriodSeconds: 12,
    isPaid: true,
  },
  {
    id: 'creative-work',
    name: 'Creative Work',
    tabLabel: 'CREATIVE WORK',
    gracePeriodSeconds: 12,
    isPaid: true,
  },
  {
    id: 'online-class',
    name: 'Online Class',
    tabLabel: 'ONLINE CLASS',
    gracePeriodSeconds: 12,
    isPaid: true,
  },
];

export const HOME_MODES = BUILT_IN_MODES.slice(0, 3);
