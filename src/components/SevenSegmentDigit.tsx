import React from 'react';
import { View } from 'react-native';

type SegmentName = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

const ACTIVE_SEGMENTS: Record<string, SegmentName[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'd', 'e', 'g'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '4': ['b', 'c', 'f', 'g'],
  '5': ['a', 'c', 'd', 'f', 'g'],
  '6': ['a', 'c', 'd', 'e', 'f', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
};

// Base dimensions this glyph was drawn at; `scale` resizes every segment
// proportionally so the digit reads cleanly from small phones to tablets.
const BASE = {
  width: 39,
  height: 64,
  segmentThickness: 6,
  horizontalLength: 27,
  verticalLength: 26,
};

export function SevenSegmentDigit({
  value,
  scale = 1,
}: {
  value: string;
  scale?: number;
}) {
  const active = ACTIVE_SEGMENTS[value] ?? [];

  const width = BASE.width * scale;
  const height = BASE.height * scale;
  const thickness = BASE.segmentThickness * scale;
  const hLength = BASE.horizontalLength * scale;
  const vLength = BASE.verticalLength * scale;
  const inset = 6 * scale;
  const gTop = 29 * scale;

  const segmentBase = {
    position: 'absolute' as const,
    backgroundColor: 'rgba(246, 249, 253, 0.045)',
    borderRadius: 2 * scale,
  };
  const activeStyle = {
    backgroundColor: '#F6F9FD',
    shadowColor: '#F6F9FD',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 7,
    elevation: 4,
  };

  const horizontalPositions: Record<string, object> = {
    a: { top: 0 },
    g: { top: gTop },
    d: { bottom: 0 },
  };
  const verticalPositions: Record<string, object> = {
    f: { left: 0, top: inset },
    b: { right: 0, top: inset },
    e: { left: 0, bottom: inset },
    c: { right: 0, bottom: inset },
  };

  return (
    <View
      style={{ width, height }}
      importantForAccessibility="no-hide-descendants"
    >
      {(['a', 'g', 'd'] as SegmentName[]).map(segment => (
        <View
          key={segment}
          style={[
            segmentBase,
            { width: hLength, height: thickness, left: inset },
            horizontalPositions[segment],
            active.includes(segment) && activeStyle,
          ]}
        />
      ))}
      {(['f', 'b', 'e', 'c'] as SegmentName[]).map(segment => (
        <View
          key={segment}
          style={[
            segmentBase,
            { width: thickness, height: vLength },
            verticalPositions[segment],
            active.includes(segment) && activeStyle,
          ]}
        />
      ))}
    </View>
  );
}
