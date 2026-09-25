type AppUsageTick = {
  appIdentifier: string;
  displayName: string;
};

type AppUsageCallback = (tick: AppUsageTick) => void;

export const UsageTrackingModule = {
  onAppUsageTick(_callback: AppUsageCallback): () => void {
    // Stub until native Screen Time / AccessibilityService integrations exist.
    return () => {};
  },
};
