export type ScreenTimeAuthorization = 'notDetermined' | 'denied' | 'approved';

export type ScreenTimeStatus = {
  authorization: ScreenTimeAuthorization;
  /** How many apps the user flagged. The apps themselves stay in native code. */
  flaggedAppCount: number;
  /** False during a focus session or lockdown, so the list can't be used as a way out. */
  canEditFlaggedApps: boolean;
  /** Lock flagged apps during sessions instead of tracking use silently. */
  strictMode: boolean;
};

export type ScreenTimeDistraction = {
  occurredAt: Date;
  /** The flagged app's stable, opaque key, or null when iOS can't say which app. */
  appKey: string | null;
};

export type FlaggedAppsViewProps = {
  /** Change this after the picker closes to redraw the icons. */
  revision: number;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
};

export type FlaggedAppLabelProps = {
  /** Distraction keys (`ScreenTimeDistraction.appKey`) of the apps to draw. */
  appKeys: string[];
  /** Overlapping icons, or the names on one line. */
  display: 'icons' | 'names';
  /** Icon side, or font size, in points. */
  size: number;
  /** Text color for `names`. */
  color?: string;
  /** Text weight for `names`. */
  weight?: 'regular' | 'medium';
  /** Horizontal alignment within the view. */
  align?: 'start' | 'center';
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
};
