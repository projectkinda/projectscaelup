// Everything the guided "turn it on in Settings" flow says and draws, as data.
//
// The pictures in the guide are DRAWINGS, not screenshots. They are rebuilt
// from the rows below with Views and vectors, so they stay sharp at any size
// and never need a bitmap. They are written from how each phone family words
// its Settings; a real phone can differ by version, which is why every step
// also carries plain words.
//
// To add a phone: put its lowercase Manufacturer/Brand in a variant's
// `manufacturers`. To add a look or wording: add a variant to VARIANTS.
// To guide another permission: add a PermissionGuideConfig (see the bottom).

export type VariantId = 'samsung' | 'google' | 'generic';

/** How the drawn Settings page is styled. */
export type SettingsLook =
  /** One UI: big title, rows grouped in rounded cards. */
  | 'cards'
  /** Pixel / stock Android: big title, flat rows. */
  | 'flat'
  /** Everything else: small title bar, rows split by dividers. */
  | 'divided';

export type VariantConfig = {
  id: VariantId;
  look: SettingsLook;
  /** Lowercase Platform.constants Manufacturer or Brand values. */
  manufacturers: readonly string[];
  /** The row's wording on this phone, used in instructions. */
  appsListLabel: string;
  /** Rows above the apps row on the Accessibility page. */
  accessibilityPageRows: readonly string[];
  /** Title of the apps list page. */
  appsListTitle: string;
  /** Neighbours of Project ScaleUp in the list, as the phone sorts them. */
  appsListBefore: readonly string[];
  appsListAfter: readonly string[];
  /** The switch row on the app's own page. */
  toggleLabel: string;
  /** Overlay: the page title and switch row for "Display over other apps". */
  overlayListTitle: string;
  overlayToggleLabel: string;
  appInfoRows: readonly string[];
};

export const APP_NAME = 'Project ScaleUp';

export const VARIANTS: Record<VariantId, VariantConfig> = {
  samsung: {
    id: 'samsung',
    look: 'cards',
    manufacturers: ['samsung'],
    appsListLabel: 'Installed apps',
    accessibilityPageRows: ['TalkBack', 'Visibility enhancements', 'Interaction and dexterity'],
    appsListTitle: 'Installed apps',
    appsListBefore: ['Live Transcribe'],
    appsListAfter: ['Select to speak', 'Voice Assistant'],
    toggleLabel: 'Off',
    overlayListTitle: 'Appear on top',
    overlayToggleLabel: 'Allowed',
    appInfoRows: ['Notifications', 'Permissions', 'Storage'],
  },
  google: {
    id: 'google',
    look: 'flat',
    // Pixel plus the phones that ship near-stock Android.
    manufacturers: ['google', 'pixel', 'motorola', 'nokia', 'hmd global', 'sony', 'fairphone'],
    appsListLabel: 'Downloaded apps',
    accessibilityPageRows: ['TalkBack', 'Display size and text', 'Color and motion'],
    appsListTitle: 'Downloaded apps',
    appsListBefore: ['Live Transcribe'],
    appsListAfter: ['Select to Speak', 'Voice Access'],
    toggleLabel: 'Use Project ScaleUp',
    overlayListTitle: 'Display over other apps',
    overlayToggleLabel: 'Allow display over other apps',
    appInfoRows: ['Notifications', 'Permissions', 'Storage and cache'],
  },
  generic: {
    id: 'generic',
    look: 'divided',
    manufacturers: [],
    appsListLabel: 'Installed apps (or Downloaded apps)',
    accessibilityPageRows: ['TalkBack', 'Display', 'Interaction controls'],
    appsListTitle: 'Installed apps',
    appsListBefore: ['Live Transcribe'],
    appsListAfter: ['Select to Speak', 'Voice Access'],
    toggleLabel: 'Use Project ScaleUp',
    overlayListTitle: 'Display over other apps',
    overlayToggleLabel: 'Allow display over other apps',
    appInfoRows: ['Notifications', 'Permissions', 'Storage'],
  },
};

export const VARIANT_IDS = Object.keys(VARIANTS) as VariantId[];

/** Pick the variant for a phone. Unknown or missing values fall back to generic. */
export function variantForDevice(device: {
  manufacturer?: string | null;
  brand?: string | null;
}): VariantConfig {
  const candidates = [device.manufacturer, device.brand]
    .map(value => (value ?? '').trim().toLowerCase())
    .filter(Boolean);
  for (const id of VARIANT_IDS) {
    const { manufacturers } = VARIANTS[id];
    if (candidates.some(value => manufacturers.includes(value))) {
      return VARIANTS[id];
    }
  }
  return VARIANTS.generic;
}

// ---------------------------------------------------------------------------
// Drawings

export type SceneRow = {
  label: string;
  detail?: string;
  /** Draws the app icon in front of the row. */
  appIcon?: boolean;
  /** Draws a switch at the end of the row. */
  toggle?: 'on' | 'off';
};

export type SceneSpec = {
  title: string;
  rows: readonly SceneRow[];
  /** Row to ring in amber. */
  highlight?: number;
  /** Three-dots button in the header. */
  kebab?: boolean;
  /** Popup menu opened from the three dots. */
  menu?: { items: readonly string[]; highlight: number };
  /** The system dialog shown after the switch is turned on. */
  dialog?: { title: string; body: string; deny: string; allow: string };
  /** Spoken description of the whole drawing. */
  a11y: string;
};

export type GuideAction = 'openSettings' | 'openSettingsAndNext' | 'next';

export type GuideStep = {
  title: string;
  instruction: string;
  primaryLabel: string;
  primaryAction: GuideAction;
  scene: SceneSpec;
};

export type HelpConfig = {
  /** Switch is greyed out or says "Restricted setting" (Android 13+). */
  restricted?: {
    heading: string;
    intro: string;
    steps: readonly string[];
    openLabel: string;
    scene: SceneSpec;
  };
  notFound: { heading: string; body: string; retryLabel: string };
  skip: { heading: string; consequence: string; label: string };
};

export type PermissionGuideConfig = {
  id: 'accessibility' | 'overlay';
  /** Short name used in messages ("Accessibility is on."). */
  name: string;
  consentKey: string;
  disclosure: {
    title: string;
    does: string;
    doesNotHeading: string;
    doesNot: readonly string[];
    agreeLabel: string;
    declineLabel: string;
  };
  success: { title: string; body: string };
  stillOffNotice: string;
  fallbackLabel: string;
  steps: readonly GuideStep[];
  help: HelpConfig;
};

function accessibilityGuide(variant: VariantConfig): PermissionGuideConfig {
  const appsRow = variant.appsListLabel;
  const pageRows: SceneRow[] = [
    ...variant.accessibilityPageRows.map(label => ({ label })),
    { label: appsRow },
  ];
  const appsHighlight = pageRows.length - 1;

  const listRows: SceneRow[] = [
    ...variant.appsListBefore.map(label => ({ label })),
    { label: APP_NAME, appIcon: true },
    ...variant.appsListAfter.map(label => ({ label })),
  ];

  const toggleScene: SceneSpec = {
    title: APP_NAME,
    rows: [
      { label: variant.toggleLabel, toggle: 'off', appIcon: true },
      { label: 'Shortcut' },
    ],
    highlight: 0,
    dialog: {
      title: `Use ${APP_NAME}?`,
      body: `${APP_NAME} will be told when you open an app.`,
      deny: 'Cancel',
      allow: 'Allow',
    },
    a11y: 'Illustration: the switch for Project ScaleUp highlighted, with the Allow button on the dialog that follows',
  };

  return {
    id: 'accessibility',
    name: 'Accessibility',
    consentKey: 'accessibility_disclosure_consent',
    disclosure: {
      title: 'Let ScaleUp see which app is open',
      does:
        'ScaleUp notices which app is in front, so it can count time away from your focus session and enforce your app rules.',
      doesNotHeading: 'What it does not do',
      doesNot: [
        "It never reads what's on your screen.",
        'It never reads your messages, passwords or anything you type.',
        'Nothing leaves your phone for this.',
      ],
      agreeLabel: 'Agree and continue',
      declineLabel: 'Not now',
    },
    success: { title: 'All set', body: 'Accessibility is on.' },
    stillOffNotice: 'It still looks off. Check step 3.',
    fallbackLabel: "I've turned it on",
    steps: [
      {
        title: 'Open Accessibility settings',
        instruction: "Tap the button. Your phone's Accessibility page opens.",
        primaryLabel: 'Open Accessibility settings',
        primaryAction: 'openSettingsAndNext',
        scene: {
          title: 'Accessibility',
          rows: pageRows,
          highlight: appsHighlight,
          a11y: `Illustration: Accessibility settings with ${appsRow} highlighted`,
        },
      },
      {
        title: `Find ${APP_NAME}`,
        instruction: `Tap ${appsRow}. Then tap ${APP_NAME}.`,
        primaryLabel: 'Next',
        primaryAction: 'next',
        scene: {
          title: variant.appsListTitle,
          rows: listRows,
          highlight: variant.appsListBefore.length,
          a11y: `Illustration: ${variant.appsListTitle} list with ${APP_NAME} highlighted`,
        },
      },
      {
        title: 'Turn it on',
        instruction: 'Switch it on, then tap Allow.',
        primaryLabel: 'Open settings',
        primaryAction: 'openSettings',
        scene: toggleScene,
      },
    ],
    help: {
      restricted: {
        heading: 'The switch is greyed out',
        intro: 'Some phones say "Restricted setting" for apps installed outside Google Play.',
        steps: [
          'Open App info.',
          'Tap the three dots at the top right.',
          'Tap Allow restricted settings.',
        ],
        openLabel: 'Open App info',
        scene: {
          title: 'App info',
          rows: [{ label: APP_NAME, appIcon: true }, ...variant.appInfoRows.map(label => ({ label }))],
          kebab: true,
          menu: { items: ['Allow restricted settings'], highlight: 0 },
          a11y: 'Illustration: App info with the three dots menu open and Allow restricted settings highlighted',
        },
      },
      notFound: {
        heading: `Can't find ${APP_NAME}?`,
        body: `Scroll down to ${appsRow}. ${APP_NAME} is listed there.`,
        retryLabel: 'Retry',
      },
      skip: {
        heading: 'Skip for now',
        consequence:
          "Without Accessibility, ScaleUp can't tell when you open an app you picked, so it can't count time away or enforce your app rules. You can turn it on later.",
        label: 'Skip for now',
      },
    },
  };
}

function overlayGuide(variant: VariantConfig): PermissionGuideConfig {
  return {
    id: 'overlay',
    name: 'Display over other apps',
    consentKey: 'overlay_disclosure_consent',
    disclosure: {
      title: 'Let ScaleUp cover locked apps',
      does:
        'When a locked app opens, ScaleUp shows its lock screen on top, so you cannot keep scrolling.',
      doesNotHeading: 'What it does not do',
      doesNot: [
        'It only draws the lock screen, and only over apps you picked.',
        "It never reads what's on your screen or anything you type.",
        'Nothing leaves your phone for this.',
      ],
      agreeLabel: 'Agree and continue',
      declineLabel: 'Not now',
    },
    success: { title: 'All set', body: 'Display over other apps is on.' },
    stillOffNotice: 'It still looks off. Check step 2.',
    fallbackLabel: "I've turned it on",
    steps: [
      {
        title: `Open the ${APP_NAME} page`,
        instruction: `Tap the button. If you see a list, tap ${APP_NAME}.`,
        primaryLabel: 'Open settings',
        primaryAction: 'openSettingsAndNext',
        scene: {
          title: variant.overlayListTitle,
          rows: [
            { label: 'Calendar', toggle: 'off' },
            { label: APP_NAME, appIcon: true, toggle: 'off' },
            { label: 'Weather', toggle: 'off' },
          ],
          highlight: 1,
          a11y: `Illustration: ${variant.overlayListTitle} list with ${APP_NAME} highlighted`,
        },
      },
      {
        title: 'Switch it on',
        instruction: `Switch on ${variant.overlayToggleLabel}.`,
        primaryLabel: 'Open settings',
        primaryAction: 'openSettings',
        scene: {
          title: APP_NAME,
          rows: [{ label: variant.overlayToggleLabel, toggle: 'off' }],
          highlight: 0,
          a11y: `Illustration: the ${variant.overlayToggleLabel} switch highlighted`,
        },
      },
    ],
    help: {
      notFound: {
        heading: `Can't find ${APP_NAME}?`,
        body: `Scroll down the list until you see ${APP_NAME}, then tap it.`,
        retryLabel: 'Retry',
      },
      skip: {
        heading: 'Skip for now',
        consequence:
          "Without this, ScaleUp can't show the lock screen over locked apps, so they stay open. You can turn it on later.",
        label: 'Skip for now',
      },
    },
  };
}

export function guideFor(
  permission: PermissionGuideConfig['id'],
  variant: VariantConfig,
): PermissionGuideConfig {
  return permission === 'accessibility'
    ? accessibilityGuide(variant)
    : overlayGuide(variant);
}

/** The app icon is drawn from its two real colours, not the theme tokens. */
export const APP_ICON_COLORS = { tile: '#E4F3FD', mark: '#2F8CE8' } as const;
