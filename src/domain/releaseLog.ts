import { DEV_FLAGS } from './paywall';

/** Keep actionable error context in store logs without SQL, paths or user-provided values. */
export function warn(message: string, ...details: unknown[]): void {
  if (DEV_FLAGS.tierSwitcher) console.warn(message, ...details);
  else console.warn(message);
}

/** Development-only diagnostics; emits nothing in release JS. */
export function debug(message: string, ...details: unknown[]): void {
  if (DEV_FLAGS.tierSwitcher) console.debug(message, ...details);
}
