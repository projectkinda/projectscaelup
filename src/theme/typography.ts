import { StyleSheet, type TextStyle } from 'react-native';

export const MIN_FONT_SIZE = 12;
export const fontFamilies = { regular: 'Geist', semibold: 'GeistSemiBold' } as const;
// One family, two real faces: regular for reading, semibold for headings/actions.
export const typography = {
  caption: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 13, lineHeight: 19 },
  body: { fontSize: 16, lineHeight: 22 },
  subheading: { fontSize: 18, lineHeight: 26 },
  heading: { fontSize: 20, lineHeight: 28 },
  stat: { fontSize: 22, lineHeight: 28 },
  metric: { fontSize: 24, lineHeight: 32 },
  title: { fontSize: 32, lineHeight: 40 },
  display: { fontSize: 38, lineHeight: 50 },
} as const;

/** Keep layout scaling and auto-fit from shrinking reading text below 12dp. */
export function readableTextStyle(style?: TextStyle, fontScale = 1): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = Math.max(MIN_FONT_SIZE, flat.fontSize ?? typography.body.fontSize);
  const semibold = flat.fontWeight != null
    ? flat.fontWeight === 'bold' || Number(flat.fontWeight) >= 600
    : flat.fontFamily === fontFamilies.semibold;
  const minimumScale = fontScale > 0 && fontScale < 1 ? 1 / fontScale : 1;
  return {
    ...flat,
    fontFamily: semibold ? fontFamilies.semibold : fontFamilies.regular,
    fontWeight: 'normal',
    fontSize: fontSize * minimumScale,
    lineHeight: Math.max(fontSize + 6, flat.lineHeight ?? typography.body.lineHeight) * minimumScale,
  };
}
