import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';

import type { FlaggedAppLabelProps } from './ScreenTime.types';
import { ScreenTime } from './ScreenTimeModule';

const NativeFlaggedAppLabel: ComponentType<FlaggedAppLabelProps> | null = ScreenTime.isAvailable
  ? requireNativeView<FlaggedAppLabelProps>('ScreenTime', 'FlaggedAppLabelView')
  : null;

/** Flagged apps' icons or names, drawn by iOS. Renders nothing where Screen Time isn't available. */
export function FlaggedAppLabel(props: FlaggedAppLabelProps) {
  return NativeFlaggedAppLabel ? <NativeFlaggedAppLabel {...props} /> : null;
}
