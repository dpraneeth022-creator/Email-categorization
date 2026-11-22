import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  getRedirectResult,
  browserPopupRedirectResolver,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import firebaseConfigDefault from '../../firebase-applet-config.json';
import {
  DEFAULT_ALLOWED_CAMPUS_DOMAINS,
  buildCampusRestrictionError,
  isAllowedCampusEmail,
} from '../shared/campusPolicy';
import type { ConnectedAccount } from '../shared/types';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://mail.google.com/',
];

const REQUIRED_SCOPE_VERSION = 2;
const PERSISTED_SESSION_KEY = 'nexamail_persisted_session_v1';
const PERSISTED_TOKEN_KEY = 'nexamail_gmail_token_v1';
const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes conservative default for 1h Google OAuth token
const TOKEN_EXPIRY_BUFFER_MS = 30 * 1000;

export interface PersistedSession {
  account: ConnectedAccount;
  keepSignedIn: boolean;
  lastSyncedAt: number;
}

interface PersistedGmailToken {
  email: string;
  accessToken: string;
  expiresAt: number;
  scopeVersion?: number;
}

// Supports optional VITE_FIREBASE_* env overrides when deploying under an @rvce.edu.in Workspace project
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const firebaseConfig = {
  ...firebaseConfigDefault,
  ...(env.VITE_FIREBASE_API_KEY ? { apiKey: env.VITE_FIREBASE_API_KEY } : {}),
  ...(env.VITE_FIREBASE_AUTH_DOMAIN ? { authDomain: env.VITE_FIREBASE_AUTH_DOMAIN } : {}),
  ...(env.VITE_FIREBASE_PROJECT_ID ? { projectId: env.VITE_FIREBASE_PROJECT_ID } : {}),
  ...(env.VITE_FIREBASE_APP_ID ? { appId: env.VITE_FIREBASE_APP_ID } : {}),
  ...(env.VITE_FIREBASE_STORAGE_BUCKET ? { storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET } : {}),
  ...(env.VITE_FIREBASE_MESSAGING_SENDER_ID
    ? { messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID }
    : {}),
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// In-memory state synced with localStorage when "Keep me signed in" is enabled
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;
let cachedScopeVersion = 0;

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore restricted storage environments
  }
  return null;
}

export function loadPersistedSession(
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS
): PersistedSession | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PERSISTED_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (!parsed?.keepSignedIn || !parsed.account?.email) return null;
    if (!isAllowedCampusEmail(parsed.account.email, allowedDomains)) {
      storage.removeItem(PERSISTED_SESSION_KEY);
      storage.removeItem(PERSISTED_TOKEN_KEY);
      return null;
    }
    return {
      account: parsed.account,
      keepSignedIn: true,
      lastSyncedAt: Number(parsed.lastSyncedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function savePersistedSession(
  account: ConnectedAccount,
  keepSignedIn: boolean,
  lastSyncedAt?: number
): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    if (!keepSignedIn) {
      storage.removeItem(PERSISTED_SESSION_KEY);
      storage.removeItem(PERSISTED_TOKEN_KEY);
      return;
    }
    const existing = loadPersistedSession();
    const payload: PersistedSession = {
      account,
      keepSignedIn: true,
      lastSyncedAt: lastSyncedAt ?? existing?.lastSyncedAt ?? Date.now(),
    };
    storage.setItem(PERSISTED_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota errors
  }
}

export function updatePersistedLastSync(lastSyncedAt: number): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    const existing = loadPersistedSession();
    if (!existing) return;
    storage.setItem(
      PERSISTED_SESSION_KEY,
      JSON.stringify({
        ...existing,
        lastSyncedAt,
      })
    );
  } catch {
    // Ignore storage errors
  }
}

export function clearPersistedSession(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(PERSISTED_SESSION_KEY);
    storage.removeItem(PERSISTED_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

function storeGmailToken(
  email: string,
  accessToken: string,
  expiresInSeconds?: number,
  persistInLocalStorage = true,
  scopeVersion = REQUIRED_SCOPE_VERSION
): number {
  const ttlMs =
    expiresInSeconds && Number.isFinite(expiresInSeconds) && expiresInSeconds > 60
      ? Math.max(60_000, (expiresInSeconds - 60) * 1000)
      : DEFAULT_TOKEN_TTL_MS;
  const expiresAt = Date.now() + ttlMs;

  cachedAccessToken = accessToken;
  cachedTokenExpiresAt = expiresAt;
  cachedScopeVersion = scopeVersion;

  const storage = safeLocalStorage();
  if (storage) {
    try {
      if (persistInLocalStorage) {
        const record: PersistedGmailToken = {
          email: email.trim().toLowerCase(),
          accessToken,
          expiresAt,
          scopeVersion,
        };
        storage.setItem(PERSISTED_TOKEN_KEY, JSON.stringify(record));
      } else {
        storage.removeItem(PERSISTED_TOKEN_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  return expiresAt;
}

export function getGmailAccessToken(expectedEmail?: string): string | null {
  const now = Date.now();
  if (cachedAccessToken && now < cachedTokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS) {
    return cachedAccessToken;
  }

  // Hydrate valid non-expired token from localStorage if available
  const storage = safeLocalStorage();
  if (storage) {
    try {
      const raw = storage.getItem(PERSISTED_TOKEN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedGmailToken>;
        const matchesEmail =
          !expectedEmail ||
          !parsed.email ||
          parsed.email.toLowerCase() === expectedEmail.trim().toLowerCase();
        if (
          matchesEmail &&
          parsed.accessToken &&
          typeof parsed.expiresAt === 'number' &&
          now < parsed.expiresAt - TOKEN_EXPIRY_BUFFER_MS
        ) {
          cachedAccessToken = parsed.accessToken;
          cachedTokenExpiresAt = parsed.expiresAt;
          cachedScopeVersion = Number(parsed.scopeVersion) || 1;
          return cachedAccessToken;
        }
      }
    } catch {
      // Ignore malformed storage
    }
  }

  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
  cachedScopeVersion = 0;
  return null;
}

export function isGmailTokenExpired(expectedEmail?: string): boolean {
  return !getGmailAccessToken(expectedEmail);
}

/**
 * Returns true if the current active Gmail session includes send + modify/trash/delete scopes.
 */
export function hasFullMailActionScopes(expectedEmail?: string): boolean {
  const token = getGmailAccessToken(expectedEmail);
  return Boolean(token && cachedScopeVersion >= REQUIRED_SCOPE_VERSION);
}

/**
 * Clears ONLY the expired/revoked Gmail OAuth token without signing the user out or clearing cached mail.
 */
export function invalidateGmailAccessToken(): void {
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
  cachedScopeVersion = 0;
  const storage = safeLocalStorage();
  if (storage) {
    try {
      storage.removeItem(PERSISTED_TOKEN_KEY);
    } catch {
      // Ignore
    }
  }
}

function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function buildGoogleProvider(
  forceConsent: boolean,
  primaryDomain = 'rvce.edu.in',
  loginHint?: string
): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of GMAIL_SCOPES) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {
    hd: primaryDomain,
    prompt: forceConsent ? 'consent select_account' : loginHint ? 'none' : 'select_account',
  };
  if (loginHint) {
    params.login_hint = loginHint;
  }
  provider.setCustomParameters(params);
  return provider;
}

export function formatFirebaseAuthError(error: unknown): string {
  const errObj = error as { code?: string; message?: string } | null;
  const code = errObj?.code || '';

  switch (code) {
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and click Sign in with Google again.';
    case 'auth/popup-closed-by-user':
      return 'The Google sign-in popup closed before finishing. If Google showed "Access blocked", the OAuth app needs Workspace Internal mode under @rvce.edu.in (for unlimited campus access) or your email added under Test users.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window was already open. Close any open popups and click Sign in with Google once.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Google Sign-In yet. Add it under Firebase Console → Authentication → Settings → Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'Google Sign-In is not enabled on this Firebase project.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Google Sign-In. Check your internet connection and try again.';
    case 'auth/internal-error':
      return 'Browser privacy or cookie settings interrupted Google Sign-In. Try in Chrome/Edge with popups allowed.';
    default:
      if (errObj?.message) {
        return errObj.message;
      }
      return 'Could not complete RVCE Google sign-in. Please try again.';
  }
}

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS,
  onCachedUserSession?: (user: User) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (!isAllowedCampusEmail(user.email, allowedDomains)) {
        invalidateGmailAccessToken();
        clearPersistedSession();
        if (!isSigningIn) {
          void auth.signOut();
          onAuthFailure?.();
        }
        return;
      }

      const validToken = getGmailAccessToken(user.email || undefined);
      if (validToken) {
        onAuthSuccess?.(user, validToken);
      } else if (!isSigningIn) {
        if (onCachedUserSession) {
          onCachedUserSession(user);
        } else {
          onAuthFailure?.();
        }
      }
    } else {
      // Never force sign-out if a valid "Keep me signed in" local session exists;
      // user can still read their IndexedDB cache and reconnect Gmail whenever needed.
      const persisted = loadPersistedSession(allowedDomains);
      if (!persisted) {
        invalidateGmailAccessToken();
        onAuthFailure?.();
      }
    }
  });
};

/**
 * Checks for any pending Firebase redirect result if applicable.
 * Skipped inside iframes where only popup sign-in is supported.
 */
export const checkGoogleRedirectResult = async (
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS
): Promise<{ user: User; accessToken: string } | null> => {
  if (isInsideIframe()) return null;
  try {
    isSigningIn = true;
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    if (!result) return null;

    if (!isAllowedCampusEmail(result.user.email, allowedDomains)) {
      invalidateGmailAccessToken();
      clearPersistedSession();
      await auth.signOut();
      throw new Error(buildCampusRestrictionError(result.user.email, allowedDomains));
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      invalidateGmailAccessToken();
      await auth.signOut();
      throw new Error(
        'Sign-in succeeded, but Gmail read permission was not granted. Please sign in again and allow Gmail access.'
      );
    }

    const tokenResp = (result as unknown as { _tokenResponse?: { oauthExpireIn?: number } })
      ._tokenResponse;
    storeGmailToken(result.user.email || '', credential.accessToken, tokenResp?.oauthExpireIn, true);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  } finally {
    isSigningIn = false;
  }
};

export const googleSignIn = async (
  forceConsent = false,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS,
  keepSignedIn = true,
  loginHint?: string
): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  if (isSigningIn) return null;

  try {
    isSigningIn = true;

    // Configure Firebase persistence based on "Keep me signed in"
    try {
      await setPersistence(
        auth,
        keepSignedIn ? browserLocalPersistence : browserSessionPersistence
      );
    } catch {
      // Proceed cleanly if browser restricts persistence switching
    }

    const primaryDomain = allowedDomains[0] || 'rvce.edu.in';
    // Only use prompt: 'none' when reconnecting a known account; fallback to select_account if interactive needed
    let result;
    if (loginHint && !forceConsent) {
      try {
        const hintProvider = buildGoogleProvider(false, primaryDomain, loginHint);
        result = await signInWithPopup(auth, hintProvider, browserPopupRedirectResolver);
      } catch (silentErr) {
        const code = (silentErr as { code?: string } | null)?.code;
        if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
          throw silentErr;
        }
        const interactiveProvider = buildGoogleProvider(false, primaryDomain);
        interactiveProvider.setCustomParameters({
          hd: primaryDomain,
          login_hint: loginHint,
          prompt: 'select_account',
        });
        result = await signInWithPopup(auth, interactiveProvider, browserPopupRedirectResolver);
      }
    } else {
      const provider = buildGoogleProvider(forceConsent, primaryDomain);
      if (loginHint) {
        provider.setCustomParameters({
          hd: primaryDomain,
          login_hint: loginHint,
          prompt: forceConsent ? 'consent select_account' : 'select_account',
        });
      }
      result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    }

    // Strictly enforce college-only email addresses
    if (!isAllowedCampusEmail(result.user.email, allowedDomains)) {
      invalidateGmailAccessToken();
      clearPersistedSession();
      await auth.signOut();
      throw new Error(buildCampusRestrictionError(result.user.email, allowedDomains));
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      invalidateGmailAccessToken();
      await auth.signOut();
      throw new Error(
        'College Google sign-in succeeded, but Gmail read permission was not granted. Click Sign in with Google again and check the Gmail permission box.'
      );
    }

    const tokenResp = (result as unknown as { _tokenResponse?: { oauthExpireIn?: number } })
      ._tokenResponse;
    storeGmailToken(
      result.user.email || '',
      credential.accessToken,
      tokenResp?.oauthExpireIn,
      keepSignedIn
    );

    const connectedAccount: ConnectedAccount = {
      provider: 'gmail',
      email: result.user.email || 'campus-user',
      displayName: result.user.displayName || result.user.email || 'Campus User',
      photoUrl: result.user.photoURL || undefined,
    };
    savePersistedSession(connectedAccount, keepSignedIn);

    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      console.warn('Google sign-in failed:', code || error);
    }
    throw new Error(formatFirebaseAuthError(error));
  } finally {
    isSigningIn = false;
  }
};

export const googleLogout = async (): Promise<void> => {
  invalidateGmailAccessToken();
  clearPersistedSession();
  await auth.signOut();
};
