import { Text as NativeText, TextInput as NativeTextInput, StyleSheet, useWindowDimensions, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
import { readableTextStyle } from '../theme/typography';

// Native accessibility font scaling stays enabled. Text wraps instead of shrinking.
export function Text({ style, adjustsFontSizeToFit: _fit, ...props }: TextProps) {
  const { fontScale } = useWindowDimensions();
  return <NativeText {...props} adjustsFontSizeToFit={false} style={readableTextStyle(StyleSheet.flatten(style), fontScale)} />;
}
export function TextInput({ style, ...props }: TextInputProps) {
  const { fontScale } = useWindowDimensions();
  return <NativeTextInput {...props} style={readableTextStyle(StyleSheet.flatten(style), fontScale)} />;
}

/** Inline color accents inherit the paragraph's font and line metrics unchanged. */
export function InlineText({ style, ...props }: Omit<TextProps, 'style'> & { style?: Pick<TextStyle, 'color'> }) {
  return <NativeText {...props} style={style} />;
}
