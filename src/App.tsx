import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthLanding } from './components/AuthLanding';
import { MailWorkspace } from './components/MailWorkspace';
import {
  checkGoogleRedirectResult,
  getGmailAccessToken,
  googleLogout,
  googleSignIn,
  initGoogleAuth,
} from './lib/firebaseAuth';
import {
  loadCachedMailbox,
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
 * and keeps the newest message per thread sorted newest-first.
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
        classification: msg.classification || existing.classification,
      });
    }
  }

  // Deduplicate by threadId so repeated thread messages do not appear twice in a row
  const byThread = new Map<string, MailMessage>();
  for (const msg of byId.values()) {
    const threadKey = msg.threadId ? `thread:${msg.threadId}` : `id:${msg.id}`;
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
    });
  }

  return Array.from(byThread.values()).sort((a, b) => {
    const timeA = Date.parse(a.dateIso) || 0;
    const timeB = Date.parse(b.dateIso) || 0;
    return timeB - timeA;
  });
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
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
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
  const [loadingFullMessageId, setLoadingFullMessageId] = useState<string | null>(null);

  const [syncProgress, setSyncProgress] = useState<SyncProgressState>({
    isRunning: false,
    fetchedCount: 0,
    classifiedCount: 0,
    totalEstimate: null,
    hasMore: false,
    phaseLabel: '',
  });

  const syncRunIdRef = useRef(0);
  const nextPageTokenRef = useRef<string | null>(null);
  const totalEstimateRef = useRef<number | null>(null);
  const fullBodyInFlightRef = useRef<Set<string>>(new Set());

  const accountRef = useRef<ConnectedAccount | null>(account);
  accountRef.current = account;
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
   * Classifies messages in 0ms deterministically + calls campus-authenticated Gemini batcher
   * for ambiguous emails, then persists updated categories directly to IndexedDB.
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
      }
    ): Promise<Record<string, MailClassification>> => {
      if (targetMessages.length === 0) return {};

      const allResults: Record<string, MailClassification> = {};
      const unmatchedMessages: MailMessage[] = [];

      // Step 1: Instant 0ms strict deterministic + popular-website fast-path
      for (const msg of targetMessages) {
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

        // Build persisted snapshot synchronously (never rely on React's deferred setState updater to populate an array)
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

        const acctEmail = options?.accountEmail || accountRef.current?.email;
        if (acctEmail && updatedForCache.length > 0) {
          void saveCachedMessages(acctEmail, updatedForCache);
        }
      };

      applyAndPersist(allResults, targetMessages);

      if (unmatchedMessages.length === 0) return allResults;

      // Step 2: Send remaining ambiguous emails in chunks to server AI classifier (with zero-cost local fallback)
      setIsClassifying(true);
      try {
        const gmailToken = options?.tokenOverride || getGmailAccessToken();
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

      return allResults;
    },
    []
  );

  /**
   * Calls POST /api/gmail/sync with automatic exponential backoff (2s, 4s, 8s) on 403/429 rate limits,
   * displaying a friendly status notice instead of raw Gmail API project numbers.
   */
  const requestGmailSyncPageWithBackoff = useCallback(
    async (
      accessToken: string,
      payload: {
        maxResults: number;
        pageToken?: string;
        excludeIds: string[];
      },
      runId: number
    ): Promise<{
      messages: MailMessage[];
      nextPageToken: string | null;
      resultSizeEstimate: number;
      skippedCachedCount: number;
      allPageCached: boolean;
      rateLimited: boolean;
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
          res.status === 429 || data.code === 'GMAIL_RATE_LIMITED' || Boolean(data.rateLimited && !res.ok);

        if (isRateLimited) {
          setStatusMessage(RATE_LIMIT_FRIENDLY_MESSAGE);
          if (attempt < CLIENT_BACKOFF_DELAYS_MS.length) {
            await sleep(CLIENT_BACKOFF_DELAYS_MS[attempt]);
            attempt += 1;
            continue;
          }
          // Stop gracefully without showing raw errors; user can continue syncing shortly
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
   * Incremental Sync Inbox:
   * 1. Immediately displays cached emails from IndexedDB (0ms load) and re-runs strict rules on cached emails.
   * 2. Fetches ONLY uncached new emails from Gmail in metadata-first mode (skipping cached IDs).
   * 3. Automatically classifies new emails and persists everything to IndexedDB.
   */
  const syncInbox = useCallback(
    async (
      connected: ConnectedAccount,
      options?: {
        tokenOverride?: string;
        loadOlderOnly?: boolean;
        hydrateCacheFirst?: boolean;
      }
    ): Promise<boolean> => {
      const runId = ++syncRunIdRef.current;
      const isLoadOlder = Boolean(options?.loadOlderOnly);

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
        let currentMessages = messagesRef.current;
        let cachedIds = new Set<string>(currentMessages.map((m) => m.id));

        // Instant IndexedDB load + automatic strict re-classification of existing cached emails
        if (options?.hydrateCacheFirst || (!isLoadOlder && currentMessages.length === 0)) {
          const { messages: cachedList, meta } = await loadCachedMailbox(connected.email);
          if (syncRunIdRef.current !== runId) return false;

          if (cachedList.length > 0) {
            const dedupedCached = deduplicateAndSortMessages(cachedList);
            currentMessages = dedupedCached;
            cachedIds = new Set(dedupedCached.map((m) => m.id));
            setMessages(dedupedCached);

            if (meta?.nextPageToken && !nextPageTokenRef.current) {
              nextPageTokenRef.current = meta.nextPageToken;
            }
            if (meta?.totalEstimate && !totalEstimateRef.current) {
              totalEstimateRef.current = meta.totalEstimate;
            }

            setSyncProgress({
              isRunning: true,
              fetchedCount: dedupedCached.length,
              classifiedCount: dedupedCached.filter((m) => Boolean(m.classification)).length,
              totalEstimate: totalEstimateRef.current,
              hasMore: Boolean(nextPageTokenRef.current),
              phaseLabel: 'Checking for new emails',
            });

            // Re-run updated strict categorization rules on all cached emails immediately
            const needsRuleUpgrade = meta?.rulesVersion !== CURRENT_RULES_VERSION;
            const emailsToReclassify = needsRuleUpgrade
              ? dedupedCached
              : dedupedCached.filter((m) => !m.classification);

            if (emailsToReclassify.length > 0) {
              await classifyMessages(emailsToReclassify, activeRules, activeFeedback, {
                runId,
                accountEmail: connected.email,
                tokenOverride: options?.tokenOverride,
              });
              await saveCachedMeta({
                accountEmail: connected.email,
                nextPageToken: nextPageTokenRef.current,
                totalEstimate: totalEstimateRef.current,
                rulesVersion: CURRENT_RULES_VERSION,
                lastSyncedAt: Date.now(),
              });
            }
          }
        }

        let accessToken = options?.tokenOverride || getGmailAccessToken();
        if (!accessToken) {
          // User clicked Sync Inbox / Load Older Mail after a page reload from IndexedDB cache:
          // refresh the in-memory Gmail OAuth token cleanly via Google popup
          try {
            const refreshed = await googleSignIn(false, allowedDomainsRef.current);
            accessToken = refreshed?.accessToken || getGmailAccessToken();
          } catch (authErr) {
            throw new Error(
              authErr instanceof Error
                ? authErr.message
                : 'Sign in with your RVCE Google account to sync new emails.'
            );
          }
        }
        if (!accessToken) {
          throw new Error('Your Gmail session expired. Click Re-authorize Gmail to reconnect.');
        }

        if (isLoadOlder) {
          // Fetch the next older page using saved pagination token
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
            setMessages(merged);
            await saveCachedMessages(connected.email, freshMessages);
            await classifyMessages(freshMessages, activeRules, activeFeedback, {
              runId,
              accountEmail: connected.email,
              tokenOverride: accessToken,
            });
          }

          await saveCachedMeta({
            accountEmail: connected.email,
            nextPageToken: nextPageTokenRef.current,
            totalEstimate: totalEstimateRef.current,
            rulesVersion: CURRENT_RULES_VERSION,
            lastSyncedAt: Date.now(),
          });

          setSyncProgress({
            isRunning: false,
            fetchedCount: messagesRef.current.length,
            classifiedCount: messagesRef.current.filter((m) => Boolean(m.classification)).length,
            totalEstimate: totalEstimateRef.current,
            hasMore: Boolean(nextPageTokenRef.current),
            phaseLabel: '',
          });

          return true;
        }

        // Incremental Sync Inbox: walk from newest page until we hit already-cached pages (or 2 initial pages on first-ever load)
        const isInitialEmptySync = cachedIds.size === 0;
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
            },
            runId
          );

          if (syncRunIdRef.current !== runId) return false;

          pagesFetched += 1;

          if (page.resultSizeEstimate > 0) {
            totalEstimateRef.current = Math.max(
              totalEstimateRef.current || 0,
              page.resultSizeEstimate
            );
          }

          // Preserve oldest pagination cursor so "Load Older Mail" continues seamlessly from where cache ends
          if (isInitialEmptySync || !nextPageTokenRef.current) {
            nextPageTokenRef.current = page.nextPageToken;
          }

          const freshMessages = page.messages.filter((m) => !cachedIds.has(m.id));
          for (const m of freshMessages) cachedIds.add(m.id);

          if (freshMessages.length > 0) {
            const merged = deduplicateAndSortMessages([...freshMessages, ...messagesRef.current]);
            setMessages(merged);
            await saveCachedMessages(connected.email, freshMessages);
            await classifyMessages(freshMessages, activeRules, activeFeedback, {
              runId,
              accountEmail: connected.email,
              tokenOverride: accessToken,
            });
          }

          if (page.rateLimited) {
            break;
          }

          // Stop incremental sync as soon as we reach already-cached mail
          if (page.allPageCached || (!isInitialEmptySync && page.skippedCachedCount > 0)) {
            break;
          }

          if (!page.nextPageToken) {
            nextPageTokenRef.current = null;
            break;
          }

          pageToken = page.nextPageToken;
        }

        // Also ensure every currently loaded email obeys the latest strict rules
        const latestMsgs = messagesRef.current;
        if (latestMsgs.length > 0 && syncRunIdRef.current === runId) {
          await classifyMessages(latestMsgs, activeRules, activeFeedback, {
            runId,
            accountEmail: connected.email,
            tokenOverride: accessToken,
          });
        }

        await saveCachedMeta({
          accountEmail: connected.email,
          nextPageToken: nextPageTokenRef.current,
          totalEstimate: totalEstimateRef.current,
          rulesVersion: CURRENT_RULES_VERSION,
          lastSyncedAt: Date.now(),
        });

        setSyncProgress({
          isRunning: false,
          fetchedCount: messagesRef.current.length,
          classifiedCount: messagesRef.current.filter((m) => Boolean(m.classification)).length,
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
    [classifyMessages, requestGmailSyncPageWithBackoff]
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
   * On-demand full email body loader: fetches format=full ONLY when the user clicks an email,
   * re-runs strict classification if body reveals a Club/Survey/Volunteering/Academic signal,
   * and saves the full HTML body + attachments to IndexedDB so future opens are instant.
   */
  const handleEnsureFullMessage = useCallback(async (message: MailMessage) => {
    if (message.provider !== 'gmail' || message.fullBodyLoaded !== false) return;
    if (fullBodyInFlightRef.current.has(message.id)) return;

    const token = getGmailAccessToken();
    if (!token) {
      setStatusMessage('Showing cached inbox — click Sync Inbox to load full email content and new mail.');
      return;
    }

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

      const latestBase = messagesRef.current.find((m) => m.id === message.id) || message;
      const hydrated: MailMessage = {
        ...latestBase,
        bodyText: data.bodyText ?? latestBase.bodyText,
        bodyHtml: data.bodyHtml,
        attachments: data.attachments,
        fullBodyLoaded: true,
      };

      // Re-evaluate strict single-category rules now that the full body text is available
      const directMatch = matchMessageDeterministically(hydrated, rulesRef.current);
      if (directMatch) {
        hydrated.classification = {
          categoryId: directMatch.categoryId,
          confidence: 1.0,
          matchedBy: 'directory',
          reason: directMatch.rule
            ? `Matched ${directMatch.rule.shortName} (${directMatch.matchedEntry}).`
            : `Routed to General Inbox (${directMatch.matchedEntry}).`,
        };
      }

      setMessages((prev) => prev.map((m) => (m.id === message.id ? hydrated : m)));

      const acctEmail = accountRef.current?.email;
      if (acctEmail) {
        await saveCachedMessages(acctEmail, [hydrated]);
      }
    } catch {
      // Keep snippet fallback cleanly if full hydration fails transiently
    } finally {
      fullBodyInFlightRef.current.delete(message.id);
      setLoadingFullMessageId((curr) => (curr === message.id ? null : curr));
    }
  }, []);

  const syncRef = useRef(syncInbox);
  syncRef.current = syncInbox;

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
        setAuthError(null);
        void syncRef.current(nextAccount, {
          tokenOverride: token,
          hydrateCacheFirst: true,
        });
      },
      () => {
        setAccount((prev) => (prev?.provider === 'gmail' ? null : prev));
      },
      allowedDomainsRef.current,
      (restoredUser) => {
        // Instant page-load opening from IndexedDB for an already signed-in campus user
        const email = restoredUser.email || '';
        if (!email || !isAllowedCampusEmail(email, allowedDomainsRef.current)) {
          setAccount(null);
          return;
        }
        void loadCachedMailbox(email).then(async ({ messages: cachedList, meta }) => {
          if (cachedList.length === 0) {
            // No cached mail yet — keep user on AuthLanding to authorize Gmail once
            setAccount(null);
            return;
          }

          const restoredAccount: ConnectedAccount = {
            provider: 'gmail',
            email,
            displayName: restoredUser.displayName || email,
            photoUrl: restoredUser.photoURL || undefined,
          };
          const deduped = deduplicateAndSortMessages(cachedList);
          messagesRef.current = deduped;
          if (meta?.nextPageToken) nextPageTokenRef.current = meta.nextPageToken;
          if (meta?.totalEstimate) totalEstimateRef.current = meta.totalEstimate;

          setAccount(restoredAccount);
          setMessages(deduped);
          setSyncProgress({
            isRunning: false,
            fetchedCount: deduped.length,
            classifiedCount: deduped.filter((m) => Boolean(m.classification)).length,
            totalEstimate: meta?.totalEstimate ?? null,
            hasMore: Boolean(meta?.nextPageToken),
            phaseLabel: '',
          });

          // Immediately re-run updated strict rules on cached emails if rules upgraded
          if (meta?.rulesVersion !== CURRENT_RULES_VERSION) {
            await classifyMessages(deduped, rulesRef.current, feedbackRef.current, {
              accountEmail: email,
            });
            await saveCachedMeta({
              accountEmail: email,
              nextPageToken: meta?.nextPageToken ?? null,
              totalEstimate: meta?.totalEstimate ?? null,
              rulesVersion: CURRENT_RULES_VERSION,
              lastSyncedAt: meta?.lastSyncedAt ?? Date.now(),
            });
          }
        });
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
        setAccount(connected);
        setAuthError(null);
        void syncRef.current(connected, {
          tokenOverride: result.accessToken,
          hydrateCacheFirst: true,
        });
      })
      .catch((err) => {
        setAuthError(
          err instanceof Error ? err.message : 'College Google sign-in could not be completed.'
        );
      });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async (forceConsent = false) => {
    setIsLoggingIn(true);
    setAuthError(null);
    setWorkspaceError(null);
    try {
      const result = await googleSignIn(forceConsent, allowedDomainsRef.current);
      if (!result) return;

      const connected: ConnectedAccount = {
        provider: 'gmail',
        email: result.user.email || 'campus-user',
        displayName: result.user.displayName || result.user.email || 'Campus User',
        photoUrl: result.user.photoURL || undefined,
      };
      setAccount(connected);
      await syncInbox(connected, {
        tokenOverride: result.accessToken,
        hydrateCacheFirst: true,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'College Google sign-in was cancelled or failed.';
      setAuthError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    syncRunIdRef.current += 1;
    nextPageTokenRef.current = null;
    totalEstimateRef.current = null;
    if (account?.provider === 'gmail') {
      await googleLogout();
    }
    setAccount(null);
    setMessages([]);
    setWorkspaceError(null);
    setStatusMessage(null);
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
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, unread } : m))
    );
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
        const token = getGmailAccessToken();
        if (!token) {
          throw new Error('Your Gmail session expired. Click Re-authorize Gmail to download attachments.');
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
      isLoadingOlder={isLoadingOlder}
      isClassifying={isClassifying}
      syncProgress={syncProgress}
      loadingFullMessageId={loadingFullMessageId}
      statusMessage={statusMessage}
      errorMessage={workspaceError}
      onSyncInbox={() => syncInbox(account)}
      onStopSync={handleStopSync}
      onLoadOlderMail={() => syncInbox(account, { loadOlderOnly: true })}
      onReauthorizeGmail={() => handleGoogleLogin(true)}
      onSignOut={handleSignOut}
      onToggleReadState={handleToggleReadState}
      onDownloadAttachment={handleDownloadAttachment}
      onEnsureFullMessage={handleEnsureFullMessage}
    />
  );
}
