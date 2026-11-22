import React, { useState } from 'react';
import { GoogleGIcon } from './ProviderIcons';

interface AuthLandingProps {
  isLoggingIn: boolean;
  authError: string | null;
  onGoogleLogin: (forceConsent?: boolean, keepSignedIn?: boolean) => void;
}

export const AuthLanding: React.FC<AuthLandingProps> = ({
  isLoggingIn,
  authError,
  onGoogleLogin,
}) => {
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  return (
    <main className="min-h-screen w-full bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-8 space-y-6 text-center">
        <div className="space-y-2">
          <h1
            className="text-2xl font-bold tracking-tight text-slate-950"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            NexaMAIL
          </h1>
          <p className="text-sm text-slate-600">
            Sign in with your{' '}
            <span className="font-mono text-slate-900 font-medium">@rvce.edu.in</span> mail
          </p>
        </div>

        <div className="space-y-3.5">
          <button
            type="button"
            onClick={() => onGoogleLogin(false, keepSignedIn)}
            disabled={isLoggingIn}
            className="gsi-material-button"
          >
            <div className="gsi-material-button-state" />
            <div className="gsi-material-button-content-wrapper">
              <div className="gsi-material-button-icon">
                <GoogleGIcon />
              </div>
              <span className="gsi-material-button-contents">
                {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
              </span>
            </div>
          </button>

          <label className="inline-flex items-center justify-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600 cursor-pointer"
            />
            <span>Keep me signed in</span>
          </label>
        </div>

        {authError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 text-left leading-relaxed"
          >
            {authError}
          </div>
        )}
      </div>
    </main>
  );
};
