import Svg, { Rect } from 'react-native-svg';

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

const BASE = {
  width: 39,
  height: 64,
  segmentThickness: 6,
  horizontalLength: 27,
  verticalLength: 26,
};

const SEGMENTS: Record<
  SegmentName,
  { x: number; y: number; width: number; height: number }
> = {
  a: { x: 6, y: 0, width: BASE.horizontalLength, height: BASE.segmentThickness },
  g: {
    x: 6,
    y: 29,
    width: BASE.horizontalLength,
    height: BASE.segmentThickness,
  },
  d: {
    x: 6,
    y: BASE.height - BASE.segmentThickness,
    width: BASE.horizontalLength,
    height: BASE.segmentThickness,
  },
  f: { x: 0, y: 6, width: BASE.segmentThickness, height: BASE.verticalLength },
  b: {
    x: BASE.width - BASE.segmentThickness,
    y: 6,
    width: BASE.segmentThickness,
    height: BASE.verticalLength,
  },
  e: {
    x: 0,
    y: BASE.height - BASE.verticalLength - 6,
    width: BASE.segmentThickness,
    height: BASE.verticalLength,
  },
  c: {
    x: BASE.width - BASE.segmentThickness,
    y: BASE.height - BASE.verticalLength - 6,
    width: BASE.segmentThickness,
    height: BASE.verticalLength,
  },
};

const HORIZONTAL_SEGMENTS: SegmentName[] = ['a', 'g', 'd'];
const VERTICAL_SEGMENTS: SegmentName[] = ['f', 'b', 'e', 'c'];
const ALL_SEGMENTS = [...HORIZONTAL_SEGMENTS, ...VERTICAL_SEGMENTS];

export function SevenSegmentDigit({
  value,
  scale = 1,
  glow = true,
}: {
  value: string;
  scale?: number;
  glow?: boolean;
}) {
  const active = ACTIVE_SEGMENTS[value] ?? [];
  const activeSet = new Set(active);

  return (
    <Svg
      width={BASE.width * scale}
      height={BASE.height * scale}
      viewBox={`0 0 ${BASE.width} ${BASE.height}`}
    >
      {glow
        ? active.map(segment => {
            const rect = SEGMENTS[segment];
            return (
              <Rect
                key={`glow-${segment}`}
                x={rect.x - 2}
                y={rect.y - 2}
                width={rect.width + 4}
                height={rect.height + 4}
                rx={4}
                fill="#F6F9FD"
                opacity={0.22}
              />
            );
          })
        : null}
      {ALL_SEGMENTS.map(segment => {
        const rect = SEGMENTS[segment];
        const isActive = activeSet.has(segment);

        return (
          <Rect
            key={segment}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx={2}
            fill={isActive ? '#F6F9FD' : 'rgba(246, 249, 253, 0.045)'}
          />
        );
      })}
    </Svg>
  );
}
