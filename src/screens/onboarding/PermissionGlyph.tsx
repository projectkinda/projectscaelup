import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../../theme/tokens';

// Outline icons for the iPhone permissions hub, in the same 24pt outline style as the
// tab-bar icons. Camera and hourglass (Screen Time's own symbol).
export function PermissionGlyph({ kind, size = 24 }: { kind: 'camera' | 'screenTime'; size?: number }) {
  const common = { stroke: colors.ink, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {kind === 'camera' ? (
        <>
          <Path {...common} d="M4 8.5A2 2 0 0 1 6 6.5h1.6l1.1-1.7h6.6l1.1 1.7H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <Circle {...common} cx="12" cy="12.6" r="3.3" />
        </>
      ) : (
        <>
          <Path {...common} d="M7 3.5h10M7 20.5h10" />
          <Path {...common} d="M8.2 3.5v3a4 4 0 0 0 1.5 3.1L12 12l-2.3 2.4a4 4 0 0 0-1.5 3.1v3M15.8 3.5v3a4 4 0 0 1-1.5 3.1L12 12l2.3 2.4a4 4 0 0 1 1.5 3.1v3" />
        </>
      )}
    </Svg>
  );
}
