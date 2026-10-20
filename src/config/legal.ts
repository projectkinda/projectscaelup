import appConfig from '../../app.json';

// Where the hosted privacy policy and support pages live (see docs/store/site and
// docs/store/submission-checklist.md). Fill in each `url` once its page is live;
// Settings > About only shows a row whose url is set, so no dead link ships.

export const APP_VERSION: string = appConfig.expo.version;

const CANDIDATES: { label: string; url: string | null }[] = [
  { label: 'Privacy Policy', url: null },
  { label: 'Support', url: null },
];

export const LEGAL_LINKS: readonly { label: string; url: string }[] = CANDIDATES.flatMap(link =>
  link.url ? [{ label: link.label, url: link.url }] : [],
);
