import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthLanding } from './components/AuthLanding';
import type { ComposeDraftPayload } from './components/ComposeModal';
import { MailWorkspace } from './components/MailWorkspace';
import {
  checkGoogleRedirectResult,
  getGmailAccessToken,
  googleLogout,
  googleSignIn,
  hasFullMailActionScopes,
  initGoogleAuth,
  invalidateGmailAccessToken,
  isGmailTokenExpired,
  loadPersistedSession,
  savePersistedSession,
  updatePersistedLastSync,
} from './lib/firebaseAuth';
import {
  deleteCachedMessages,
  loadCachedMailbox,
  loadSavedClassifications,
  saveCachedClassifications,
  saveCachedMessages,
  saveCachedMeta,
} from './lib/mailCache';
import { loadStoredFeedback, loadStoredRules } from './lib/storage';
import {
  DEFAULT_ALLOWED_CAMPUS_DOMAINS,
  buildCampusRestrictionError,
  isAllowedCampusEmail,
} from './shared/campusPolicy';
import {
  CURRENT_RULES_VERSION,
  canFastPathOfficialWebsiteToGeneral,
  classifyMessageLocallyFallback,
  decodeHtmlEntities,
  hasExperientialLearningSignal,
  matchMessageDeterministically,
} from './shared/classifierRules';
import type {
  ClassificationRule,
  ConnectedAccount,
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

const CLIENT_BACKOFF_DELAYS_MS = [2000, 4000, 8000];
const RATE_LIMIT_FRIENDLY_MESSAGE =
  'Sync paused briefly due to Gmail rate limits — retrying automatically.';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMessageText(msg: MailMessage): MailMessage {
  return {
    ...msg,
    fromName: decodeHtmlEntities(msg.fromName || msg.fromEmail || ''),
    subject: decodeHtmlEntities(msg.subject || '(No Subject)'),
    snippet: decodeHtmlEntities(msg.snippet || ''),
  };
}

/**
 * Strictly deduplicates emails by message ID and thread ID so identical emails
 * never appear twice in a row. Preserves hydrated full HTML bodies/attachments
 * and saved classifications, sorted newest-first.
 */
function deduplicateAndSortMessages(list: MailMessage[]): MailMessage[] {
  const byId = new Map<string, MailMessage>();
  for (const raw of list) {
    if (!raw?.id) continue;
    const msg = normalizeMessageText(raw);
    const existing = byId.get(msg.id);
    if (!existing) {
      byId.set(msg.id, msg);
    } else {
      byId.set(msg.id, {
        ...existing,
        ...msg,
        bodyHtml: msg.bodyHtml || existing.bodyHtml,
        bodyText: msg.fullBodyLoaded ? msg.bodyText : existing.bodyText || msg.bodyText,
        attachments: msg.attachments?.length ? msg.attachments : existing.attachments,
        fullBodyLoaded: Boolean(msg.fullBodyLoaded || existing.fullBodyLoaded),
        classification: existing.classification || msg.classification,
      });
    }
  }

  const byThread = new Map<string, MailMessage>();
  for (const msg of byId.values()) {
    // Keep trashed vs active thread entries separated by trash state so moving a single message works cleanly
    const isTrashed = Boolean(msg.labelIds?.includes('TRASH'));
    const threadKey = msg.threadId
      ? `${isTrashed ? 'trash:' : 'active:'}thread:${msg.threadId}`
      : `id:${msg.id}`;
    const existing = byThread.get(threadKey);
    if (!existing) {
      byThread.set(threadKey, msg);
      continue;
    }
    const existingTime = Date.parse(existing.dateIso) || 0;
    const incomingTime = Date.parse(msg.dateIso) || 0;
    const newer = incomingTime >= existingTime ? msg : existing;
    const older = incomingTime >= existingTime ? existing : msg;
    byThread.set(threadKey, {
      ...newer,
      bodyHtml: newer.bodyHtml || older.bodyHtml,
      attachments: newer.attachments?.length ? newer.attachments : older.attachments,
      fullBodyLoaded: Boolean(newer.fullBodyLoaded || older.fullBodyLoaded),
      classification: newer.classification || older.classification,
    });
  }

  return Array.from(byThread.values()).sort((a, b) => {
    const timeA = Date.parse(a.dateIso) || 0;
    const timeB = Date.parse(b.dateIso) || 0;
    return timeB - timeA;
  });
}

function getLatestMessageEpochSeconds(list: MailMessage[]): number | null {
  let latestMs = 0;
  for (const msg of list) {
    if (msg.labelIds?.includes('TRASH')) continue;
    const ms = Date.parse(msg.dateIso);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
    }
  }
  if (latestMs <= 0) return null;
  return Math.max(0, Math.floor(latestMs / 1000) - 60);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'attachment';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function App() {
  // Synchronously restore "Keep me signed in" campus session so reopening Chrome opens immediately
  const initialSessionRef = useRef(loadPersistedSession());

  const [account, setAccount] = useState<ConnectedAccount | null>(
    () => initialSessionRef.current?.account ?? null
  );
  const [keepSignedIn, setKeepSignedIn] = useState<boolean>(
    () => initialSessionRef.current?.keepSignedIn ?? true
  );
  const [needsGmailReconnect, setNeedsGmailReconnect] = useState<boolean>(() => {
    const sess = initialSessionRef.current;
    return Boolean(sess && isGmailTokenExpired(sess.account.email));
  });
  const [needsMailActionScopeReauth, setNeedsMailActionScopeReauth] = useState<boolean>(() => {
    const sess = initialSessionRef.current;
    return Boolean(sess && !hasFullMailActionScopes(sess.account.email));
  });

  const [providerStatus, setProviderStatus] = useState<ProviderConfigStatus | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [rules] = useState<ClassificationRule[]>(() => loadStoredRules());
  const [feedbackExamples] = useState<TrainingFeedbackExample[]>(() => loadStoredFeedback());

  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [isFetchingMail, setIsFetchingMail] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadingFullMessageId, setLoadingFullMessageId] = useState<string | null>(null);
  const [reclassifyingMessageId, setReclassifyingMessageId] = useState<string | null>(null);
  const [busyActionMessageId, setBusyActionMessageId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

  const [syncProgress, setSyncProgress] = useState<SyncProgressState>({
    isRunning: false,
    fetchedCount: 0,
    classifiedCount: 0,
    totalEstimate: null,
    hasMore: false,
    phaseLabel: '',
  });

  const syncRunIdRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const nextPageTokenRef = useRef<string | null>(null);
  const totalEstimateRef = useRef<number | null>(null);
  const latestTimestampRef = useRef<number | null>(null);
  const elMigratedRef = useRef<boolean>(false);
  const hydratedAccountRef = useRef<string | null>(null);
  const fullBodyInFlightRef = useRef<Set<string>>(new Set());

  const accountRef = useRef<ConnectedAccount | null>(account);
  accountRef.current = account;
  const keepSignedInRef = useRef(keepSignedIn);
  keepSignedInRef.current = keepSignedIn;
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

  const showToast = useCallback((text: string) => {
    setToastMessage(text);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  // Load campus domain config on mount
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

  /**
   * Ensures we have a fresh Gmail access token with full send/modify/delete permissions.
   * Prompts Google re-authorization cleanly when current session lacks the required scopes.
   */
  const ensureMailActionToken = useCallback(async (forceConsent = false): Promise<string | null> => {
    const acctEmail = accountRef.current?.email;
    if (!forceConsent && hasFullMailActionScopes(acctEmail)) {
      const existing = getGmailAccessToken(acctEmail);
      if (existing) {
        setNeedsGmailReconnect(false);
        setNeedsMailActionScopeReauth(false);
        return existing;
      }
    }

    const result = await googleSignIn(
      true,
      allowedDomainsRef.current,
      keepSignedInRef.current,
      acctEmail
    );
    const token = result?.accessToken || getGmailAccessToken(acctEmail);
    if (token) {
      setNeedsGmailReconnect(false);
      setNeedsMailActionScopeReauth(false);
    }
    return token;
  }, []);

  /**
   * Classifies ONLY newly fetched / unclassified messages unless forceReclassify === true.
   * Strictly checks IndexedDB before running local rules or Gemini API so already-classified
   * messageIds are NEVER re-classified automatically.
   */
  const classifyMessages = useCallback(
    async (
      targetMessages: MailMessage[],
      activeRules: ClassificationRule[],
      activeFeedback: TrainingFeedbackExample[],
      options?: {
        runId?: number;
        accountEmail?: string;
        tokenOverride?: string;
        forceReclassify?: boolean;
      }
    ): Promise<Record<string, MailClassification>> => {
      if (targetMessages.length === 0) return {};

      const acctEmail = options?.accountEmail || accountRef.current?.email || '';
      const forceReclassify = Boolean(options?.forceReclassify);

      // Step 0: Strictly skip any messageId that already has a saved category in IndexedDB
      let messagesToClassify: MailMessage[] = targetMessages;
      const restoredFromIdb: Record<string, MailClassification> = {};

      if (!forceReclassify) {
        const savedMap = acctEmail ? await loadSavedClassifications(acctEmail) : {};
        const pending: MailMessage[] = [];
        for (const msg of targetMessages) {
          const savedCls = savedMap[msg.id];
          if (savedCls?.categoryId) {
            if (!msg.classification?.categoryId) {
              restoredFromIdb[msg.id] = savedCls;
            }
            continue;
          }
          if (msg.classification?.categoryId) {
            continue;
          }
          pending.push(msg);
        }
        messagesToClassify = pending;

        if (Object.keys(restoredFromIdb).length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              restoredFromIdb[m.id] && !m.classification?.categoryId
                ? { ...m, classification: restoredFromIdb[m.id] }
                : m
            )
          );
        }
      }

      if (messagesToClassify.length === 0) {
        return restoredFromIdb;
      }

      const allResults: Record<string, MailClassification> = {};
      const unmatchedMessages: MailMessage[] = [];

      // Step 1: Instant 0ms strict deterministic + popular-website fast-path
      for (const msg of messagesToClassify) {
        const directMatch = matchMessageDeterministically(msg, activeRules);
        if (directMatch) {
          allResults[msg.id] = {
            categoryId: directMatch.categoryId,
            confidence: 1.0,
            matchedBy: 'directory',
            reason: directMatch.rule
              ? `Matched ${directMatch.rule.shortName} (${directMatch.matchedEntry}).`
              : `Routed to General Inbox (${directMatch.matchedEntry}).`,
          };
        } else if (canFastPathOfficialWebsiteToGeneral(msg, activeRules, activeFeedback)) {
          allResults[msg.id] = {
            categoryId: 'general',
            confidence: 0.96,
            matchedBy: 'directory',
            reason: 'Official email from a popular website routed to General Inbox.',
          };
        } else {
          unmatchedMessages.push(msg);
        }
      }

      const applyAndPersist = (
        partial: Record<string, MailClassification>,
        sourceList: MailMessage[]
      ) => {
        if (Object.keys(partial).length === 0) return;

        const baseById = new Map<string, MailMessage>();
        for (const msg of messagesRef.current) baseById.set(msg.id, msg);
        for (const msg of sourceList) {
          if (!baseById.has(msg.id)) baseById.set(msg.id, msg);
        }

        const updatedForCache: MailMessage[] = [];
        for (const [id, nextCls] of Object.entries(partial)) {
          const base = baseById.get(id);
          if (base) {
            updatedForCache.push({ ...base, classification: nextCls });
          }
        }

        setMessages((prev) =>
          prev.map((msg) => {
            const nextCls = partial[msg.id];
            return nextCls ? { ...msg, classification: nextCls } : msg;
          })
        );

        if (acctEmail) {
          if (updatedForCache.length > 0) {
            void saveCachedMessages(acctEmail, updatedForCache);
          } else {
            void saveCachedClassifications(acctEmail, partial);
          }
        }
      };

      applyAndPersist(allResults, messagesToClassify);

      if (unmatchedMessages.length === 0) {
        return { ...restoredFromIdb, ...allResults };
      }

      // Step 2: Classify remaining brand-new ambiguous emails via Gemini (with zero-cost local fallback)
      setIsClassifying(true);
      try {
        const gmailToken = options?.tokenOverride || getGmailAccessToken(acctEmail);
        const chunkSize = 75;

        for (let i = 0; i < unmatchedMessages.length; i += chunkSize) {
          if (options?.runId !== undefined && syncRunIdRef.current !== options.runId) {
            break;
          }

          const slice = unmatchedMessages.slice(i, i + chunkSize);
          let chunkMap: Record<string, MailClassification> = {};

          if (gmailToken) {
            const compactPayload = slice.map((m) => ({
              id: m.id,
              provider: m.provider,
              fromName: m.fromName,
              fromEmail: m.fromEmail,
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
              if (res.status === 401) {
                invalidateGmailAccessToken();
                setNeedsGmailReconnect(true);
              }
              const data = await res.json();
              if (res.ok && data?.classifications) {
                chunkMap = data.classifications as Record<string, MailClassification>;
              } else {
                for (const m of slice) {
                  chunkMap[m.id] = classifyMessageLocallyFallback(m, activeRules, activeFeedback);
                }
              }
            } catch {
              for (const m of slice) {
                chunkMap[m.id] = classifyMessageLocallyFallback(m, activeRules, activeFeedback);
              }
            }
          } else {
            for (const m of slice) {
              chunkMap[m.id] = classifyMessageLocallyFallback(m, activeRules, activeFeedback);
            }
          }

          Object.assign(allResults, chunkMap);
          applyAndPersist(chunkMap, slice);
        }
      } finally {
        setIsClassifying(false);
      }

      return { ...restoredFromIdb, ...allResults };
    },
    []
  );

  /**
   * Hydrates the entire inbox instantaneously from Chrome's IndexedDB and runs the
   * one-time Experiential Learning migration (General -> Academic) without touching
   * any other already-classified emails.
   */
  const hydrateMailboxFromIndexedDb = useCallback(
    async (
      connected: ConnectedAccount
    ): Promise<{
      messages: MailMessage[];
      latestEpochSec: number | null;
    }> => {
      const { messages: cachedList, meta } = await loadCachedMailbox(connected.email);
      let deduped = deduplicateAndSortMessages(cachedList);

      if (meta?.nextPageToken) {
        nextPageTokenRef.current = meta.nextPageToken;
      }
      if (meta?.totalEstimate) {
        totalEstimateRef.current = meta.totalEstimate;
      }

      // One-time migration: move existing cached Experiential Learning emails from General -> Academic
      if (!meta?.elToAcademicMigrated && deduped.length > 0) {
        const migratedUpdates: MailMessage[] = [];
        deduped = deduped.map((msg) => {
          const currentCat = msg.classification?.categoryId || 'general';
          if (currentCat === 'general' && hasExperientialLearningSignal(msg)) {
            const updated: MailMessage = {
              ...msg,
              classification: {
                categoryId: 'academic',
                confidence: 1.0,
                matchedBy: 'directory',
                reason: 'Experiential Learning (EL) routed to Academic.',
              },
            };
            migratedUpdates.push(updated);
            return updated;
          }
          return msg;
        });

        if (migratedUpdates.length > 0) {
          await saveCachedMessages(connected.email, migratedUpdates);
        }

        const latestSec = getLatestMessageEpochSeconds(deduped);
        latestTimestampRef.current = latestSec;
        elMigratedRef.current = true;

        await saveCachedMeta({
          accountEmail: connected.email,
          nextPageToken: meta?.nextPageToken ?? nextPageTokenRef.current,
          totalEstimate: meta?.totalEstimate ?? totalEstimateRef.current,
          rulesVersion: meta?.rulesVersion || CURRENT_RULES_VERSION,
          lastSyncedAt: meta?.lastSyncedAt || Date.now(),
          latestMessageTimestamp: latestSec,
          elToAcademicMigrated: true,
        });
      } else {
        elMigratedRef.current = Boolean(meta?.elToAcademicMigrated);
        latestTimestampRef.current =
          getLatestMessageEpochSeconds(deduped) ?? meta?.latestMessageTimestamp ?? null;
      }

      hydratedAccountRef.current = connected.email.toLowerCase();
      messagesRef.current = deduped;
      setMessages(deduped);
      setSyncProgress({
        isRunning: false,
        fetchedCount: deduped.length,
        classifiedCount: deduped.filter((m) => Boolean(m.classification?.categoryId)).length,
        totalEstimate: totalEstimateRef.current,
        hasMore: Boolean(nextPageTokenRef.current),
        phaseLabel: '',
      });

      const unclassified = deduped.filter((m) => !m.classification?.categoryId);
      if (unclassified.length > 0) {
        await classifyMessages(unclassified, rulesRef.current, feedbackRef.current, {
          accountEmail: connected.email,
          forceReclassify: false,
        });
      }

      return {
        messages: deduped,
        latestEpochSec: latestTimestampRef.current,
      };
    },
    [classifyMessages]
  );

  /**
   * Calls POST /api/gmail/sync with automatic exponential backoff (2s, 4s, 8s) on 403/429 rate limits,
   * and graceful 401 handling (sets reconnect banner without forcing sign-out).
   */
  const requestGmailSyncPageWithBackoff = useCallback(
    async (
      accessToken: string,
      payload: {
        maxResults: number;
        pageToken?: string;
        excludeIds: string[];
        afterTimestamp?: number;
        labelId?: string;
      },
      runId: number
    ): Promise<{
      messages: MailMessage[];
      nextPageToken: string | null;
      resultSizeEstimate: number;
      skippedCachedCount: number;
      allPageCached: boolean;
      rateLimited: boolean;
      tokenExpired?: boolean;
    }> => {
      let attempt = 0;

      while (true) {
        if (syncRunIdRef.current !== runId) {
          return {
            messages: [],
            nextPageToken: payload.pageToken || null,
            resultSizeEstimate: 0,
            skippedCachedCount: 0,
            allPageCached: false,
            rateLimited: false,
          };
        }

        const res = await fetch('/api/gmail/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.status === 401) {
          invalidateGmailAccessToken();
          setNeedsGmailReconnect(true);
          return {
            messages: [],
            nextPageToken: payload.pageToken || null,
            resultSizeEstimate: 0,
            skippedCachedCount: 0,
            allPageCached: false,
            rateLimited: false,
            tokenExpired: true,
          };
        }

        const rawText = await res.text();
        let data: {
          messages?: MailMessage[];
          nextPageToken?: string | null;
          resultSizeEstimate?: number;
          skippedCachedCount?: number;
          allPageCached?: boolean;
          rateLimited?: boolean;
          statusNotice?: string;
          code?: string;
          error?: string;
        } = {};
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error('Unable to reach Gmail right now. Please try syncing again.');
        }

        const isRateLimited =
          res.status === 429 ||
          data.code === 'GMAIL_RATE_LIMITED' ||
          Boolean(data.rateLimited && !res.ok);

        if (isRateLimited) {
          setStatusMessage(RATE_LIMIT_FRIENDLY_MESSAGE);
          if (attempt < CLIENT_BACKOFF_DELAYS_MS.length) {
            await sleep(CLIENT_BACKOFF_DELAYS_MS[attempt]);
            attempt += 1;
            continue;
          }
          return {
            messages: Array.isArray(data.messages) ? data.messages : [],
            nextPageToken: payload.pageToken || null,
            resultSizeEstimate: data.resultSizeEstimate || 0,
            skippedCachedCount: data.skippedCachedCount || 0,
            allPageCached: false,
            rateLimited: true,
          };
        }

        if (!res.ok) {
          throw new Error(
            data.error || 'Unable to sync Gmail right now. Please try again shortly.'
          );
        }

        if (data.statusNotice) {
          setStatusMessage(data.statusNotice);
        } else {
          setStatusMessage(null);
        }

        return {
          messages: Array.isArray(data.messages) ? data.messages : [],
          nextPageToken: data.nextPageToken || null,
          resultSizeEstimate: data.resultSizeEstimate || 0,
          skippedCachedCount: data.skippedCachedCount || 0,
          allPageCached: Boolean(data.allPageCached),
          rateLimited: Boolean(data.rateLimited),
        };
      }
    },
    []
  );

  /**
   * Incremental Sync Inbox + Gmail TRASH Sync:
   * 1. Hydrates cached emails instantaneously from IndexedDB (and runs one-time EL migration).
   * 2. Only fetches NEW inbox emails arrived after the latest cached timestamp (plus excludeIds).
   * 3. Also syncs Gmail's TRASH label so emails deleted directly in Gmail appear in NexaMAIL's Trash folder.
   * 4. Classifies ONLY brand-new emails that do not yet exist in IndexedDB's classification store.
   */
  const syncInbox = useCallback(
    async (
      connected: ConnectedAccount,
      options?: {
        tokenOverride?: string;
        loadOlderOnly?: boolean;
        hydrateCacheFirst?: boolean;
        interactiveAuth?: boolean;
      }
    ): Promise<boolean> => {
      const runId = ++syncRunIdRef.current;
      const isLoadOlder = Boolean(options?.loadOlderOnly);
      const interactiveAuth = options?.interactiveAuth ?? true;

      if (isLoadOlder) {
        setIsLoadingOlder(true);
      } else {
        setIsFetchingMail(true);
      }
      setWorkspaceError(null);
      setStatusMessage(null);

      const activeRules = rulesRef.current;
      const activeFeedback = feedbackRef.current;

      try {
        if (
          options?.hydrateCacheFirst ||
          hydratedAccountRef.current !== connected.email.toLowerCase()
        ) {
          await hydrateMailboxFromIndexedDb(connected);
          if (syncRunIdRef.current !== runId) return false;
        }

        let currentMessages = messagesRef.current;
        const cachedIds = new Set<string>(currentMessages.map((m) => m.id));

        let accessToken = options?.tokenOverride || getGmailAccessToken(connected.email);
        if (!accessToken) {
          if (!interactiveAuth) {
            setNeedsGmailReconnect(true);
            return false;
          }

          try {
            const refreshed = await googleSignIn(
              false,
              allowedDomainsRef.current,
              keepSignedInRef.current,
              connected.email
            );
            accessToken = refreshed?.accessToken || getGmailAccessToken(connected.email);
          } catch (authErr) {
            setNeedsGmailReconnect(true);
            throw new Error(
              authErr instanceof Error ? authErr.message : 'Reconnect Gmail to sync new emails.'
            );
          }
        }

        if (!accessToken) {
          setNeedsGmailReconnect(true);
          return false;
        }

        setNeedsGmailReconnect(false);
        setNeedsMailActionScopeReauth(!hasFullMailActionScopes(connected.email));

        if (isLoadOlder) {
          const pageToken = nextPageTokenRef.current;
          if (!pageToken) {
            setSyncProgress((prev) => ({ ...prev, hasMore: false, isRunning: false }));
            return true;
          }

          const page = await requestGmailSyncPageWithBackoff(
            accessToken,
            {
              maxResults: 60,
              pageToken,
              excludeIds: Array.from(cachedIds),
            },
            runId
          );

          if (syncRunIdRef.current !== runId) return false;
          if (page.tokenExpired) return false;

          nextPageTokenRef.current = page.nextPageToken;
          if (page.resultSizeEstimate > 0) {
            totalEstimateRef.current = Math.max(
              totalEstimateRef.current || 0,
              page.resultSizeEstimate
            );
          }

          const freshMessages = page.messages.filter((m) => !cachedIds.has(m.id));
          if (freshMessages.length > 0) {
            const merged = deduplicateAndSortMessages([...messagesRef.current, ...freshMessages]);
            messagesRef.current = merged;
            setMessages(merged);
            await saveCachedMessages(connected.email, freshMessages);
            await classifyMessages(freshMessages, activeRules, activeFeedback, {
              runId,
              accountEmail: connected.email,
              tokenOverride: accessToken,
              forceReclassify: false,
            });
          }

          const now = Date.now();
          latestTimestampRef.current =
            getLatestMessageEpochSeconds(messagesRef.current) ?? latestTimestampRef.current;
          await saveCachedMeta({
            accountEmail: connected.email,
            nextPageToken: nextPageTokenRef.current,
            totalEstimate: totalEstimateRef.current,
            rulesVersion: CURRENT_RULES_VERSION,
            lastSyncedAt: now,
            latestMessageTimestamp: latestTimestampRef.current,
            elToAcademicMigrated: true,
          });
          updatePersistedLastSync(now);

          setSyncProgress({
            isRunning: false,
            fetchedCount: messagesRef.current.length,
            classifiedCount: messagesRef.current.filter((m) => Boolean(m.classification?.categoryId))
              .length,
            totalEstimate: totalEstimateRef.current,
            hasMore: Boolean(nextPageTokenRef.current),
            phaseLabel: '',
          });

          return true;
        }

        // Incremental Sync Inbox:
        const nonTrashMessages = currentMessages.filter((m) => !m.labelIds?.includes('TRASH'));
        const isInitialEmptySync = nonTrashMessages.length === 0;
        const afterTimestamp = isInitialEmptySync
          ? undefined
          : getLatestMessageEpochSeconds(nonTrashMessages) ??
            latestTimestampRef.current ??
            undefined;
        const maxIncrementalPages = isInitialEmptySync ? 2 : 4;
        let pageToken: string | undefined = undefined;
        let pagesFetched = 0;

        setSyncProgress((prev) => ({
          ...prev,
          isRunning: true,
          phaseLabel: 'Syncing inbox',
        }));

        while (syncRunIdRef.current === runId && pagesFetched < maxIncrementalPages) {
          const page = await requestGmailSyncPageWithBackoff(
            accessToken,
            {
              maxResults: 60,
              pageToken,
              excludeIds: Array.from(cachedIds),
              afterTimestamp,
            },
            runId
          );

          if (syncRunIdRef.current !== runId) return false;
          if (page.tokenExpired) return false;

          pagesFetched += 1;

          if (page.resultSizeEstimate > 0 && isInitialEmptySync) {
            totalEstimateRef.current = Math.max(
              totalEstimateRef.current || 0,
              page.resultSizeEstimate
            );
          }

          if (isInitialEmptySync) {
            nextPageTokenRef.current = page.nextPageToken;
          }

          const freshMessages = page.messages.filter((m) => !cachedIds.has(m.id));
          for (const m of freshMessages) cachedIds.add(m.id);

          if (freshMessages.length > 0) {
            const merged = deduplicateAndSortMessages([...freshMessages, ...messagesRef.current]);
            messagesRef.current = merged;
            currentMessages = merged;
            setMessages(merged);
            await saveCachedMessages(connected.email, freshMessages);
            await classifyMessages(freshMessages, activeRules, activeFeedback, {
              runId,
              accountEmail: connected.email,
              tokenOverride: accessToken,
              forceReclassify: false,
            });
          }

          if (page.rateLimited) {
            break;
          }

          if (page.allPageCached || (!isInitialEmptySync && page.skippedCachedCount > 0)) {
            break;
          }

          if (!page.nextPageToken) {
            if (isInitialEmptySync) {
              nextPageTokenRef.current = null;
            }
            break;
          }

          pageToken = page.nextPageToken;
        }

        // Also sync Gmail's TRASH label so messages deleted in Gmail appear in NexaMAIL's Trash folder
        if (syncRunIdRef.current === runId) {
          const existingTrashIds = messagesRef.current
            .filter((m) => m.labelIds?.includes('TRASH'))
            .map((m) => m.id);

          const trashPage = await requestGmailSyncPageWithBackoff(
            accessToken,
            {
              maxResults: 50,
              labelId: 'TRASH',
              excludeIds: existingTrashIds,
            },
            runId
          );

          if (syncRunIdRef.current === runId && !trashPage.tokenExpired && trashPage.messages.length > 0) {
            const normalizedTrash = trashPage.messages.map((m) => {
              const existing = messagesRef.current.find((prev) => prev.id === m.id);
              const nextLabels = Array.from(new Set([...(m.labelIds || []), 'TRASH'])).filter(
                (l) => l !== 'INBOX'
              );
              return {
                ...(existing || {}),
                ...m,
                labelIds: nextLabels,
                classification: existing?.classification || m.classification,
              };
            });

            const trashIdSet = new Set(normalizedTrash.map((m) => m.id));
            const withoutReplaced = messagesRef.current.filter((m) => !trashIdSet.has(m.id));
            const mergedWithTrash = deduplicateAndSortMessages([
              ...normalizedTrash,
              ...withoutReplaced,
            ]);
            messagesRef.current = mergedWithTrash;
            setMessages(mergedWithTrash);
            await saveCachedMessages(connected.email, normalizedTrash);
          }
        }

        const now = Date.now();
        latestTimestampRef.current =
          getLatestMessageEpochSeconds(messagesRef.current) ?? latestTimestampRef.current;

        await saveCachedMeta({
          accountEmail: connected.email,
          nextPageToken: nextPageTokenRef.current,
          totalEstimate: totalEstimateRef.current,
          rulesVersion: CURRENT_RULES_VERSION,
          lastSyncedAt: now,
          latestMessageTimestamp: latestTimestampRef.current,
          elToAcademicMigrated: true,
        });
        updatePersistedLastSync(now);

        setSyncProgress({
          isRunning: false,
          fetchedCount: messagesRef.current.length,
          classifiedCount: messagesRef.current.filter((m) => Boolean(m.classification?.categoryId))
            .length,
          totalEstimate: totalEstimateRef.current,
          hasMore: Boolean(nextPageTokenRef.current),
          phaseLabel: '',
        });

        return true;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Unable to sync Gmail right now. Please try again.';
        setWorkspaceError(msg);
        return false;
      } finally {
        if (syncRunIdRef.current === runId) {
          setIsFetchingMail(false);
          setIsLoadingOlder(false);
          setSyncProgress((prev) => ({
            ...prev,
            isRunning: false,
            hasMore: Boolean(nextPageTokenRef.current),
          }));
        }
      }
    },
    [classifyMessages, hydrateMailboxFromIndexedDb, requestGmailSyncPageWithBackoff]
  );

  const handleStopSync = useCallback(() => {
    syncRunIdRef.current += 1;
    setIsFetchingMail(false);
    setIsLoadingOlder(false);
    setIsClassifying(false);
    setStatusMessage(null);
    setSyncProgress((prev) => ({
      ...prev,
      isRunning: false,
      hasMore: Boolean(nextPageTokenRef.current),
      phaseLabel: '',
    }));
  }, []);

  /**
   * Sends a composed email via Gmail API (RFC 2822 base64url) and shows toast confirmation.
   */
  const handleSendEmail = useCallback(
    async (
      draft: ComposeDraftPayload
    ): Promise<{ ok: boolean; error?: string; needsReauth?: boolean }> => {
      try {
        let token = getGmailAccessToken(accountRef.current?.email);
        if (!token || !hasFullMailActionScopes(accountRef.current?.email)) {
          try {
            token = await ensureMailActionToken(true);
          } catch (authErr) {
            setNeedsMailActionScopeReauth(true);
            return {
              ok: false,
              needsReauth: true,
              error:
                authErr instanceof Error
                  ? authErr.message
                  : 'Re-authorize Google with Gmail Send permission to send emails.',
            };
          }
        }

        if (!token) {
          setNeedsMailActionScopeReauth(true);
          return {
            ok: false,
            needsReauth: true,
            error: 'Re-authorize Google to send this email.',
          };
        }

        const res = await fetch('/api/gmail/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(draft),
        });

        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          error?: string;
        };

        if (res.status === 401 || data.code === 'TOKEN_EXPIRED') {
          invalidateGmailAccessToken();
          setNeedsGmailReconnect(true);
          setNeedsMailActionScopeReauth(true);
          return {
            ok: false,
            needsReauth: true,
            error: 'Your Gmail session expired. Click Re-authorize to send.',
          };
        }

        if (res.status === 403 || data.code === 'INSUFFICIENT_SCOPE') {
          setNeedsMailActionScopeReauth(true);
          return {
            ok: false,
            needsReauth: true,
            error:
              'Gmail Send permission is required. Click Re-authorize to grant permission and send.',
          };
        }

        if (!res.ok) {
          return {
            ok: false,
            error: data.error || 'Could not send email. Please try again.',
          };
        }

        showToast('Message sent');
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to send email right now.',
        };
      }
    },
    [ensureMailActionToken, showToast]
  );

  /**
   * Moves an email to Trash optimistically in UI + IndexedDB and calls Gmail messages.trash.
   */
  const handleTrashMessage = useCallback(
    async (message: MailMessage) => {
      const acctEmail = accountRef.current?.email;
      if (!acctEmail) return;

      setWorkspaceError(null);

      let token = getGmailAccessToken(acctEmail);
      if (!token || !hasFullMailActionScopes(acctEmail)) {
        try {
          token = await ensureMailActionToken(true);
        } catch (authErr) {
          setNeedsMailActionScopeReauth(true);
          setWorkspaceError(
            authErr instanceof Error
              ? authErr.message
              : 'Re-authorize Google with Gmail Modify permission to delete emails.'
          );
          return;
        }
      }

      if (!token) {
        setNeedsMailActionScopeReauth(true);
        setWorkspaceError('Re-authorize Gmail to delete emails.');
        return;
      }

      // Optimistic UI update: immediately remove from current mailbox & All Mail and move to Trash
      const previousSnapshot = message;
      const trashedMsg: MailMessage = {
        ...message,
        labelIds: Array.from(new Set([...(message.labelIds || []), 'TRASH'])).filter(
          (l) => l !== 'INBOX'
        ),
      };

      setBusyActionMessageId(message.id);
      setMessages((prev) => prev.map((m) => (m.id === message.id ? trashedMsg : m)));
      void saveCachedMessages(acctEmail, [trashedMsg]);

      try {
        const res = await fetch(`/api/gmail/messages/${encodeURIComponent(message.id)}/trash`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          error?: string;
          labelIds?: string[];
        };

        if (!res.ok) {
          // Rollback optimistic update on failure
          setMessages((prev) => prev.map((m) => (m.id === message.id ? previousSnapshot : m)));
          void saveCachedMessages(acctEmail, [previousSnapshot]);

          if (res.status === 401 || data.code === 'TOKEN_EXPIRED') {
            invalidateGmailAccessToken();
            setNeedsGmailReconnect(true);
          }
          if (res.status === 403 || data.code === 'INSUFFICIENT_SCOPE') {
            setNeedsMailActionScopeReauth(true);
          }
          setWorkspaceError(
            data.error || 'Could not move email to Trash. Click Re-authorize Gmail and try again.'
          );
          return;
        }

        if (Array.isArray(data.labelIds)) {
          const syncedTrashed: MailMessage = {
            ...trashedMsg,
            labelIds: Array.from(new Set([...data.labelIds, 'TRASH'])),
          };
          setMessages((prev) => prev.map((m) => (m.id === message.id ? syncedTrashed : m)));
          void saveCachedMessages(acctEmail, [syncedTrashed]);
        }

        showToast('Moved to Trash');
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? previousSnapshot : m)));
        void saveCachedMessages(acctEmail, [previousSnapshot]);
        setWorkspaceError('Could not move email to Trash right now. Please try again.');
      } finally {
        setBusyActionMessageId((curr) => (curr === message.id ? null : curr));
      }
    },
    [ensureMailActionToken, showToast]
  );

  /**
   * Restores an email from Trash optimistically in UI + IndexedDB back to its original mailbox
   * and calls Gmail messages.untrash.
   */
  const handleRestoreMessage = useCallback(
    async (message: MailMessage) => {
      const acctEmail = accountRef.current?.email;
      if (!acctEmail) return;

      setWorkspaceError(null);

      let token = getGmailAccessToken(acctEmail);
      if (!token || !hasFullMailActionScopes(acctEmail)) {
        try {
          token = await ensureMailActionToken(true);
        } catch (authErr) {
          setNeedsMailActionScopeReauth(true);
          setWorkspaceError(
            authErr instanceof Error
              ? authErr.message
              : 'Re-authorize Google to restore emails from Trash.'
          );
          return;
        }
      }

      if (!token) {
        setNeedsMailActionScopeReauth(true);
        setWorkspaceError('Re-authorize Gmail to restore emails.');
        return;
      }

      const previousSnapshot = message;
      const restoredLabels = Array.from(
        new Set([...(message.labelIds || []).filter((l) => l !== 'TRASH'), 'INBOX'])
      );
      const restoredMsg: MailMessage = {
        ...message,
        labelIds: restoredLabels,
      };

      setBusyActionMessageId(message.id);
      setMessages((prev) => prev.map((m) => (m.id === message.id ? restoredMsg : m)));
      void saveCachedMessages(acctEmail, [restoredMsg]);

      try {
        const res = await fetch(`/api/gmail/messages/${encodeURIComponent(message.id)}/untrash`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          error?: string;
          labelIds?: string[];
        };

        if (!res.ok) {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? previousSnapshot : m)));
          void saveCachedMessages(acctEmail, [previousSnapshot]);

          if (res.status === 401 || data.code === 'TOKEN_EXPIRED') {
            invalidateGmailAccessToken();
            setNeedsGmailReconnect(true);
          }
          if (res.status === 403 || data.code === 'INSUFFICIENT_SCOPE') {
            setNeedsMailActionScopeReauth(true);
          }
          setWorkspaceError(
            data.error || 'Could not restore email from Trash. Click Re-authorize Gmail and retry.'
          );
          return;
        }

        if (Array.isArray(data.labelIds)) {
          const syncedRestored: MailMessage = {
            ...restoredMsg,
            labelIds: data.labelIds.filter((l) => l !== 'TRASH'),
          };
          setMessages((prev) => prev.map((m) => (m.id === message.id ? syncedRestored : m)));
          void saveCachedMessages(acctEmail, [syncedRestored]);
        }

        showToast('Restored from Trash');
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? previousSnapshot : m)));
        void saveCachedMessages(acctEmail, [previousSnapshot]);
        setWorkspaceError('Could not restore email right now. Please try again.');
      } finally {
        setBusyActionMessageId((curr) => (curr === message.id ? null : curr));
      }
    },
    [ensureMailActionToken, showToast]
  );

  /**
   * Permanently deletes a single message from Gmail (messages.delete) and IndexedDB.
   */
  const handleDeleteForeverMessage = useCallback(
    async (message: MailMessage) => {
      const acctEmail = accountRef.current?.email;
      if (!acctEmail) return;

      setWorkspaceError(null);

      let token = getGmailAccessToken(acctEmail);
      if (!token || !hasFullMailActionScopes(acctEmail)) {
        try {
          token = await ensureMailActionToken(true);
        } catch (authErr) {
          setNeedsMailActionScopeReauth(true);
          setWorkspaceError(
            authErr instanceof Error
              ? authErr.message
              : 'Re-authorize Google to permanently delete emails.'
          );
          return;
        }
      }

      if (!token) {
        setNeedsMailActionScopeReauth(true);
        setWorkspaceError('Re-authorize Gmail to delete messages permanently.');
        return;
      }

      setBusyActionMessageId(message.id);
      try {
        const res = await fetch(`/api/gmail/messages/${encodeURIComponent(message.id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          error?: string;
        };

        if (!res.ok) {
          if (res.status === 401 || data.code === 'TOKEN_EXPIRED') {
            invalidateGmailAccessToken();
            setNeedsGmailReconnect(true);
          }
          if (res.status === 403 || data.code === 'INSUFFICIENT_SCOPE') {
            setNeedsMailActionScopeReauth(true);
          }
          setWorkspaceError(
            data.error ||
              'Permanent deletion requires full Gmail permission. Click Re-authorize Gmail and try again.'
          );
          return;
        }

        setMessages((prev) => prev.filter((m) => m.id !== message.id));
        await deleteCachedMessages(acctEmail, [message.id]);
        showToast('Deleted permanently');
      } catch {
        setWorkspaceError('Could not permanently delete this email right now.');
      } finally {
        setBusyActionMessageId((curr) => (curr === message.id ? null : curr));
      }
    },
    [ensureMailActionToken, showToast]
  );

  /**
   * Permanently empties all messages currently in Trash (Gmail batchDelete + IndexedDB cleanup).
   */
  const handleEmptyTrash = useCallback(async () => {
    const acctEmail = accountRef.current?.email;
    if (!acctEmail) return;

    const trashedIds = messagesRef.current
      .filter((m) => m.labelIds?.includes('TRASH'))
      .map((m) => m.id);
    if (trashedIds.length === 0) return;

    setWorkspaceError(null);

    let token = getGmailAccessToken(acctEmail);
    if (!token || !hasFullMailActionScopes(acctEmail)) {
      try {
        token = await ensureMailActionToken(true);
      } catch (authErr) {
        setNeedsMailActionScopeReauth(true);
        setWorkspaceError(
          authErr instanceof Error ? authErr.message : 'Re-authorize Google to empty Trash.'
        );
        return;
      }
    }

    if (!token) {
      setNeedsMailActionScopeReauth(true);
      setWorkspaceError('Re-authorize Gmail to empty Trash.');
      return;
    }

    setIsEmptyingTrash(true);
    try {
      const res = await fetch('/api/gmail/trash/empty', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messageIds: trashedIds }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        error?: string;
      };

      if (!res.ok) {
        if (res.status === 401 || data.code === 'TOKEN_EXPIRED') {
          invalidateGmailAccessToken();
          setNeedsGmailReconnect(true);
        }
        if (res.status === 403 || data.code === 'INSUFFICIENT_SCOPE') {
          setNeedsMailActionScopeReauth(true);
        }
        setWorkspaceError(
          data.error ||
            'Emptying Trash requires full Gmail permission. Click Re-authorize Gmail and try again.'
        );
        return;
      }

      const idSet = new Set(trashedIds);
      setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
      await deleteCachedMessages(acctEmail, trashedIds);
      showToast('Trash emptied');
    } catch {
      setWorkspaceError('Could not empty Trash right now. Please try again.');
    } finally {
      setIsEmptyingTrash(false);
    }
  }, [ensureMailActionToken, showToast]);

  /**
   * On-demand full email body loader: fetches format=full ONLY when clicked,
   * saves the full HTML body + attachments to IndexedDB, and NEVER overwrites an already-saved category.
   */
  const handleEnsureFullMessage = useCallback(
    async (message: MailMessage) => {
      if (message.provider !== 'gmail' || message.fullBodyLoaded !== false) return;
      if (fullBodyInFlightRef.current.has(message.id)) return;

      const acctEmail = accountRef.current?.email;
      const token = getGmailAccessToken(acctEmail);
      if (!token) {
        setNeedsGmailReconnect(true);
        return;
      }

      fullBodyInFlightRef.current.add(message.id);
      setLoadingFullMessageId(message.id);

      try {
        const res = await fetch(`/api/gmail/messages/${encodeURIComponent(message.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          invalidateGmailAccessToken();
          setNeedsGmailReconnect(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          id: string;
          bodyText?: string;
          bodyHtml?: string;
          attachments?: MailAttachment[];
          fullBodyLoaded?: boolean;
        };

        const latestBase = messagesRef.current.find((m) => m.id === message.id) || message;
        const hydrated: MailMessage = {
          ...latestBase,
          bodyText: data.bodyText ?? latestBase.bodyText,
          bodyHtml: data.bodyHtml,
          attachments: data.attachments,
          fullBodyLoaded: true,
        };

        setMessages((prev) => prev.map((m) => (m.id === message.id ? hydrated : m)));

        if (acctEmail) {
          await saveCachedMessages(acctEmail, [hydrated]);
          if (!hydrated.classification?.categoryId) {
            await classifyMessages([hydrated], rulesRef.current, feedbackRef.current, {
              accountEmail: acctEmail,
              forceReclassify: false,
            });
          }
        }
      } catch {
        // Keep snippet fallback cleanly if full hydration fails transiently
      } finally {
        fullBodyInFlightRef.current.delete(message.id);
        setLoadingFullMessageId((curr) => (curr === message.id ? null : curr));
      }
    },
    [classifyMessages]
  );

  /**
   * Manual single-email Re-classify action (ONLY runs when user explicitly clicks "Re-classify").
   */
  const handleManualReclassifyMessage = useCallback(
    async (message: MailMessage) => {
      const acctEmail = accountRef.current?.email;
      if (!acctEmail) return;
      setReclassifyingMessageId(message.id);
      try {
        await classifyMessages([message], rulesRef.current, feedbackRef.current, {
          accountEmail: acctEmail,
          forceReclassify: true,
        });
      } finally {
        setReclassifyingMessageId((curr) => (curr === message.id ? null : curr));
      }
    },
    [classifyMessages]
  );

  /**
   * Manual single-email category move (persists immediately to IndexedDB messages + classifications stores).
   */
  const handleManualMoveMessage = useCallback((messageId: string, targetCategoryId: string) => {
    const manualClassification: MailClassification = {
      categoryId: targetCategoryId,
      confidence: 1.0,
      matchedBy: 'user_feedback',
      reason: 'Moved manually.',
    };

    const existing = messagesRef.current.find((m) => m.id === messageId);
    const updatedMsg = existing ? { ...existing, classification: manualClassification } : null;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, classification: manualClassification } : m))
    );

    const acctEmail = accountRef.current?.email;
    if (acctEmail) {
      if (updatedMsg) {
        void saveCachedMessages(acctEmail, [updatedMsg]);
      } else {
        void saveCachedClassifications(acctEmail, { [messageId]: manualClassification });
      }
    }
  }, []);

  const syncRef = useRef(syncInbox);
  syncRef.current = syncInbox;
  const hydrateRef = useRef(hydrateMailboxFromIndexedDb);
  hydrateRef.current = hydrateMailboxFromIndexedDb;

  // On initial mount: immediately hydrate IndexedDB cache for persisted session (0ms instant inbox)
  useEffect(() => {
    const persisted = initialSessionRef.current;
    if (!persisted?.account) return;

    void hydrateRef.current(persisted.account).then(() => {
      const validToken = getGmailAccessToken(persisted.account.email);
      if (validToken) {
        void syncRef.current(persisted.account, {
          tokenOverride: validToken,
          hydrateCacheFirst: false,
          interactiveAuth: false,
        });
      } else {
        setNeedsGmailReconnect(true);
      }
    });
  }, []);

  // Initialize Firebase Google Auth listener ONCE on mount
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
        setNeedsGmailReconnect(false);
        setNeedsMailActionScopeReauth(!hasFullMailActionScopes(nextAccount.email));
        setAuthError(null);
        if (hydratedAccountRef.current !== nextAccount.email.toLowerCase()) {
          void syncRef.current(nextAccount, {
            tokenOverride: token,
            hydrateCacheFirst: true,
            interactiveAuth: false,
          });
        }
      },
      () => {
        const persisted = loadPersistedSession(allowedDomainsRef.current);
        if (!persisted) {
          setAccount((prev) => (prev?.provider === 'gmail' ? null : prev));
        }
      },
      allowedDomainsRef.current,
      (restoredUser) => {
        const email = restoredUser.email || '';
        if (!email || !isAllowedCampusEmail(email, allowedDomainsRef.current)) {
          setAccount(null);
          return;
        }
        const restoredAccount: ConnectedAccount = {
          provider: 'gmail',
          email,
          displayName: restoredUser.displayName || email,
          photoUrl: restoredUser.photoURL || undefined,
        };
        setAccount((prev) => (prev?.email === restoredAccount.email ? prev : restoredAccount));
        setNeedsGmailReconnect(true);
        setNeedsMailActionScopeReauth(true);
        if (hydratedAccountRef.current !== email.toLowerCase()) {
          void hydrateRef.current(restoredAccount);
        }
      }
    );

    void checkGoogleRedirectResult(allowedDomainsRef.current)
      .then((result) => {
        if (!result) return;
        const connected: ConnectedAccount = {
          provider: 'gmail',
          email: result.user.email || 'campus-user',
          displayName: result.user.displayName || result.user.email || 'Campus User',
          photoUrl: result.user.photoURL || undefined,
        };
        savePersistedSession(connected, keepSignedInRef.current);
        setAccount(connected);
        setNeedsGmailReconnect(false);
        setNeedsMailActionScopeReauth(false);
        setAuthError(null);
        void syncRef.current(connected, {
          tokenOverride: result.accessToken,
          hydrateCacheFirst: true,
          interactiveAuth: false,
        });
      })
      .catch((err) => {
        setAuthError(
          err instanceof Error ? err.message : 'College Google sign-in could not be completed.'
        );
      });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async (
    forceConsent = false,
    keepSignedInChoice = true
  ): Promise<boolean> => {
    setKeepSignedIn(keepSignedInChoice);
    setIsLoggingIn(true);
    setAuthError(null);
    setWorkspaceError(null);
    try {
      const result = await googleSignIn(
        forceConsent,
        allowedDomainsRef.current,
        keepSignedInChoice,
        accountRef.current?.email
      );
      if (!result) return false;

      const connected: ConnectedAccount = {
        provider: 'gmail',
        email: result.user.email || 'campus-user',
        displayName: result.user.displayName || result.user.email || 'Campus User',
        photoUrl: result.user.photoURL || undefined,
      };
      setAccount(connected);
      setNeedsGmailReconnect(false);
      setNeedsMailActionScopeReauth(false);
      await syncInbox(connected, {
        tokenOverride: result.accessToken,
        hydrateCacheFirst: true,
        interactiveAuth: true,
      });
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'College Google sign-in was cancelled or failed.';
      if (accountRef.current) {
        setWorkspaceError(message);
      } else {
        setAuthError(message);
      }
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleReconnectGmail = async () => {
    const active = accountRef.current;
    if (!active) return;
    await syncInbox(active, {
      hydrateCacheFirst: false,
      interactiveAuth: true,
    });
  };

  const handleSignOut = async () => {
    syncRunIdRef.current += 1;
    nextPageTokenRef.current = null;
    totalEstimateRef.current = null;
    latestTimestampRef.current = null;
    hydratedAccountRef.current = null;
    if (account?.provider === 'gmail') {
      await googleLogout();
    }
    setAccount(null);
    setNeedsGmailReconnect(false);
    setNeedsMailActionScopeReauth(false);
    setMessages([]);
    setWorkspaceError(null);
    setStatusMessage(null);
    setToastMessage(null);
    setSyncProgress({
      isRunning: false,
      fetchedCount: 0,
      classifiedCount: 0,
      totalEstimate: null,
      hasMore: false,
      phaseLabel: '',
    });
  };

  const handleToggleReadState = useCallback((messageId: string, unread: boolean) => {
    const existing = messagesRef.current.find((m) => m.id === messageId);
    const updatedMsg = existing ? { ...existing, unread } : null;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, unread } : m)));
    const acctEmail = accountRef.current?.email;
    if (acctEmail && updatedMsg) {
      void saveCachedMessages(acctEmail, [updatedMsg]);
    }
  }, []);

  const handleDownloadAttachment = useCallback(
    async (message: MailMessage, attachment: MailAttachment) => {
      if (attachment.inlineDataBase64) {
        const binary = atob(attachment.inlineDataBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], {
          type: attachment.mimeType || 'application/octet-stream',
        });
        triggerBlobDownload(blob, attachment.filename);
        return;
      }

      if (message.provider === 'gmail') {
        const acctEmail = accountRef.current?.email;
        let token = getGmailAccessToken(acctEmail);
        if (!token) {
          const refreshed = await googleSignIn(
            false,
            allowedDomainsRef.current,
            keepSignedInRef.current,
            acctEmail
          );
          token = refreshed?.accessToken || getGmailAccessToken(acctEmail);
          if (token) setNeedsGmailReconnect(false);
        }
        if (!token) {
          setNeedsGmailReconnect(true);
          throw new Error('Reconnect Gmail to download this attachment.');
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

        if (res.status === 401) {
          invalidateGmailAccessToken();
          setNeedsGmailReconnect(true);
          throw new Error('Gmail token expired — click Reconnect Gmail to download.');
        }

        if (!res.ok) {
          let errMsg = 'Failed to download attachment.';
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

  if (!account) {
    return (
      <AuthLanding
        isLoggingIn={isLoggingIn}
        authError={authError}
        onGoogleLogin={(forceConsent, keepChoice) => {
          void handleGoogleLogin(forceConsent, keepChoice);
        }}
      />
    );
  }

  return (
    <MailWorkspace
      account={account}
      messages={messages}
      rules={rules}
      isFetchingMail={isFetchingMail}
      isLoadingOlder={isLoadingOlder}
      isClassifying={isClassifying}
      syncProgress={syncProgress}
      loadingFullMessageId={loadingFullMessageId}
      reclassifyingMessageId={reclassifyingMessageId}
      busyActionMessageId={busyActionMessageId}
      isEmptyingTrash={isEmptyingTrash}
      needsGmailReconnect={needsGmailReconnect}
      needsMailActionScopeReauth={needsMailActionScopeReauth}
      statusMessage={statusMessage}
      errorMessage={workspaceError}
      toastMessage={toastMessage}
      onDismissToast={() => setToastMessage(null)}
      onSyncInbox={() => syncInbox(account, { interactiveAuth: true })}
      onStopSync={handleStopSync}
      onLoadOlderMail={() => syncInbox(account, { loadOlderOnly: true, interactiveAuth: true })}
      onReconnectGmail={handleReconnectGmail}
      onReauthorizeGmail={() => handleGoogleLogin(true, keepSignedIn)}
      onSignOut={handleSignOut}
      onToggleReadState={handleToggleReadState}
      onDownloadAttachment={handleDownloadAttachment}
      onEnsureFullMessage={handleEnsureFullMessage}
      onManualReclassifyMessage={handleManualReclassifyMessage}
      onManualMoveMessage={handleManualMoveMessage}
      onSendEmail={handleSendEmail}
      onTrashMessage={handleTrashMessage}
      onRestoreMessage={handleRestoreMessage}
      onDeleteForeverMessage={handleDeleteForeverMessage}
      onEmptyTrash={handleEmptyTrash}
    />
  );
}
