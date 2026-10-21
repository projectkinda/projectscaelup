import appConfig from '../../app.json';
import { DEV_FLAGS } from '../domain/paywall';

// Where the hosted legal pages live (see docs/store/site and docs/hosting-legal.md).
// Fill in each `url` once its page is live; every surface (Settings > About, the
// paywall footer, the permission disclosure) shows a link only when its url is set,
// so no dead link ships. Under RELEASE, scripts/legal-check.ts fails on a null url.

export const APP_VERSION: string = appConfig.expo.version;

export const LEGAL_PAGES = {
  terms: { label: 'Terms of Service', url: null as string | null },
  privacy: { label: 'Privacy Policy', url: null as string | null },
  support: { label: 'Support', url: null as string | null },
};

export type LegalPage = keyof typeof LEGAL_PAGES;

/** The page's URL, or null while it isn't hosted yet. */
export function legalUrl(page: LegalPage): string | null {
  return LEGAL_PAGES[page].url || null;
}

export const UNHOSTED_CAPTION = 'Not hosted yet';

export type LegalEntry = { page: LegalPage; label: string; url: string | null };

/**
 * Entries each surface renders. A hosted page always shows. A page with a null url shows
 * (caption + no navigation) only when test tools are on (debug and QA builds), so it can be
 * reviewed without a dead link ever shipping: the release build hides it.
 */
export function legalEntries(
  pages: readonly LegalPage[] = ['terms', 'privacy', 'support'],
  testTools: boolean = DEV_FLAGS.tierSwitcher,
): LegalEntry[] {
  return pages.flatMap(page => {
    const url = legalUrl(page);
    return url || testTools ? [{ page, label: LEGAL_PAGES[page].label, url }] : [];
  });
}
