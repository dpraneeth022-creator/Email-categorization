/**
 * Campus-only email access policy for NexaMAIL.
 * Restricts mailbox sign-in and server API access exclusively to official college domains.
 */

export const DEFAULT_ALLOWED_CAMPUS_DOMAINS: readonly string[] = [
  'rvce.edu.in',
];

export const PRIMARY_CAMPUS_DOMAIN = 'rvce.edu.in';

export function parseAllowedDomains(raw?: string | null): string[] {
  if (!raw || !raw.trim()) {
    return [...DEFAULT_ALLOWED_CAMPUS_DOMAINS];
  }
  const parsed = raw
    .split(/[,\s;]+/)
    .map((entry) => entry.trim().toLowerCase().replace(/^@+/, ''))
    .filter((entry) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(entry));

  return parsed.length > 0 ? Array.from(new Set(parsed)) : [...DEFAULT_ALLOWED_CAMPUS_DOMAINS];
}

export function getEmailDomain(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return '';
  return trimmed.slice(atIndex + 1);
}

export function isAllowedCampusEmail(
  email?: string | null,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS
): boolean {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((allowed) => {
    const cleanAllowed = allowed.trim().toLowerCase().replace(/^@+/, '');
    if (!cleanAllowed) return false;
    return domain === cleanAllowed || domain.endsWith(`.${cleanAllowed}`);
  });
}

export function formatAllowedDomains(
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS
): string {
  const domains =
    allowedDomains.length > 0 ? allowedDomains : DEFAULT_ALLOWED_CAMPUS_DOMAINS;
  return domains.map((d) => `@${d.replace(/^@+/, '')}`).join(' or ');
}

export function buildCampusRestrictionError(
  attemptedEmail?: string | null,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS
): string {
  const formatted = formatAllowedDomains(allowedDomains);
  if (attemptedEmail && attemptedEmail.trim()) {
    return `College mail only: "${attemptedEmail.trim()}" is not an official campus email address. Sign in with your ${formatted} account.`;
  }
  return `College mail only: Please sign in with your official ${formatted} campus email address.`;
}
