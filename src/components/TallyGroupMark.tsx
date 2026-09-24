import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { TALLY_STROKE_PATHS, TALLY_STROKE_VIEWBOX } from './tallyStrokePaths';

export const TALLY_GROUP_SIZE = TALLY_STROKE_PATHS.length;

const LIT_COLOR = '#F6F9FD';

type TallyGroupMarkProps = {
  /** How many of the 5 strokes (4 verticals + diagonal) are fully lit. */
  litCount: number;
  width: number;
  height: number;
  litColor?: string;
  unlitColor?: string;
};

export function TallyGroupMark({
  litCount,
  width,
  height,
  litColor = LIT_COLOR,
  unlitColor,
}: TallyGroupMarkProps) {
  return (
    <Svg width={width} height={height} viewBox={TALLY_STROKE_VIEWBOX}>
      {unlitColor
        ? TALLY_STROKE_PATHS.slice(litCount).map((d, index) => (
            <Path key={`unlit-${index}`} d={d} fill={unlitColor} />
          ))
        : null}
      {TALLY_STROKE_PATHS.slice(0, litCount).map((d, index) => (
        <Path key={`lit-${index}`} d={d} fill={litColor} />
      ))}
    </Svg>
  );
}

/**
 * Cross-fades from `fromLitCount` to `toLitCount` strokes lit, driven by
 * `progress` (0-1). Animating react-native-svg's <Path> directly via
 * Animated.createAnimatedComponent crashes on web, so instead we stack two
 * plain (unanimated) marks and fade the top one in/out via a regular
 * Animated.View - since the two marks are identical except for the one
 * newly-lit stroke, the cross-fade reads as just that stroke drawing in.
 */
export function TallyGroupMarkTransition({
  fromLitCount,
  toLitCount,
  progress,
  width,
  height,
  litColor,
  unlitColor,
}: {
  fromLitCount: number;
  toLitCount: number;
  progress: Animated.Value;
  width: number;
  height: number;
  litColor?: string;
  unlitColor?: string;
}) {
  return (
    <Animated.View style={{ width, height }}>
      <TallyGroupMark
        litCount={fromLitCount}
        width={width}
        height={height}
        litColor={litColor}
        unlitColor={unlitColor}
      />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <TallyGroupMark
          litCount={toLitCount}
          width={width}
          height={height}
          litColor={litColor}
          unlitColor={unlitColor}
        />
      </Animated.View>
    </Animated.View>
  );
}
