import { getAppState, setAppState } from '../data/appStateRepository';
import { isConsentValid, serializeConsent } from './consentRecord';

export async function hasConsent(consentKey: string): Promise<boolean> {
  return isConsentValid(await getAppState(consentKey));
}

/** Stored on this phone only, with the time the person tapped agree. */
export async function recordConsent(consentKey: string, now = new Date()): Promise<void> {
  await setAppState(consentKey, serializeConsent(now));
}
