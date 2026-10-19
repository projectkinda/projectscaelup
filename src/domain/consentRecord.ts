// Pure helpers for the stored consent record (no database), so they can be tested alone.
// Bump when a disclosure's wording changes, so people see the new wording.
export const DISCLOSURE_VERSION = 1;

export function serializeConsent(now: Date, version = DISCLOSURE_VERSION): string {
  return JSON.stringify({ version, at: now.toISOString() });
}

/** True only for a record of this wording version with a real timestamp. */
export function isConsentValid(raw: string | null, version = DISCLOSURE_VERSION): boolean {
  if (!raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; at?: unknown };
    return (
      parsed.version === version &&
      typeof parsed.at === 'string' &&
      !Number.isNaN(Date.parse(parsed.at))
    );
  } catch {
    return false;
  }
}
