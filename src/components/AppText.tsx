import { Text as NativeText, TextInput as NativeTextInput, StyleSheet, useWindowDimensions, type TextProps, type TextInputProps } from 'react-native';
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
