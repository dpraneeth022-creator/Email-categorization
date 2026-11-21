import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver,
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

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

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

// Track sign-in transition and keep OAuth access token strictly in memory.
let isSigningIn = false;
let cachedAccessToken: string | null = null;

function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildGoogleProvider(forceConsent: boolean, primaryDomain = 'rvce.edu.in'): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of GMAIL_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    hd: primaryDomain,
    prompt: forceConsent ? 'consent select_account' : 'select_account',
  });
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
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (!isAllowedCampusEmail(user.email, allowedDomains)) {
        cachedAccessToken = null;
        if (!isSigningIn) {
          void auth.signOut();
          onAuthFailure?.();
        }
        return;
      }

      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
};

/**
 * Completes a standalone mobile redirect sign-in if returning from Google OAuth.
 * Skipped inside iframes where only popup sign-in is supported.
 */
export const checkGoogleRedirectResult = async (
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS
): Promise<{ user: User; accessToken: string } | null> => {
  if (isInsideIframe()) return null;
  try {
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    if (!result) return null;

    if (!isAllowedCampusEmail(result.user.email, allowedDomains)) {
      cachedAccessToken = null;
      await auth.signOut();
      throw new Error(buildCampusRestrictionError(result.user.email, allowedDomains));
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      cachedAccessToken = null;
      await auth.signOut();
      throw new Error(
        'Sign-in succeeded, but Gmail read permission was not granted. Please sign in again and allow Gmail access.'
      );
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
};

export const googleSignIn = async (
  forceConsent = false,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_CAMPUS_DOMAINS
): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  if (isSigningIn) return null;

  try {
    isSigningIn = true;
    const primaryDomain = allowedDomains[0] || 'rvce.edu.in';
    const provider = buildGoogleProvider(forceConsent, primaryDomain);

    // On standalone mobile browsers (outside an iframe), redirect flow avoids mobile popup-close disconnects
    if (!isInsideIframe() && isMobileBrowser()) {
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
      return null;
    }

    const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);

    // Strictly enforce college-only email addresses
    if (!isAllowedCampusEmail(result.user.email, allowedDomains)) {
      cachedAccessToken = null;
      await auth.signOut();
      throw new Error(buildCampusRestrictionError(result.user.email, allowedDomains));
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      cachedAccessToken = null;
      await auth.signOut();
      throw new Error(
        'College Google sign-in succeeded, but Gmail read permission was not granted. Click Sign in with Google again and check the Gmail permission box.'
      );
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
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

export const getGmailAccessToken = (): string | null => cachedAccessToken;

export const googleLogout = async (): Promise<void> => {
  cachedAccessToken = null;
  await auth.signOut();
};
