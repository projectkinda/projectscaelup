import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/tokens';

export function StatIcon({ name }: { name: 'flame' | 'checklist' | 'trophy' }) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
    stroke={name === 'flame' ? colors.rewardAmber : colors.muted} strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d={name === 'flame'
      ? 'M13 2c1 5-4 6-4 10-2-1-3-3-3-3s-3 4-2 8a8 8 0 0 0 16-1c0-5-4-10-7-14Z'
      : name === 'checklist' ? 'M3 6l2 2 3-4M11 6h10M3 16l2 2 3-4M11 16h10'
      : 'M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 15v6M8 21h8'} />
  </Svg>;
}
