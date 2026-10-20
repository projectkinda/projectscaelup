import { Text as NativeText, TextInput as NativeTextInput, StyleSheet, useWindowDimensions, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
import { readableTextStyle } from '../theme/typography';

// Native accessibility font scaling stays enabled. Text wraps instead of shrinking.
// Growth is capped: fixed-height controls (tab bar, buttons, mode tabs) clip at the
// largest accessibility sizes (about 3x), so text stops growing past this. A caller
// can pass its own maxFontSizeMultiplier.
export const MAX_FONT_SCALE = 1.6;

export function Text({ style, adjustsFontSizeToFit: _fit, maxFontSizeMultiplier = MAX_FONT_SCALE, ...props }: TextProps) {
  const { fontScale } = useWindowDimensions();
  return <NativeText {...props} maxFontSizeMultiplier={maxFontSizeMultiplier} adjustsFontSizeToFit={false} style={readableTextStyle(StyleSheet.flatten(style), fontScale)} />;
}
export function TextInput({ style, maxFontSizeMultiplier = MAX_FONT_SCALE, ...props }: TextInputProps) {
  const { fontScale } = useWindowDimensions();
  return <NativeTextInput {...props} maxFontSizeMultiplier={maxFontSizeMultiplier} style={readableTextStyle(StyleSheet.flatten(style), fontScale)} />;
}

/** Inline color accents inherit the paragraph's font and line metrics unchanged. */
export function InlineText({ style, ...props }: Omit<TextProps, 'style'> & { style?: Pick<TextStyle, 'color'> }) {
  return <NativeText {...props} style={style} />;
}
