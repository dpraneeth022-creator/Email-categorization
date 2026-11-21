import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthLanding } from './components/AuthLanding';
import { MailWorkspace } from './components/MailWorkspace';
import { TrainingStudio } from './components/TrainingStudio';
import {
  checkGoogleRedirectResult,
  getGmailAccessToken,
  googleLogout,
  googleSignIn,
  initGoogleAuth,
} from './lib/firebaseAuth';
import {
  loadStoredFeedback,
  loadStoredRules,
  resetStoredRules,
  saveStoredFeedback,
  saveStoredRules,
} from './lib/storage';
import {
  DEFAULT_ALLOWED_CAMPUS_DOMAINS,
  buildCampusRestrictionError,
  isAllowedCampusEmail,
} from './shared/campusPolicy';
import {
  canFastPathOfficialWebsiteToGeneral,
  classifyMessageLocallyFallback,
  matchMessageDeterministically,
} from './shared/classifierRules';
import type {
  ClassificationRule,
  ConnectedAccount,
  ImapCredentials,
  MailAttachment,
  MailClassification,
  MailMessage,
  ProviderConfigStatus,
  TrainingFeedbackExample,
} from './shared/types';

export interface SyncProgressState {
  isRunning: boolean;
  fetchedCount: number;
  classifiedCount: number;
  totalEstimate: number | null;
  hasMore: boolean;
  phaseLabel: string;
}

type SyncCursor =
  | { provider: 'gmail'; pageToken: string; query?: string }
  | { provider: 'outlook'; nextLink: string }
  | { provider: 'imap'; beforeSeq: number };

export default function App() {
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderConfigStatus | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Strictly in-memory credentials/tokens (never stored in localStorage/sessionStorage)
  const thirdPartyTokenRef = useRef<string | null>(null);
  const imapCredentialsRef = useRef<ImapCredentials | null>(null);

  const [rules, setRules] = useState<ClassificationRule[]>(() => loadStoredRules());
  const [feedbackExamples, setFeedbackExamples] = useState<TrainingFeedbackExample[]>(() =>
    loadStoredFeedback()
  );

  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [isFetchingMail, setIsFetchingMail] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loadingFullMessageId, setLoadingFullMessageId] = useState<string | null>(null);

  const [syncProgress, setSyncProgress] = useState<SyncProgressState>({
    isRunning: false,
    fetchedCount: 0,
    classifiedCount: 0,
    totalEstimate: null,
    hasMore: false,
    phaseLabel: '',
  });

  const [showTrainingView, setShowTrainingView] = useState(false);
  const [trainingInitialTab, setTrainingInitialTab] = useState<'rules' | 'order' | 'test'>('rules');

  // Cancellation & pagination refs for streaming full-mailbox sync
  const syncRunIdRef = useRef(0);
  const nextCursorRef = useRef<SyncCursor | null>(null);
  const totalEstimateRef = useRef<number | null>(null);
  const fullBodyInFlightRef = useRef<Set<string>>(new Set());

  // Keep latest rules & feedback accessible inside mount-only auth listeners
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const feedbackRef = useRef(feedbackExamples);
  feedbackRef.current = feedbackExamples;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const allowedDomainsRef = useRef<readonly string[]>(DEFAULT_ALLOWED_CAMPUS_DOMAINS);
  allowedDomainsRef.current =
    providerStatus?.campus?.allowedDomains && providerStatus.campus.allowedDomains.length > 0
      ? providerStatus.campus.allowedDomains
      : DEFAULT_ALLOWED_CAMPUS_DOMAINS;

  // Load provider configuration status on mount
  useEffect(() => {
    fetch('/api/auth/providers')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setProviderStatus(data);
      })
      .catch(() => {
        // Ignore non-critical startup fetch error
      });
  }, []);

  // Instant 0ms local directory classification + chunked parallel Gemini classification for any number of emails
  const classifyMessages = useCallback(
    async (
      targetMessages: MailMessage[],
      activeRules: ClassificationRule[],
      activeFeedback: TrainingFeedbackExample[],
      options?: { runId?: number; silentErrors?: boolean }
    ): Promise<number> => {
      if (targetMessages.length === 0) return 0;

      // Step 1: Instant 0ms deterministic directory & popular-website fast-path in browser (zero API cost)
      const instantMatches: Record<string, MailClassification> = {};
      const unmatchedMessages: MailMessage[] = [];

      for (const msg of targetMessages) {
        const directMatch = matchMessageDeterministically(msg, activeRules);
        if (directMatch) {
          instantMatches[msg.id] = {
            categoryId: directMatch.rule.id,
            confidence: 1.0,
            matchedBy: 'directory',
            reason: `Matched trained ${directMatch.rule.shortName} rule (${directMatch.matchedEntry}).`,
          };
        } else if (canFastPathOfficialWebsiteToGeneral(msg, activeRules, activeFeedback)) {
          instantMatches[msg.id] = {
            categoryId: 'general',
            confidence: 0.96,
            matchedBy: 'directory',
            reason: 'Official email from a popular website routed to General Inbox.',
          };
        } else {
          unmatchedMessages.push(msg);
        }
      }

      let classifiedNow = Object.keys(instantMatches).length;

      if (classifiedNow > 0) {
        setMessages((prev) =>
          prev.map((msg) => ({
            ...msg,
            classification: instantMatches[msg.id] || msg.classification,
          }))
        );
      }

      if (unmatchedMessages.length === 0) return classifiedNow;

      // Step 2: Send remaining emails in fast 75-message chunks to campus-authenticated classifier
      setIsClassifying(true);
      if (!options?.silentErrors) {
        setWorkspaceError(null);
      }

      try {
        const gmailToken = getGmailAccessToken();
        const chunkSize = 75;
        for (let i = 0; i < unmatchedMessages.length; i += chunkSize) {
          if (options?.runId !== undefined && syncRunIdRef.current !== options.runId) {
            break;
          }

          const slice = unmatchedMessages.slice(i, i + chunkSize);
          let classMap: Record<string, MailClassification> = {};

          if (gmailToken) {
            const compactPayload = slice.map((m) => ({
              id: m.id,
              provider: m.provider,
              fromName: m.fromName,
              fromEmail: m.fromEmail,
              replyTo: m.replyTo,
              originalSender: m.originalSender,
              to: m.to,
              subject: m.subject,
              snippet: m.snippet.slice(0, 180),
              bodyText: (m.bodyText || m.snippet || '').slice(0, 240),
              labelIds: m.labelIds,
              dateIso: m.dateIso,
              unread: m.unread,
            }));

            try {
              const res = await fetch('/api/classify', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${gmailToken}`,
                },
                body: JSON.stringify({
                  messages: compactPayload,
                  rules: activeRules,
                  feedbackExamples: activeFeedback,
                }),
              });
              const data = await res.json();
              if (res.ok && data?.classifications) {
                classMap = data.classifications as Record<string, MailClassification>;
              } else {
                for (const m of slice) {
                  classMap[m.id] = classifyMessageLocallyFallback(m, activeRules, activeFeedback);
                }
              }
            } catch {
              for (const m of slice) {
                classMap[m.id] = classifyMessageLocallyFallback(m, activeRules, activeFeedback);
              }
            }
          } else {
            for (const m of slice) {
              classMap[m.id] = classifyMessageLocallyFallback(m, activeRules, activeFeedback);
            }
          }

          classifiedNow += Object.keys(classMap).length;

          setMessages((prev) =>
            prev.map((msg) => ({
              ...msg,
              classification: classMap[msg.id] || msg.classification,
            }))
          );

          if (options?.runId === undefined) {
            setSyncProgress((prev) => ({
              ...prev,
              classifiedCount: prev.classifiedCount + Object.keys(classMap).length,
            }));
          }
        }
      } catch (err) {
        if (!options?.silentErrors) {
          setWorkspaceError(
            err instanceof Error ? err.message : 'Unable to classify emails right now.'
          );
        }
      } finally {
        setIsClassifying(false);
      }

      return classifiedNow;
    },
    []
  );

  // Stream & categorize EVERY email in the connected mailbox page-by-page (100 emails/page)
  const fetchAndClassifyMail = useCallback(
    async (
      connected: ConnectedAccount,
      options?: {
        tokenOverride?: string;
        imapOverride?: ImapCredentials;
        rulesOverride?: ClassificationRule[];
        feedbackOverride?: TrainingFeedbackExample[];
        gmailQuery?: string;
        resume?: boolean;
      }
    ): Promise<boolean> => {
      const runId = ++syncRunIdRef.current;
      const isResume = Boolean(options?.resume && nextCursorRef.current);

      setIsFetchingMail(true);
      setWorkspaceError(null);

      const activeRules = options?.rulesOverride || rulesRef.current;
      const activeFeedback = options?.feedbackOverride || feedbackRef.current;

      if (connected.provider === 'import') {
        try {
          await classifyMessages(messagesRef.current, activeRules, activeFeedback, { runId });
          return true;
        } finally {
          setIsFetchingMail(false);
        }
      }

      if (connected.provider === 'yahoo') {
        setMessages([]);
        setWorkspaceError(
          'Yahoo OAuth connected. To read your Yahoo inbox directly, sign out and connect via the Any Email (IMAP) tab with a Yahoo App Password.'
        );
        setIsFetchingMail(false);
        return true;
      }

      let totalFetched = isResume ? messagesRef.current.length : 0;
      let totalClassified = isResume
        ? messagesRef.current.filter((m) => Boolean(m.classification)).length
        : 0;
      let totalEstimate: number | null = isResume ? totalEstimateRef.current : null;
      const seenIds = new Set<string>(isResume ? messagesRef.current.map((m) => m.id) : []);

      let cursor: SyncCursor | null = isResume ? nextCursorRef.current : null;
      let isFirstPage = !isResume;

      if (!isResume) {
        nextCursorRef.current = null;
        totalEstimateRef.current = null;
        setMessages([]);
      }

      setSyncProgress({
        isRunning: true,
        fetchedCount: totalFetched,
        classifiedCount: totalClassified,
        totalEstimate,
        hasMore: true,
        phaseLabel: options?.gmailQuery ? 'Syncing RVCE & volunteering mail' : 'Syncing all mail',
      });

      try {
        while (syncRunIdRef.current === runId) {
          let pageMessages: MailMessage[] = [];
          let nextCursor: SyncCursor | null = null;

          if (connected.provider === 'imap') {
            const creds = options?.imapOverride || imapCredentialsRef.current;
            if (!creds) {
              throw new Error('IMAP session credentials are unavailable. Please reconnect.');
            }
            const beforeSeq = cursor?.provider === 'imap' ? cursor.beforeSeq : undefined;
            const res = await fetch('/api/imap/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: creds.email,
                password: creds.password,
                host: creds.host,
                port: creds.port,
                maxResults: 100,
                beforeSeq,
              }),
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Failed to fetch emails via IMAP.');
            }
            pageMessages = Array.isArray(data.messages) ? data.messages : [];
            if (typeof data.totalExists === 'number' && data.totalExists > 0) {
              totalEstimate = data.totalExists;
            }
            if (typeof data.nextBeforeSeq === 'number' && data.nextBeforeSeq > 1) {
              nextCursor = { provider: 'imap', beforeSeq: data.nextBeforeSeq };
            }
          } else {
            const accessToken =
              options?.tokenOverride ||
              (connected.provider === 'gmail' ? getGmailAccessToken() : thirdPartyTokenRef.current);

            if (!accessToken) {
              throw new Error('Your session token is unavailable. Click Re-authorize Gmail.');
            }

            let endpoint = '';
            if (connected.provider === 'gmail') {
              const gmailParams = new URLSearchParams({
                maxResults: '100',
                mode: 'metadata',
              });
              const activeQuery =
                cursor?.provider === 'gmail' ? cursor.query : options?.gmailQuery;
              if (activeQuery) {
                gmailParams.set('q', activeQuery);
              }
              if (cursor?.provider === 'gmail' && cursor.pageToken) {
                gmailParams.set('pageToken', cursor.pageToken);
              }
              endpoint = `/api/gmail/messages?${gmailParams.toString()}`;
            } else {
              const outlookParams = new URLSearchParams({ maxResults: '100' });
              if (cursor?.provider === 'outlook' && cursor.nextLink) {
                outlookParams.set('nextLink', cursor.nextLink);
              }
              endpoint = `/api/outlook/messages?${outlookParams.toString()}`;
            }

            const res = await fetch(endpoint, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            const rawText = await res.text();
            let data: {
              messages?: MailMessage[];
              nextPageToken?: string | null;
              nextLink?: string | null;
              resultSizeEstimate?: number;
              error?: string;
            } = {};
            try {
              data = JSON.parse(rawText);
            } catch {
              throw new Error(`Unexpected response from mail server (${res.status}).`);
            }

            if (!res.ok) {
              throw new Error(data.error || 'Failed to load messages from your mail provider.');
            }

            pageMessages = Array.isArray(data.messages) ? data.messages : [];

            if (connected.provider === 'gmail') {
              if (isFirstPage && typeof data.resultSizeEstimate === 'number') {
                totalEstimate = data.resultSizeEstimate;
              }
              if (data.nextPageToken) {
                nextCursor = {
                  provider: 'gmail',
                  pageToken: data.nextPageToken,
                  query: cursor?.provider === 'gmail' ? cursor.query : options?.gmailQuery,
                };
              }
            } else if (connected.provider === 'outlook' && data.nextLink) {
              nextCursor = { provider: 'outlook', nextLink: data.nextLink };
            }
          }

          if (syncRunIdRef.current !== runId) break;

          // Deduplicate and merge new page immediately into inbox state
          const freshMessages = pageMessages.filter((m) => {
            if (seenIds.has(m.id)) return false;
            seenIds.add(m.id);
            return true;
          });

          if (freshMessages.length > 0) {
            totalFetched += freshMessages.length;
            setMessages((prev) => (isFirstPage ? freshMessages : [...prev, ...freshMessages]));
          }

          isFirstPage = false;
          nextCursorRef.current = nextCursor;

          setSyncProgress({
            isRunning: true,
            fetchedCount: totalFetched,
            classifiedCount: totalClassified,
            totalEstimate: totalEstimate ? Math.max(totalEstimate, totalFetched) : null,
            hasMore: Boolean(nextCursor),
            phaseLabel: 'Categorizing mail',
          });

          // Classify this page right away so folder counts climb live
          if (freshMessages.length > 0) {
            const newlyClassified = await classifyMessages(
              freshMessages,
              rulesRef.current,
              feedbackRef.current,
              { runId, silentErrors: true }
            );
            totalClassified += newlyClassified;
          }

          if (syncRunIdRef.current !== runId) break;

          totalEstimateRef.current = totalEstimate ? Math.max(totalEstimate, totalFetched) : null;
          setSyncProgress({
            isRunning: Boolean(nextCursor),
            fetchedCount: totalFetched,
            classifiedCount: totalClassified,
            totalEstimate: totalEstimateRef.current,
            hasMore: Boolean(nextCursor),
            phaseLabel: nextCursor ? 'Loading older mail' : 'All mail categorized',
          });

          if (!nextCursor) {
            break;
          }

          cursor = nextCursor;
        }

        return true;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to fetch emails from provider.';
        setWorkspaceError(msg);
        return false;
      } finally {
        if (syncRunIdRef.current === runId) {
          setIsFetchingMail(false);
          setSyncProgress((prev) => ({
            ...prev,
            isRunning: false,
            hasMore: Boolean(nextCursorRef.current),
          }));
        }
      }
    },
    [classifyMessages]
  );

  const handleStopSync = useCallback(() => {
    syncRunIdRef.current += 1;
    setIsFetchingMail(false);
    setIsClassifying(false);
    setSyncProgress((prev) => ({
      ...prev,
      isRunning: false,
      hasMore: Boolean(nextCursorRef.current),
      phaseLabel: 'Paused',
    }));
  }, []);

  const handleEnsureFullMessage = useCallback(async (message: MailMessage) => {
    if (message.provider !== 'gmail' || message.fullBodyLoaded !== false) return;
    if (fullBodyInFlightRef.current.has(message.id)) return;

    const token = getGmailAccessToken();
    if (!token) return;

    fullBodyInFlightRef.current.add(message.id);
    setLoadingFullMessageId(message.id);

    try {
      const res = await fetch(`/api/gmail/messages/${encodeURIComponent(message.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        id: string;
        bodyText?: string;
        bodyHtml?: string;
        attachments?: MailAttachment[];
        fullBodyLoaded?: boolean;
      };

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message.id) return m;
          const hydrated: MailMessage = {
            ...m,
            bodyText: data.bodyText ?? m.bodyText,
            bodyHtml: data.bodyHtml,
            attachments: data.attachments,
            fullBodyLoaded: true,
          };
          // Re-check deterministic rules once full body loads (e.g., forwarded RVCE senders or "club" keyword in body)
          if (
            !hydrated.classification ||
            hydrated.classification.categoryId === 'general' ||
            hydrated.classification.categoryId === 'academic'
          ) {
            const directMatch = matchMessageDeterministically(hydrated, rulesRef.current);
            if (
              directMatch &&
              (hydrated.classification?.categoryId !== 'academic' ||
                directMatch.rule.id === 'surveys' ||
                directMatch.rule.id === 'clubs' ||
                directMatch.rule.id === 'volunteering')
            ) {
              hydrated.classification = {
                categoryId: directMatch.rule.id,
                confidence: 1.0,
                matchedBy: 'directory',
                reason: `Matched trained ${directMatch.rule.shortName} rule (${directMatch.matchedEntry}).`,
              };
            }
          }
          return hydrated;
        })
      );
    } catch {
      // Keep snippet fallback cleanly if full hydration fails transiently
    } finally {
      fullBodyInFlightRef.current.delete(message.id);
      setLoadingFullMessageId((curr) => (curr === message.id ? null : curr));
    }
  }, []);

  const fetchRef = useRef(fetchAndClassifyMail);
  fetchRef.current = fetchAndClassifyMail;

  // Initialize Firebase Google Auth listener ONCE on mount (prevents duplicate fetches / state drops)
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        if (!isAllowedCampusEmail(user.email, allowedDomainsRef.current)) {
          void googleLogout();
          setAccount(null);
          setAuthError(buildCampusRestrictionError(user.email, allowedDomainsRef.current));
          return;
        }
        const nextAccount: ConnectedAccount = {
          provider: 'gmail',
          email: user.email || 'campus-user',
          displayName: user.displayName || user.email || 'Campus User',
          photoUrl: user.photoURL || undefined,
        };
        setAccount((prev) => {
          if (prev?.provider === 'gmail' && prev.email === nextAccount.email) {
            return prev;
          }
          return nextAccount;
        });
        setAuthError(null);
        fetchRef.current(nextAccount, { tokenOverride: token });
      },
      () => {
        setAccount((prev) => (prev?.provider === 'gmail' ? null : prev));
      },
      allowedDomainsRef.current
    );
    // Handle standalone mobile redirect return if applicable
    void checkGoogleRedirectResult(allowedDomainsRef.current)
      .then((result) => {
        if (!result) return;
        const connected: ConnectedAccount = {
          provider: 'gmail',
          email: result.user.email || 'campus-user',
          displayName: result.user.displayName || result.user.email || 'Campus User',
          photoUrl: result.user.photoURL || undefined,
        };
        setAccount(connected);
        setAuthError(null);
        setShowTrainingView(false);
        void fetchRef.current(connected, { tokenOverride: result.accessToken });
      })
      .catch((err) => {
        setAuthError(
          err instanceof Error ? err.message : 'College Google sign-in could not be completed.'
        );
      });

    return () => unsubscribe();
  }, []);

  // Listen for Outlook / Yahoo OAuth popup postMessage completion
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'OUTLOOK_OAUTH_SUCCESS' && data.accessToken && data.account) {
        if (!isAllowedCampusEmail(data.account.email, allowedDomainsRef.current)) {
          setIsLoggingIn(false);
          setAuthError(buildCampusRestrictionError(data.account.email, allowedDomainsRef.current));
          return;
        }
        thirdPartyTokenRef.current = data.accessToken;
        const connected: ConnectedAccount = data.account;
        setAccount(connected);
        setAuthError(null);
        setIsLoggingIn(false);
        fetchRef.current(connected, { tokenOverride: data.accessToken });
      } else if (data.type === 'YAHOO_OAUTH_SUCCESS' && data.accessToken && data.account) {
        if (!isAllowedCampusEmail(data.account.email, allowedDomainsRef.current)) {
          setIsLoggingIn(false);
          setAuthError(buildCampusRestrictionError(data.account.email, allowedDomainsRef.current));
          return;
        }
        thirdPartyTokenRef.current = data.accessToken;
        const connected: ConnectedAccount = data.account;
        setAccount(connected);
        setAuthError(null);
        setIsLoggingIn(false);
        fetchRef.current(connected, { tokenOverride: data.accessToken });
      } else if (data.type === 'OUTLOOK_OAUTH_ERROR' || data.type === 'YAHOO_OAUTH_ERROR') {
        setIsLoggingIn(false);
        setAuthError(data.error || 'Provider sign-in failed.');
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleGoogleLogin = async (forceConsent = false) => {
    setIsLoggingIn(true);
    setAuthError(null);
    setWorkspaceError(null);
    try {
      const result = await googleSignIn(forceConsent, allowedDomainsRef.current);
      if (!result) {
        return;
      }
      const connected: ConnectedAccount = {
        provider: 'gmail',
        email: result.user.email || 'campus-user',
        displayName: result.user.displayName || result.user.email || 'Campus User',
        photoUrl: result.user.photoURL || undefined,
      };
      setAccount(connected);
      setShowTrainingView(false);
      await fetchAndClassifyMail(connected, { tokenOverride: result.accessToken });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'College Google sign-in was cancelled or failed.';
      setAuthError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleThirdPartyOAuth = async (provider: 'outlook' | 'yahoo') => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const res = await fetch(`/api/auth/${provider}/url`);
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.message || `Could not initialize ${provider} sign-in.`);
      }
      const popup = window.open(data.url, `${provider}_oauth`, 'width=600,height=700');
      if (!popup) {
        throw new Error('Popup was blocked by your browser. Please allow popups and try again.');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : `Failed to connect ${provider}.`);
      setIsLoggingIn(false);
    }
  };

  const handleImapLogin = async (creds: ImapCredentials) => {
    setIsLoggingIn(true);
    setAuthError(null);
    setWorkspaceError(null);

    if (!isAllowedCampusEmail(creds.email, allowedDomainsRef.current)) {
      setAuthError(buildCampusRestrictionError(creds.email, allowedDomainsRef.current));
      setIsLoggingIn(false);
      return;
    }

    try {
      // Verify credentials and load initial batch before switching into workspace
      const res = await fetch('/api/imap/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: creds.email,
          password: creds.password,
          host: creds.host,
          port: creds.port,
          maxResults: 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not connect to your IMAP mailbox.');
      }

      imapCredentialsRef.current = creds;
      const connected: ConnectedAccount = {
        provider: 'imap',
        email: creds.email,
        displayName: creds.email.split('@')[0] || creds.email,
        providerLabel: creds.providerLabel,
      };
      const fetched: MailMessage[] = Array.isArray(data.messages) ? data.messages : [];
      const totalExists = typeof data.totalExists === 'number' ? data.totalExists : fetched.length;
      const nextBeforeSeq = typeof data.nextBeforeSeq === 'number' ? data.nextBeforeSeq : null;

      setAccount(connected);
      setShowTrainingView(false);
      setMessages(fetched);

      if (nextBeforeSeq && nextBeforeSeq > 1) {
        nextCursorRef.current = { provider: 'imap', beforeSeq: nextBeforeSeq };
      } else {
        nextCursorRef.current = null;
      }

      setSyncProgress({
        isRunning: Boolean(nextBeforeSeq && nextBeforeSeq > 1),
        fetchedCount: fetched.length,
        classifiedCount: 0,
        totalEstimate: totalExists,
        hasMore: Boolean(nextBeforeSeq && nextBeforeSeq > 1),
        phaseLabel: 'Categorizing mail',
      });

      if (fetched.length > 0) {
        const classified = await classifyMessages(fetched, rulesRef.current, feedbackRef.current);
        setSyncProgress((prev) => ({ ...prev, classifiedCount: classified }));
      }

      // Automatically continue syncing remaining IMAP pages in background
      if (nextBeforeSeq && nextBeforeSeq > 1) {
        void fetchAndClassifyMail(connected, { imapOverride: creds, resume: true });
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to connect via IMAP.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleImportEmailFiles = async (fileList: FileList) => {
    setIsLoggingIn(true);
    setAuthError(null);
    setWorkspaceError(null);

    try {
      const files: Array<{ name: string; content: string }> = [];
      for (const file of Array.from(fileList)) {
        const content = await file.text();
        files.push({ name: file.name, content });
      }

      const res = await fetch('/api/import/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not parse uploaded email files.');
      }

      const fetched: MailMessage[] = Array.isArray(data.messages) ? data.messages : [];
      const connected: ConnectedAccount = {
        provider: 'import',
        email: `${fetched.length} imported message${fetched.length === 1 ? '' : 's'}`,
        displayName: 'Imported Mailbox',
        providerLabel: '.eml / .mbox',
      };
      setAccount(connected);
      setShowTrainingView(false);
      setMessages(fetched);
      nextCursorRef.current = null;

      if (fetched.length > 0) {
        await classifyMessages(fetched, rulesRef.current, feedbackRef.current);
      }
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Failed to import uploaded email files.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    syncRunIdRef.current += 1;
    nextCursorRef.current = null;
    if (account?.provider === 'gmail') {
      await googleLogout();
    }
    thirdPartyTokenRef.current = null;
    imapCredentialsRef.current = null;
    setAccount(null);
    setMessages([]);
    setWorkspaceError(null);
    setShowTrainingView(false);
    setSyncProgress({
      isRunning: false,
      fetchedCount: 0,
      classifiedCount: 0,
      totalEstimate: null,
      hasMore: false,
      phaseLabel: '',
    });
  };

  const handleUpdateRules = (nextRules: ClassificationRule[]) => {
    setRules(nextRules);
    saveStoredRules(nextRules);
  };

  const handleResetRules = () => {
    const defaults = resetStoredRules();
    setRules(defaults);
  };

  const handleRemoveFeedback = (id: string) => {
    const next = feedbackExamples.filter((ex) => ex.id !== id);
    setFeedbackExamples(next);
    saveStoredFeedback(next);
  };

  const handleReassignMessage = (
    message: MailMessage,
    newCategoryId: string,
    addSenderToDirectory: boolean
  ) => {
    const targetRule = rules.find((r) => r.id === newCategoryId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              classification: {
                categoryId: newCategoryId,
                confidence: 1.0,
                matchedBy: 'user_feedback',
                reason: targetRule
                  ? `Manually assigned to ${targetRule.name} and saved to training model.`
                  : 'Manually moved to General Inbox.',
              },
            }
          : m
      )
    );

    const example: TrainingFeedbackExample = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fromEmail: message.fromEmail,
      subject: message.subject,
      snippet: message.snippet.slice(0, 140),
      assignedCategoryId: newCategoryId,
      createdAt: new Date().toISOString(),
    };
    const nextFeedback = [...feedbackExamples, example].slice(-50);
    setFeedbackExamples(nextFeedback);
    saveStoredFeedback(nextFeedback);

    if (addSenderToDirectory && newCategoryId !== 'general' && message.fromEmail) {
      const normalized = message.fromEmail.trim().toLowerCase();
      const nextRules = rules.map((r) => {
        if (r.id === newCategoryId) {
          return {
            ...r,
            senders: Array.from(new Set([...r.senders, normalized])),
          };
        }
        return {
          ...r,
          senders: r.senders.filter((s) => s.toLowerCase() !== normalized),
        };
      });
      handleUpdateRules(nextRules);
    }
  };

  const handleToggleReadState = useCallback((messageId: string, unread: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, unread } : m))
    );
  }, []);

  const handleDownloadAttachment = useCallback(
    async (message: MailMessage, attachment: MailAttachment) => {
      const triggerBlobDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'attachment';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      };

      if (attachment.inlineDataBase64) {
        const binaryStr = atob(attachment.inlineDataBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], {
          type: attachment.mimeType || 'application/octet-stream',
        });
        triggerBlobDownload(blob, attachment.filename);
        return;
      }

      if (message.provider === 'gmail') {
        const token = getGmailAccessToken();
        if (!token) {
          throw new Error('Your Gmail session expired. Click Re-authorize Gmail to download files.');
        }

        const params = new URLSearchParams({
          filename: attachment.filename,
          mimeType: attachment.mimeType || 'application/octet-stream',
        });

        const res = await fetch(
          `/api/gmail/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(
            attachment.id
          )}?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          let errMsg = `Failed to download attachment (${res.status}).`;
          try {
            const errJson = (await res.json()) as { error?: string };
            if (errJson.error) errMsg = errJson.error;
          } catch {
            // Keep default message
          }
          throw new Error(errMsg);
        }

        const blob = await res.blob();
        triggerBlobDownload(blob, attachment.filename);
        return;
      }

      throw new Error('Direct download is not available for this attachment.');
    },
    []
  );

  if (showTrainingView) {
    return (
      <TrainingStudio
        rules={rules}
        feedbackExamples={feedbackExamples}
        initialTab={trainingInitialTab}
        isAuthenticated={Boolean(account)}
        onBack={() => setShowTrainingView(false)}
        onUpdateRules={handleUpdateRules}
        onResetRules={handleResetRules}
        onRemoveFeedback={handleRemoveFeedback}
        onReclassifyInbox={
          account ? () => classifyMessages(messages, rules, feedbackExamples) : undefined
        }
      />
    );
  }

  if (!account) {
    return (
      <AuthLanding
        isLoggingIn={isLoggingIn}
        authError={authError}
        onGoogleLogin={handleGoogleLogin}
      />
    );
  }

  return (
    <MailWorkspace
      account={account}
      messages={messages}
      rules={rules}
      isFetchingMail={isFetchingMail}
      isClassifying={isClassifying}
      syncProgress={syncProgress}
      loadingFullMessageId={loadingFullMessageId}
      errorMessage={workspaceError}
      onSyncMail={() => fetchAndClassifyMail(account)}
      onStopSync={handleStopSync}
      onResumeSync={() => fetchAndClassifyMail(account, { resume: true })}
      onSyncRvceMail={
        account.provider === 'gmail'
          ? () =>
              fetchAndClassifyMail(account, {
                gmailQuery:
                  'rvce.edu.in OR rvei.edu.in OR mathworks OR volunteering OR nss OR ncc OR club OR survey',
              })
          : undefined
      }
      onRunClassify={() => classifyMessages(messages, rules, feedbackExamples)}
      onReauthorizeGmail={() => handleGoogleLogin(true)}
      onSignOut={handleSignOut}
      onOpenTraining={(tab = 'rules') => {
        setTrainingInitialTab(tab);
        setShowTrainingView(true);
      }}
      onReassignMessage={handleReassignMessage}
      onToggleReadState={handleToggleReadState}
      onDownloadAttachment={handleDownloadAttachment}
      onEnsureFullMessage={handleEnsureFullMessage}
    />
  );
}
