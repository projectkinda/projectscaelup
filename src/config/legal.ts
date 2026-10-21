import appConfig from '../../app.json';

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

export const LEGAL_LINKS: readonly { label: string; url: string }[] = (['terms', 'privacy', 'support'] as const).flatMap(page => {
  const url = legalUrl(page);
  return url ? [{ label: LEGAL_PAGES[page].label, url }] : [];
});
