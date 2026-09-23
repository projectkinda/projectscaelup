import { useWindowDimensions } from 'react-native';

export const colors = {
  background: '#121212',
  ink: '#EDEDED',
  muted: '#7E7E7E',
  panelTop: '#303030',
  panelBottom: '#171717',
  module: '#0D0D0D',
  white: '#F6F9FD',
  warmWhite: '#FDFBF6',
  rewardAmber: '#C8912E',
  mutedRust: '#A45F4B',
  divider: 'rgba(26, 26, 26, 0.10)',
} as const;

export const layout = {
  contentMaxWidth: 402,
  horizontalPadding: 16,
  bottomNavHeight: 92,
} as const;

// Design reference width the pixel values in this file were tuned against.
const BASE_WIDTH = 402;
const MIN_SCALE = 0.82;
const MAX_SCALE = 1.2;

export function getScale(windowWidth: number): number {
  const usableWidth = Math.min(windowWidth, layout.contentMaxWidth);
  const raw = usableWidth / BASE_WIDTH;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

export function useScale(): number {
  const { width } = useWindowDimensions();
  return getScale(width);
}
