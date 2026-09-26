import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';

import type { FlaggedAppsViewProps } from './ScreenTime.types';
import { ScreenTime } from './ScreenTimeModule';

const NativeFlaggedAppsView: ComponentType<FlaggedAppsViewProps> | null = ScreenTime.isAvailable
  ? requireNativeView<FlaggedAppsViewProps>('ScreenTime')
  : null;

/** The flagged apps' icons, drawn by iOS. Renders nothing where Screen Time isn't available. */
export function FlaggedAppsView(props: FlaggedAppsViewProps) {
  return NativeFlaggedAppsView ? <NativeFlaggedAppsView {...props} /> : null;
}
