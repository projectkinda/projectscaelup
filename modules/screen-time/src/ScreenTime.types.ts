export type ScreenTimeAuthorization = 'notDetermined' | 'denied' | 'approved';

export type ScreenTimeStatus = {
  authorization: ScreenTimeAuthorization;
  /** How many apps the user flagged. The apps themselves stay in native code. */
  flaggedAppCount: number;
  /** False during a focus session or lockdown, so the list can't be used as a way out. */
  canEditFlaggedApps: boolean;
};

export type FlaggedAppsViewProps = {
  /** Change this after the picker closes to redraw the icons. */
  revision: number;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
};
