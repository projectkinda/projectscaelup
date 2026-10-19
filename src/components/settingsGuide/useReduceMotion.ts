import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True when the phone asks apps to cut animation. */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (!cancelled) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
