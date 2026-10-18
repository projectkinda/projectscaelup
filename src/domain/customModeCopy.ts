export const CUSTOM_MODES_INTRO = 'Create your own mode. It appears next to Deep Work and Study on the home screen.';
export const CUSTOM_MODE_EDITOR_INTRO = 'Your own mode. It appears next to Deep Work and Study on the home screen.';
export function lookAwayDescription(seconds: number): string {
  const prefix = 'How long the camera can lose you before it counts as a distraction. ';
  if (seconds <= 8) return prefix + 'Even a short look away counts.';
  if (seconds <= 20) return prefix + 'At ' + seconds + ' sec, a quick glance away is fine. Leaving your seat counts.';
  if (seconds <= 45) return prefix + 'At ' + seconds + ' sec, you can step back or look around for a bit.';
  return prefix + 'At ' + seconds + ' sec, you can be away for a while before it counts.';
}
export function cameraDistanceText(frameRange: readonly number[]): string {
  return frameRange[0] === 5 && frameRange[1] === 20 ? 'sitting further back' : 'normal desk distance';
}
export function modeFrameRange(seconds: number): [number, number] { return seconds >= 30 ? [5, 20] : [15, 40]; }
export function customModeDetail(seconds: number, frameRange: readonly number[]): string {
  return seconds + ' sec look-away \u00b7 ' + cameraDistanceText(frameRange);
}
