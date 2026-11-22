import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2, X } from 'lucide-react';

export interface ComposeDraftPayload {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

interface ComposeModalProps {
  isOpen: boolean;
  fromEmail: string;
  needsPermissionReauth?: boolean;
  onClose: () => void;
  onReauthorizeGmail: () => Promise<boolean>;
  onSendEmail: (draft: ComposeDraftPayload) => Promise<{
    ok: boolean;
    error?: string;
    needsReauth?: boolean;
  }>;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  fromEmail,
  needsPermissionReauth = false,
  onClose,
  onReauthorizeGmail,
  onSendEmail,
}) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showReauthAction, setShowReauthAction] = useState(false);

  const toInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInlineError(null);
      setShowReauthAction(needsPermissionReauth);
      setTimeout(() => toInputRef.current?.focus(), 60);
    }
  }, [isOpen, needsPermissionReauth]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSending) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSending, onClose]);

  if (!isOpen) return null;

  const resetDraft = () => {
    setTo('');
    setCc('');
    setBcc('');
    setShowCc(false);
    setShowBcc(false);
    setSubject('');
    setBody('');
    setInlineError(null);
    setShowReauthAction(false);
  };

  const handleDiscard = () => {
    if (isSending) return;
    resetDraft();
    onClose();
  };

  const handleReauthClick = async () => {
    setIsAuthorizing(true);
    setInlineError(null);
    try {
      const ok = await onReauthorizeGmail();
      if (ok) {
        setShowReauthAction(false);
      }
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;

    const trimmedTo = to.trim();
    if (!trimmedTo) {
      setInlineError('Please enter at least one recipient in the To field.');
      toInputRef.current?.focus();
      return;
    }

    setIsSending(true);
    setInlineError(null);
    try {
      const result = await onSendEmail({
        to: trimmedTo,
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim(),
        body,
      });

      if (result.ok) {
        resetDraft();
        onClose();
      } else {
        setInlineError(result.error || 'Could not send message. Please try again.');
        if (result.needsReauth) {
          setShowReauthAction(true);
        }
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-end sm:justify-end p-0 sm:p-5 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="New Message"
    >
      {/* Mobile backdrop only so desktop remains a crisp Gmail-style floating composer */}
      <div
        className="fixed inset-0 bg-slate-950/25 sm:hidden pointer-events-auto"
        onClick={() => !isSending && onClose()}
        aria-hidden="true"
      />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 pointer-events-auto w-full sm:w-[540px] max-w-full bg-white border border-slate-200 sm:rounded-xl rounded-t-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
      >
        {/* Header */}
        <div className="h-11 px-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-xs font-semibold tracking-tight">New Message</span>
            <span className="text-[11px] font-mono text-slate-400 truncate hidden sm:inline">
              from {fromEmail}
            </span>
          </div>
          <button
            type="button"
            onClick={() => !isSending && onClose()}
            className="p-1 text-slate-300 hover:text-white rounded transition-colors cursor-pointer"
            aria-label="Close composer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Permission Notice if older read-only session needs Send permission */}
        {showReauthAction && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3 shrink-0">
            <span>Google sign-in permission is needed to send emails.</span>
            <button
              type="button"
              onClick={handleReauthClick}
              disabled={isAuthorizing}
              className="font-semibold text-blue-800 hover:text-blue-950 underline underline-offset-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              {isAuthorizing ? 'Authorizing...' : 'Re-authorize Google'}
            </button>
          </div>
        )}

        {/* Recipient & Subject Fields */}
        <div className="divide-y divide-slate-200 border-b border-slate-200 text-sm shrink-0">
          <div className="flex items-center px-4 py-2 gap-2">
            <label htmlFor="compose-to" className="text-xs font-medium text-slate-500 w-12 shrink-0">
              To
            </label>
            <input
              ref={toInputRef}
              id="compose-to"
              type="text"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@rvce.edu.in"
              className="flex-1 min-w-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="hover:text-slate-900 font-medium cursor-pointer"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="hover:text-slate-900 font-medium cursor-pointer"
                >
                  Bcc
                </button>
              )}
            </div>
          </div>

          {showCc && (
            <div className="flex items-center px-4 py-2 gap-2">
              <label
                htmlFor="compose-cc"
                className="text-xs font-medium text-slate-500 w-12 shrink-0"
              >
                Cc
              </label>
              <input
                id="compose-cc"
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@rvce.edu.in"
                className="flex-1 min-w-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          )}

          {showBcc && (
            <div className="flex items-center px-4 py-2 gap-2">
              <label
                htmlFor="compose-bcc"
                className="text-xs font-medium text-slate-500 w-12 shrink-0"
              >
                Bcc
              </label>
              <input
                id="compose-bcc"
                type="text"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="bcc@rvce.edu.in"
                className="flex-1 min-w-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center px-4 py-2 gap-2">
            <label
              htmlFor="compose-subject"
              className="text-xs font-medium text-slate-500 w-12 shrink-0"
            >
              Subject
            </label>
            <input
              id="compose-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 min-w-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Message Body */}
        <div className="flex-1 min-h-[220px] flex flex-col">
          <textarea
            aria-label="Message body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={10}
            className="flex-1 w-full p-4 text-sm text-slate-900 placeholder:text-slate-400 leading-relaxed resize-none focus:outline-none mail-scroll"
          />
        </div>

        {/* Inline Error */}
        {inlineError && (
          <div
            role="alert"
            className="px-4 py-2.5 bg-red-50 border-t border-red-200 text-xs text-red-900 flex items-center justify-between gap-3 shrink-0"
          >
            <span className="leading-relaxed">{inlineError}</span>
            {showReauthAction && (
              <button
                type="button"
                onClick={handleReauthClick}
                disabled={isAuthorizing}
                className="font-semibold text-blue-800 underline whitespace-nowrap cursor-pointer shrink-0"
              >
                Re-authorize
              </button>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="submit"
            disabled={isSending}
            className="h-9 px-4 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDiscard}
            disabled={isSending}
            title="Discard draft"
            aria-label="Discard draft"
            className="h-9 px-2.5 text-xs font-medium text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>Discard</span>
          </button>
        </div>
      </form>
    </div>
  );
};
