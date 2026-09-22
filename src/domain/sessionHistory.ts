import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'projectScaleUp.sessionHistory.v1';

type SessionHistory = {
  count: number;
};

async function readHistory(): Promise<SessionHistory> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { count: 0 };
  }
  try {
    const parsed = JSON.parse(raw);
    return { count: typeof parsed.count === 'number' ? parsed.count : 0 };
  } catch {
    return { count: 0 };
  }
}

export async function getSessionCount(): Promise<number> {
  const history = await readHistory();
  return history.count;
}

export async function recordSessionCompleted(): Promise<number> {
  const history = await readHistory();
  const next = { count: history.count + 1 };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next.count;
}
