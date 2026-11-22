import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import {
  PRIMARY_CAMPUS_DOMAIN,
  buildCampusRestrictionError,
  isAllowedCampusEmail,
  parseAllowedDomains,
} from './src/shared/campusPolicy.ts';
import {
  DEFAULT_CLASSIFICATION_RULES,
  canFastPathOfficialWebsiteToGeneral,
  classifyMessageLocallyFallback,
  decodeHtmlEntities,
  extractDisplayName,
  extractEmailAddress,
  hasClubSignal,
  hasExperientialLearningSignal,
  hasSportsCulturalFestSignal,
  isOfficialPopularWebsiteEmail,
  matchMessageDeterministically,
  parseTrainingOrderLocallyFallback,
} from './src/shared/classifierRules.ts';
import type {
  ClassificationRule,
  MailAttachment,
  MailClassification,
  MailMessage,
  TrainingFeedbackExample,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_CAMPUS_DOMAINS = parseAllowedDomains(process.env.CAMPUS_ALLOWED_DOMAINS);
const PRIMARY_DOMAIN = ALLOWED_CAMPUS_DOMAINS[0] || PRIMARY_CAMPUS_DOMAIN;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isBlockedImapHost(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::'
  ) {
    return true;
  }
  // Block loopback, private RFC1918, link-local / cloud metadata IPv4 addresses
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^0\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^(fc|fd|fe80)/i.test(host)) return true;
  return false;
}

// Short-lived hashed-token -> verified campus email cache (never stores raw OAuth tokens)
const verifiedGmailProfileCache = new Map<string, { email: string; expiresAt: number }>();
const MAX_PROFILE_CACHE = 2000;
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

const RATE_LIMIT_FRIENDLY_MESSAGE =
  'Sync paused briefly due to Gmail rate limits — retrying automatically.';
const GMAIL_BACKOFF_DELAYS_MS = [2000, 4000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGmailErrorMeta(rawBody: string): { reason: string; message: string; combined: string } {
  let message = '';
  let reason = '';
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string; message?: string }>;
      };
    };
    message = parsed.error?.message || '';
    reason = parsed.error?.errors?.[0]?.reason || parsed.error?.status || '';
  } catch {
    message = rawBody.slice(0, 220);
  }
  return { reason, message, combined: `${reason} ${message}`.toLowerCase() };
}

function isGmailRateOrQuotaError(status: number, rawBody: string): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  const { combined } = parseGmailErrorMeta(rawBody);
  return (
    combined.includes('ratelimit') ||
    combined.includes('rate limit') ||
    combined.includes('quota') ||
    combined.includes('userratelimitexceeded') ||
    combined.includes('dailylimitexceeded') ||
    combined.includes('too many')
  );
}

function sanitizeGmailApiError(
  status: number,
  rawBody: string
): { status: number; code: string; error: string } {
  const { combined } = parseGmailErrorMeta(rawBody);

  if (status === 401) {
    return {
      status: 401,
      code: 'TOKEN_EXPIRED',
      error: 'Your college Gmail session expired. Click Re-authorize Gmail to reconnect.',
    };
  }

  if (isGmailRateOrQuotaError(status, rawBody)) {
    return {
      status: 429,
      code: 'GMAIL_RATE_LIMITED',
      error: RATE_LIMIT_FRIENDLY_MESSAGE,
    };
  }

  if (status === 403 && (combined.includes('insufficient') || combined.includes('scope'))) {
    return {
      status: 403,
      code: 'INSUFFICIENT_SCOPE',
      error:
        'Gmail read permission was not granted during Google sign-in. Click Re-authorize Gmail and allow Gmail access.',
    };
  }

  if (status === 403 && (combined.includes('disabled') || combined.includes('not been used'))) {
    return {
      status: 403,
      code: 'GMAIL_API_DISABLED',
      error: 'Gmail API access is temporarily unavailable. Please try again shortly.',
    };
  }

  return {
    status: status >= 400 ? status : 500,
    code: 'GMAIL_API_ERROR',
    error: 'Unable to reach Gmail right now. Please try syncing again in a moment.',
  };
}

/**
 * Fetches a Gmail API URL with automatic exponential backoff (2s, 4s, 8s) on 403 rate/quota
 * and 429 errors.
 */
async function fetchGmailWithBackoff(
  url: string,
  authHeader: string
): Promise<{ response: Response; bodyText: string; rateLimited: boolean }> {
  let attempt = 0;
  let sawRateLimit = false;

  while (true) {
    const response = await fetch(url, { headers: { Authorization: authHeader } });
    if (response.ok) {
      const bodyText = await response.text();
      return { response, bodyText, rateLimited: sawRateLimit };
    }

    const errBody = await response.text();
    const isRetryableRate = isGmailRateOrQuotaError(response.status, errBody);
    const isTransientServer = response.status === 503 || response.status === 500;

    if ((isRetryableRate || isTransientServer) && attempt < GMAIL_BACKOFF_DELAYS_MS.length) {
      if (isRetryableRate) sawRateLimit = true;
      await sleep(GMAIL_BACKOFF_DELAYS_MS[attempt]);
      attempt += 1;
      continue;
    }

    return { response, bodyText: errBody, rateLimited: sawRateLimit || isRetryableRate };
  }
}

async function verifyCampusGmailToken(
  authHeader: string
): Promise<
  | { ok: true; email: string }
  | { ok: false; status: number; code: string; error: string }
> {
  const tokenHash = crypto.createHash('sha256').update(authHeader).digest('hex');
  const now = Date.now();
  const cached = verifiedGmailProfileCache.get(tokenHash);
  if (cached && cached.expiresAt > now) {
    if (!isAllowedCampusEmail(cached.email, ALLOWED_CAMPUS_DOMAINS)) {
      return {
        ok: false,
        status: 403,
        code: 'CAMPUS_DOMAIN_REQUIRED',
        error: buildCampusRestrictionError(cached.email, ALLOWED_CAMPUS_DOMAINS),
      };
    }
    return { ok: true, email: cached.email };
  }

  const profileAttempt = await fetchGmailWithBackoff(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    authHeader
  );

  if (!profileAttempt.response.ok) {
    const friendly = sanitizeGmailApiError(profileAttempt.response.status, profileAttempt.bodyText);
    return {
      ok: false,
      status: friendly.status,
      code: friendly.code,
      error: friendly.error,
    };
  }

  const profileData = JSON.parse(profileAttempt.bodyText) as { emailAddress?: string };
  const verifiedEmail = (profileData.emailAddress || '').trim().toLowerCase();

  if (!isAllowedCampusEmail(verifiedEmail, ALLOWED_CAMPUS_DOMAINS)) {
    return {
      ok: false,
      status: 403,
      code: 'CAMPUS_DOMAIN_REQUIRED',
      error: buildCampusRestrictionError(verifiedEmail, ALLOWED_CAMPUS_DOMAINS),
    };
  }

  if (verifiedGmailProfileCache.size >= MAX_PROFILE_CACHE) {
    const oldestKey = verifiedGmailProfileCache.keys().next().value;
    if (oldestKey) verifiedGmailProfileCache.delete(oldestKey);
  }
  verifiedGmailProfileCache.set(tokenHash, {
    email: verifiedEmail,
    expiresAt: now + PROFILE_CACHE_TTL_MS,
  });

  return { ok: true, email: verifiedEmail };
}

function hasGeminiApiKey(): boolean {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

function getAiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_UNCONFIGURED');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getAppBaseUrl(req?: express.Request): string {
  const raw = process.env.APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  if (raw && raw !== 'MY_APP_URL') {
    return raw.replace(/\/+$/, '');
  }
  const host = req?.get('host');
  if (host) {
    const proto = req?.protocol || 'https';
    return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return `http://localhost:${PORT}`;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf-8');
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function sanitizeEmailHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript):[\s\S]*?\2/gi, '$1="#"')
    .trim();
}

function decodeBase64UrlToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

interface GmailPayloadPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPayloadPart[];
}

function extractRichContentFromGmailPayload(payload?: GmailPayloadPart): {
  bodyText: string;
  bodyHtml: string;
  attachments: MailAttachment[];
} {
  const plainParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: MailAttachment[] = [];

  const walk = (part?: GmailPayloadPart) => {
    if (!part) return;
    const mime = (part.mimeType || '').toLowerCase();
    const filename = (part.filename || '').trim();
    const headers = part.headers ?? [];
    const contentIdHeader = headers
      .find((h) => h.name.toLowerCase() === 'content-id')
      ?.value?.replace(/^<|>$/g, '')
      .trim();

    if (filename && (part.body?.attachmentId || part.body?.data)) {
      attachments.push({
        id: part.body.attachmentId || `inline-${part.partId || attachments.length}`,
        filename,
        mimeType: mime || 'application/octet-stream',
        sizeBytes: Number(part.body.size) || 0,
        contentId: contentIdHeader || undefined,
        inlineDataBase64:
          !part.body.attachmentId && part.body.data
            ? decodeBase64UrlToBuffer(part.body.data).toString('base64')
            : undefined,
      });
    } else if (mime === 'text/plain' && part.body?.data) {
      const decoded = decodeBase64Url(part.body.data).trim();
      if (decoded) plainParts.push(decoded);
    } else if (mime === 'text/html' && part.body?.data) {
      const decoded = decodeBase64Url(part.body.data).trim();
      if (decoded) htmlParts.push(decoded);
    }

    if (part.parts && part.parts.length > 0) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  };

  walk(payload);

  const rawHtml = htmlParts.join('\n').trim();
  const bodyHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : '';
  let bodyText = plainParts.join('\n\n').trim();

  if (!bodyText && rawHtml) {
    bodyText = stripHtmlToText(rawHtml);
  }
  if (!bodyText && payload?.body?.data) {
    bodyText = decodeBase64Url(payload.body.data).trim();
  }

  return { bodyText, bodyHtml, attachments };
}

function resolveInlineCidImages(html: string, attachments: MailAttachment[]): string {
  if (!html || attachments.length === 0) return html;
  let updated = html;
  for (const att of attachments) {
    if (att.contentId && att.inlineDataBase64 && att.mimeType.startsWith('image/')) {
      const escapedCid = att.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dataUrl = `data:${att.mimeType};base64,${att.inlineDataBase64}`;
      updated = updated.replace(new RegExp(`cid:${escapedCid}`, 'gi'), dataUrl);
    }
  }
  return updated;
}

async function classifyBatchWithGemini(
  emails: Array<{
    id: string;
    fromName: string;
    fromEmail: string;
    subject: string;
    snippet: string;
    bodyExcerpt: string;
    labels?: string[];
  }>,
  rules: ClassificationRule[],
  feedbackExamples: TrainingFeedbackExample[]
): Promise<Record<string, MailClassification>> {
  if (emails.length === 0) return {};

  const ai = getAiClient();
  const semanticRules = rules.filter((r) => r.useAiSemantics);
  const validCategoryIds = [...rules.map((r) => r.id), 'general'];

  const rulesContext = rules
    .map((rule) => {
      const kwText = rule.keywords.length > 0 ? rule.keywords.join(', ') : 'None';
      const semanticNote = rule.useAiSemantics
        ? 'ACTIVE SEMANTIC CLASSIFICATION: Analyze subject, body, tone, and intent to route matching messages here even if sender is unknown.'
        : 'PRIMARY SENDER DIRECTORY RULE: Only route here via AI if the message clearly originates from the institution/course platform or matches user-trained feedback examples.';
      return [
        `- Category ID: "${rule.id}" (${rule.name})`,
        `  Description: ${rule.description}`,
        `  Keywords / Signals: ${kwText}`,
        `  Policy: ${semanticNote}`,
      ].join('\n');
    })
    .join('\n\n');

  const feedbackContext =
    feedbackExamples.length > 0
      ? `\nUser-Corrected Training Examples (follow these patterns closely):\n${feedbackExamples
          .slice(-20)
          .map(
            (ex) =>
              `- From: ${ex.fromEmail} | Subject: "${ex.subject}" | Snippet: "${ex.snippet}" => Category ID: "${ex.assignedCategoryId}"`
          )
          .join('\n')}`
      : '';

  const systemInstruction = `Classify each email into EXACTLY ONE category from ${JSON.stringify(validCategoryIds)}.
Rules:
${rulesContext}
- "general": Personal sent emails, Google security alerts, official emails from popular legitimate websites (GitHub, LinkedIn, Google, Amazon, Flipkart, Swiggy, Zomato, Netflix, Spotify, Coursera, LeetCode, banks, etc.), AND ALL sports emails (trials, physical education, runs), cultural emails (CARV, EVOKE, auditions, music, dance, fashion), and college/departmental fests (REACT, Synergy, Aeromania, Ignitron).
STRICT PRIORITY RULES:
1. CLUBS OVERRIDE (HIGHEST PRIORITY OVER ACADEMIC): If the word "club" (case-insensitive) appears anywhere in the subject, sender name, or body—or if it is about club recruitments, club sessions, or club events—classify it EXCLUSIVELY as "clubs", even if sent or forwarded by a lecturer, professor, HOD, Librarian, or Dean.
2. SURVEYS: Any email containing surveys, questionnaires, feedback forms, or polls MUST go to "surveys" and NEVER "academic".
3. VOLUNTEERING: NSS, NCC, blood donation, cleanliness/plantation drives, NGO/social outreach, community service, charity camps -> "volunteering".
4. SPORTS, CULTURAL & FESTS -> "general" (NEVER "academic"): sports trials, physical education, runs, CARV/EVOKE auditions, music, dance, fashion, REACT, Synergy, Aeromania, Ignitron, departmental/college fests.
5. PROMOTIONS & SPAM -> "spam": Promotional/marketing blasts (Lenovo, Unlox, Corizo), fake/paid internships, fake rewards/lotteries, unauthorized scholarships, phishing/scams, or Gmail-flagged SPAM.
6. STRICT ACADEMIC -> "academic": Reserve ONLY for coursework, Experiential Learning (ANY email mentioning "Experiential Learning", "EL", "EL phase", "EL evaluation", "EL team", "EL project", or "EL review" MUST be strictly categorized under "academic", NEVER "general"), CIE/SEE exams, seating arrangements, syllabus, Google Classroom updates, MATLAB Grader, and official academic circulars. NEVER classify an email as "academic" just because it is from @rvce.edu.in.
Match sender identity ONLY from the From: address (never To:).${feedbackContext}
Return valid categoryId from ${JSON.stringify(validCategoryIds)}, confidence (0-1), and a crisp reason (<=12 words).`;

  const promptPayload = emails.map((m) => ({
    id: m.id,
    from: m.fromEmail,
    subject: decodeHtmlEntities(m.subject),
    text: decodeHtmlEntities(m.snippet || m.bodyExcerpt).slice(0, 260),
    ...(m.labels && m.labels.length > 0 ? { labels: m.labels } : {}),
  }));

  const callModel = async (model: 'gemini-3.1-flash-lite' | 'gemini-4-hydrogen') =>
    ai.models.generateContent({
      model,
      contents: JSON.stringify(promptPayload),
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel:
            model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            classifications: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  categoryId: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  reason: { type: Type.STRING },
                },
                required: ['id', 'categoryId', 'confidence', 'reason'],
              },
            },
          },
          required: ['classifications'],
        },
      },
    });

  let response;
  try {
    response = await callModel('gemini-3.1-flash-lite');
  } catch (primaryErr) {
    const errText = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    if (errText.includes('503') || errText.includes('UNAVAILABLE') || errText.includes('429')) {
      response = await callModel('gemini-4-hydrogen');
    } else {
      throw primaryErr;
    }
  }

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty classification payload.');
  }

  const parsed = JSON.parse(rawText) as {
    classifications?: Array<{
      id: string;
      categoryId: string;
      confidence: number;
      reason: string;
    }>;
  };

  const results: Record<string, MailClassification> = {};
  const allowedSet = new Set(validCategoryIds);
  const emailById = new Map(emails.map((e) => [e.id, e]));

  for (const item of parsed.classifications ?? []) {
    let safeCategory = allowedSet.has(item.categoryId) ? item.categoryId : 'general';
    let reason =
      item.reason?.trim() ||
      (semanticRules.some((r) => r.id === safeCategory)
        ? 'Matched semantic criteria for this mailbox.'
        : 'Routed to General Inbox.');

    const sourceEmail = emailById.get(item.id);
    if (sourceEmail) {
      // Clubs override: never let a club email appear in Academic
      if (safeCategory === 'academic' && allowedSet.has('clubs') && hasClubSignal(sourceEmail)) {
        safeCategory = 'clubs';
        reason = 'Routed exclusively to Clubs.';
      }
      // Experiential Learning (EL) guardrail: strictly Academic, never General
      if (
        safeCategory === 'general' &&
        allowedSet.has('academic') &&
        hasExperientialLearningSignal(sourceEmail)
      ) {
        safeCategory = 'academic';
        reason = 'Experiential Learning (EL) routed to Academic.';
      }
      // Sports, cultural & fests override: always General Inbox, never Academic
      if (safeCategory === 'academic' && hasSportsCulturalFestSignal(sourceEmail) && !hasExperientialLearningSignal(sourceEmail)) {
        safeCategory = 'general';
        reason = 'Sports, cultural, or fest mail routed to General Inbox.';
      }
      // Protect trusted official websites from false Spam tagging
      if (safeCategory === 'spam' && isOfficialPopularWebsiteEmail(sourceEmail.fromEmail)) {
        safeCategory = 'general';
        reason = 'Official email from a popular website routed to General Inbox.';
      }
    }

    results[item.id] = {
      categoryId: safeCategory,
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.75)),
      matchedBy: 'ai_semantic',
      reason,
    };
  }

  return results;
}

// Temporary in-memory OAuth state map for 3P Outlook/Yahoo popup flows
const pendingOAuthStates = new Map<string, { provider: 'outlook' | 'yahoo'; createdAt: number }>();

// Fast in-memory classification cache (avoids re-running Gemini on already-classified emails)
const classificationCache = new Map<string, MailClassification>();
const MAX_CACHE_ENTRIES = 10000;

function computeRulesSignature(
  rules: ClassificationRule[],
  feedback: TrainingFeedbackExample[]
): string {
  const ruleKey = rules
    .map((r) => `${r.id}:${r.useAiSemantics ? 1 : 0}:${r.keywords.length}:${r.senders.length}`)
    .join('|');
  return `${ruleKey}#fb${feedback.length}`;
}

function setCacheEntry(key: string, value: MailClassification) {
  if (classificationCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = classificationCache.keys().next().value;
    if (oldestKey) classificationCache.delete(oldestKey);
  }
  classificationCache.set(key, value);
}

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [key, val] of pendingOAuthStates.entries()) {
    if (now - val.createdAt > 10 * 60 * 1000) {
      pendingOAuthStates.delete(key);
    }
  }
}

// Per-campus-user AI rate limiter (protects free-tier quota across all RVCE students & faculty)
const campusAiRateBuckets = new Map<string, { count: number; resetAt: number }>();
const AI_RATE_WINDOW_MS = 10 * 60 * 1000;
const AI_RATE_MAX_PER_USER = 120;

function checkCampusAiRateLimit(email: string): boolean {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const existing = campusAiRateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (campusAiRateBuckets.size > 5000) {
      for (const [k, v] of campusAiRateBuckets.entries()) {
        if (v.resetAt <= now) campusAiRateBuckets.delete(k);
      }
    }
    campusAiRateBuckets.set(key, { count: 1, resetAt: now + AI_RATE_WINDOW_MS });
    return true;
  }
  if (existing.count >= AI_RATE_MAX_PER_USER) {
    return false;
  }
  existing.count += 1;
  return true;
}

async function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      campusDomains: ALLOWED_CAMPUS_DOMAINS,
      aiMode: hasGeminiApiKey() ? 'hybrid-gemini' : 'local-free',
    });
  });

  app.get('/api/auth/providers', (req, res) => {
    const baseUrl = getAppBaseUrl(req);
    res.json({
      campus: {
        allowedDomains: ALLOWED_CAMPUS_DOMAINS,
        primaryDomain: PRIMARY_DOMAIN,
        appUrl: baseUrl,
      },
      gmail: { configured: true },
      outlook: {
        configured: Boolean(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET),
        callbackUrl: `${baseUrl}/auth/outlook/callback`,
      },
      yahoo: {
        configured: Boolean(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET),
        callbackUrl: `${baseUrl}/auth/yahoo/callback`,
      },
    });
  });

  // Shared metadata-first Gmail sync handler: skips cached IDs, batches 15 requests with 500ms pause, exponential backoff on 403/429
  const handleGmailMetadataSync = async (
    req: express.Request,
    res: express.Response,
    params: {
      maxResults: number;
      query: string;
      pageToken: string;
      excludeIds: Set<string>;
    }
  ) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Gmail access token.' });
        return;
      }

      const campusCheck = await verifyCampusGmailToken(authHeader);
      if (!campusCheck.ok) {
        res.status(campusCheck.status).json({
          code: campusCheck.code,
          error: campusCheck.error,
        });
        return;
      }
      const verifiedCollegeEmail = campusCheck.email;

      const listParams = new URLSearchParams({
        maxResults: String(params.maxResults),
        includeSpamTrash: 'true',
      });
      listParams.set('q', params.query || '-in:trash');
      if (params.pageToken) {
        listParams.set('pageToken', params.pageToken);
      }

      const listAttempt = await fetchGmailWithBackoff(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams.toString()}`,
        authHeader
      );

      if (!listAttempt.response.ok) {
        const friendly = sanitizeGmailApiError(listAttempt.response.status, listAttempt.bodyText);
        res.status(friendly.status).json({
          code: friendly.code,
          error: friendly.error,
          rateLimited: friendly.code === 'GMAIL_RATE_LIMITED',
        });
        return;
      }

      const listData = JSON.parse(listAttempt.bodyText) as {
        messages?: Array<{ id: string; threadId?: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
      };

      const messageStubs = listData.messages ?? [];
      if (messageStubs.length === 0) {
        res.json({
          messages: [],
          nextPageToken: null,
          resultSizeEstimate: listData.resultSizeEstimate || 0,
          skippedCachedCount: 0,
          rateLimited: false,
        });
        return;
      }

      // Skip already-cached message IDs BEFORE calling messages.get
      const uncachedStubs = messageStubs.filter((stub) => !params.excludeIds.has(stub.id));
      const skippedCachedCount = messageStubs.length - uncachedStubs.length;

      if (uncachedStubs.length === 0) {
        res.json({
          messages: [],
          nextPageToken: listData.nextPageToken || null,
          resultSizeEstimate: listData.resultSizeEstimate || messageStubs.length,
          skippedCachedCount,
          allPageCached: true,
          rateLimited: false,
        });
        return;
      }

      // Strict lightweight metadata-first query (only From, To, Subject, Date)
      const metadataQuery =
        'format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date';

      const fetchedMessages: MailMessage[] = [];
      const batchSize = 15;
      const batchPauseMs = 500;
      let hitRateLimit = listAttempt.rateLimited;
      let abortedByRateLimit = false;

      for (let i = 0; i < uncachedStubs.length; i += batchSize) {
        const chunk = uncachedStubs.slice(i, i + batchSize);
        let chunkFatalRateLimit = false;

        const chunkResults = await Promise.all(
          chunk.map(async (stub) => {
            const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              stub.id
            )}?${metadataQuery}`;
            const detailAttempt = await fetchGmailWithBackoff(url, authHeader);
            if (detailAttempt.rateLimited) {
              hitRateLimit = true;
            }
            if (!detailAttempt.response.ok) {
              if (isGmailRateOrQuotaError(detailAttempt.response.status, detailAttempt.bodyText)) {
                chunkFatalRateLimit = true;
              }
              return null;
            }

            const detail = JSON.parse(detailAttempt.bodyText) as {
              id: string;
              threadId?: string;
              snippet?: string;
              internalDate?: string;
              labelIds?: string[];
              payload?: GmailPayloadPart & {
                headers?: Array<{ name: string; value: string }>;
              };
            };

            const headers = detail.payload?.headers ?? [];
            const getHeader = (name: string) =>
              headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

            const rawFrom = getHeader('From');
            const to = decodeHtmlEntities(getHeader('To'));
            const subject = decodeHtmlEntities(getHeader('Subject') || '(No Subject)');
            const internalMs = Number(detail.internalDate);
            const dateIso = Number.isFinite(internalMs)
              ? new Date(internalMs).toISOString()
              : new Date().toISOString();
            const threadRef = encodeURIComponent(detail.threadId || detail.id);
            const snippet = decodeHtmlEntities((detail.snippet || '').trim());

            const gmailWebLink = `https://mail.google.com/mail/?authuser=${encodeURIComponent(
              verifiedCollegeEmail
            )}#all/${threadRef}`;

            const normalized: MailMessage = {
              id: detail.id,
              threadId: detail.threadId,
              provider: 'gmail',
              fromName: extractDisplayName(rawFrom),
              fromEmail: extractEmailAddress(rawFrom),
              to,
              subject,
              snippet,
              bodyText: snippet,
              webLink: gmailWebLink,
              labelIds: detail.labelIds,
              fullBodyLoaded: false,
              dateIso,
              unread: Boolean(detail.labelIds?.includes('UNREAD')),
            };
            return normalized;
          })
        );

        for (const msg of chunkResults) {
          if (msg) fetchedMessages.push(msg);
        }

        if (chunkFatalRateLimit) {
          abortedByRateLimit = true;
          break;
        }

        // Sequential 500ms pause between batches of 15 concurrent requests
        if (i + batchSize < uncachedStubs.length) {
          await sleep(batchPauseMs);
        }
      }

      if (abortedByRateLimit && fetchedMessages.length === 0) {
        res.status(429).json({
          code: 'GMAIL_RATE_LIMITED',
          error: RATE_LIMIT_FRIENDLY_MESSAGE,
          rateLimited: true,
        });
        return;
      }

      res.json({
        messages: fetchedMessages,
        nextPageToken: abortedByRateLimit ? params.pageToken || null : listData.nextPageToken || null,
        resultSizeEstimate: listData.resultSizeEstimate || fetchedMessages.length,
        skippedCachedCount,
        allPageCached: false,
        rateLimited: hitRateLimit || abortedByRateLimit,
        statusNotice: abortedByRateLimit ? RATE_LIMIT_FRIENDLY_MESSAGE : undefined,
      });
    } catch (error) {
      console.error('Gmail sync route error:', error);
      res.status(500).json({
        error: 'Unable to sync Gmail right now. Please try again in a moment.',
      });
    }
  };

  // Primary metadata-first incremental sync endpoint (supports afterTimestamp + large excludeIds arrays cleanly)
  app.post('/api/gmail/sync', async (req, res) => {
    const body = (req.body || {}) as {
      maxResults?: number;
      q?: string;
      pageToken?: string;
      excludeIds?: string[];
      afterTimestamp?: number;
    };
    const maxResults = Math.min(100, Math.max(5, Number(body.maxResults) || 60));
    const rawQuery = typeof body.q === 'string' ? body.q.trim() : '';
    const afterTs =
      typeof body.afterTimestamp === 'number' &&
      Number.isFinite(body.afterTimestamp) &&
      body.afterTimestamp > 0
        ? Math.floor(body.afterTimestamp)
        : null;
    const query = rawQuery
      ? rawQuery
      : afterTs
      ? `-in:trash after:${afterTs}`
      : '-in:trash';
    const pageToken = typeof body.pageToken === 'string' ? body.pageToken.trim() : '';
    const excludeIds = new Set<string>(
      Array.isArray(body.excludeIds)
        ? body.excludeIds.filter((id): id is string => typeof id === 'string')
        : []
    );
    await handleGmailMetadataSync(req, res, { maxResults, query, pageToken, excludeIds });
  });

  // Backwards-compatible GET route delegating to the same metadata-first paced handler
  app.get('/api/gmail/messages', async (req, res) => {
    const maxResults = Math.min(100, Math.max(5, Number(req.query.maxResults) || 60));
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken.trim() : '';
    await handleGmailMetadataSync(req, res, {
      maxResults,
      query,
      pageToken,
      excludeIds: new Set<string>(),
    });
  });

  // On-demand full Gmail message loader (fetches format=full HTML, plain text, and attachments ONLY when clicked)
  app.get('/api/gmail/messages/:messageId', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Gmail access token.' });
        return;
      }

      const campusCheck = await verifyCampusGmailToken(authHeader);
      if (!campusCheck.ok) {
        res.status(campusCheck.status).json({
          code: campusCheck.code,
          error: campusCheck.error,
        });
        return;
      }

      const { messageId } = req.params;
      const detailAttempt = await fetchGmailWithBackoff(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          messageId
        )}?format=full`,
        authHeader
      );

      if (!detailAttempt.response.ok) {
        const friendly = sanitizeGmailApiError(detailAttempt.response.status, detailAttempt.bodyText);
        res.status(friendly.status).json({
          code: friendly.code,
          error: friendly.error,
        });
        return;
      }

      const detail = JSON.parse(detailAttempt.bodyText) as {
        id: string;
        threadId?: string;
        snippet?: string;
        payload?: GmailPayloadPart;
      };

      const {
        bodyText: extractedText,
        bodyHtml,
        attachments,
      } = extractRichContentFromGmailPayload(detail.payload);
      const bodyText = extractedText || decodeHtmlEntities(detail.snippet || '');
      const resolvedHtml = bodyHtml ? resolveInlineCidImages(bodyHtml, attachments) : undefined;

      res.json({
        id: detail.id,
        bodyText,
        bodyHtml: resolvedHtml,
        attachments: attachments.length > 0 ? attachments : undefined,
        fullBodyLoaded: true,
      });
    } catch (error) {
      console.error('Gmail single message route error:', error);
      res.status(500).json({
        error: 'Unable to load the full message right now. Please try again.',
      });
    }
  });

  // On-demand Gmail attachment download proxy (uses existing read-only Gmail Bearer token)
  app.get('/api/gmail/messages/:messageId/attachments/:attachmentId', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Gmail access token.' });
        return;
      }

      const campusCheck = await verifyCampusGmailToken(authHeader);
      if (!campusCheck.ok) {
        res.status(campusCheck.status).json({
          code: campusCheck.code,
          error: campusCheck.error,
        });
        return;
      }

      const { messageId, attachmentId } = req.params;
      const filename =
        typeof req.query.filename === 'string' && req.query.filename.trim()
          ? req.query.filename.trim().replace(/["\r\n]/g, '_')
          : 'attachment';
      const mimeType =
        typeof req.query.mimeType === 'string' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(req.query.mimeType)
          ? req.query.mimeType
          : 'application/octet-stream';

      const attachRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          messageId
        )}/attachments/${encodeURIComponent(attachmentId)}`,
        {
          headers: { Authorization: authHeader },
        }
      );

      if (!attachRes.ok) {
        const errBody = await attachRes.text();
        res.status(attachRes.status).json({
          error:
            attachRes.status === 401
              ? 'Your Gmail session expired. Re-authorize Gmail to download attachments.'
              : `Could not fetch attachment (${attachRes.status}): ${errBody.slice(0, 160)}`,
        });
        return;
      }

      const payload = (await attachRes.json()) as { data?: string };
      if (!payload.data) {
        res.status(404).json({ error: 'Attachment payload was empty.' });
        return;
      }

      const fileBuffer = decodeBase64UrlToBuffer(payload.data);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(fileBuffer.length));
      res.send(fileBuffer);
    } catch (error) {
      console.error('Gmail attachment route error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to download attachment.',
      });
    }
  });

  // Real TLS IMAP connection with full mailbox pagination (beforeSeq cursor)
  app.post('/api/imap/messages', async (req, res) => {
    const {
      email = '',
      password = '',
      host = '',
      port = 993,
      maxResults = 100,
      beforeSeq,
    } = req.body as {
      email?: string;
      password?: string;
      host?: string;
      port?: number;
      maxResults?: number;
      beforeSeq?: number;
    };

    const trimmedEmail = email.trim();
    const trimmedHost = host.trim();
    const safePort = Number(port) || 993;
    const limit = Math.min(100, Math.max(5, Number(maxResults) || 100));

    if (!trimmedEmail || !password || !trimmedHost) {
      res.status(400).json({
        error: 'College email address, App Password, and IMAP server host are all required.',
      });
      return;
    }

    if (!isAllowedCampusEmail(trimmedEmail, ALLOWED_CAMPUS_DOMAINS)) {
      res.status(403).json({
        code: 'CAMPUS_DOMAIN_REQUIRED',
        error: buildCampusRestrictionError(trimmedEmail, ALLOWED_CAMPUS_DOMAINS),
      });
      return;
    }

    if (isBlockedImapHost(trimmedHost) || safePort < 1 || safePort > 65535) {
      res.status(400).json({
        error: 'Invalid or restricted IMAP server address. Use your official college IMAP host (e.g. imap.gmail.com:993).',
      });
      return;
    }

    const client = new ImapFlow({
      host: trimmedHost,
      port: safePort,
      secure: safePort === 993,
      auth: {
        user: trimmedEmail,
        pass: password.replace(/\s+/g, ''),
      },
      logger: false,
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 25000,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const mailbox = client.mailbox;
        const total =
          mailbox && typeof mailbox === 'object' && typeof mailbox.exists === 'number'
            ? mailbox.exists
            : 0;

        if (total === 0) {
          res.json({ messages: [], nextBeforeSeq: null, totalExists: 0 });
          return;
        }

        const endSeq =
          typeof beforeSeq === 'number' && beforeSeq > 1
            ? Math.min(total, beforeSeq - 1)
            : total;
        if (endSeq < 1) {
          res.json({ messages: [], nextBeforeSeq: null, totalExists: total });
          return;
        }

        const startSeq = Math.max(1, endSeq - limit + 1);
        const range = `${startSeq}:${endSeq}`;
        const rawFetched: MailMessage[] = [];

        for await (const msg of client.fetch(range, {
          uid: true,
          flags: true,
          envelope: true,
          source: true,
        })) {
          let subject = msg.envelope?.subject || '(No Subject)';
          let fromName = msg.envelope?.from?.[0]?.name || '';
          let fromEmail = msg.envelope?.from?.[0]?.address || '';
          let to =
            (msg.envelope?.to ?? [])
              .map((addr) => addr.address)
              .filter(Boolean)
              .join(', ') || trimmedEmail;
          let dateIso = msg.envelope?.date
            ? new Date(msg.envelope.date).toISOString()
            : new Date().toISOString();
          let bodyText = '';
          let bodyHtml = '';
          const attachments: MailAttachment[] = [];

          if (msg.source) {
            try {
              const parsed = await simpleParser(msg.source);
              if (parsed.subject) subject = parsed.subject;
              const firstFrom = parsed.from?.value?.[0];
              if (firstFrom?.address) fromEmail = firstFrom.address;
              if (firstFrom?.name) fromName = firstFrom.name;
              if (parsed.date) dateIso = parsed.date.toISOString();
              if (typeof parsed.html === 'string' && parsed.html.trim()) {
                bodyHtml = sanitizeEmailHtml(parsed.html);
              }
              if (parsed.text && parsed.text.trim()) {
                bodyText = parsed.text.trim();
              } else if (bodyHtml) {
                bodyText = stripHtmlToText(bodyHtml);
              }
              if (Array.isArray(parsed.attachments)) {
                for (let idx = 0; idx < parsed.attachments.length; idx++) {
                  const att = parsed.attachments[idx];
                  const sizeBytes = att.size || att.content?.length || 0;
                  attachments.push({
                    id: `imap-${msg.uid}-att-${idx}`,
                    filename: att.filename || `attachment-${idx + 1}`,
                    mimeType: att.contentType || 'application/octet-stream',
                    sizeBytes,
                    contentId: att.cid || undefined,
                    inlineDataBase64:
                      att.content && sizeBytes <= 4 * 1024 * 1024
                        ? att.content.toString('base64')
                        : undefined,
                  });
                }
              }
            } catch {
              // Fallback to envelope metadata if MIME parsing fails
            }
          }

          const cleanEmail = extractEmailAddress(fromEmail);
          const cleanName = fromName.trim() || extractDisplayName(cleanEmail || 'Unknown');
          const cleanBody = bodyText || subject;
          const resolvedHtml = bodyHtml ? resolveInlineCidImages(bodyHtml, attachments) : undefined;

          rawFetched.push({
            id: `imap-${msg.uid}`,
            provider: 'imap',
            fromName: cleanName,
            fromEmail: cleanEmail,
            to,
            subject,
            snippet: cleanBody.replace(/\s+/g, ' ').slice(0, 170),
            bodyText: cleanBody,
            bodyHtml: resolvedHtml,
            attachments: attachments.length > 0 ? attachments : undefined,
            fullBodyLoaded: true,
            dateIso,
            unread: !msg.flags?.has('\\Seen'),
          });
        }

        // Most recent messages first
        rawFetched.sort(
          (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime()
        );
        res.json({
          messages: rawFetched,
          nextBeforeSeq: startSeq > 1 ? startSeq : null,
          totalExists: total,
        });
      } finally {
        lock.release();
      }
    } catch (error) {
      const errObj = error as { responseText?: string; code?: string; message?: string } | null;
      const detail = `${errObj?.code || ''} ${errObj?.responseText || ''} ${errObj?.message || ''}`.toLowerCase();

      if (
        detail.includes('auth') ||
        detail.includes('invalid credentials') ||
        detail.includes('login failed') ||
        detail.includes('application-specific password')
      ) {
        res.status(401).json({
          error:
            'Authentication rejected by the mail server. For Gmail, Yahoo, and Outlook, make sure IMAP is enabled and use an App Password (not your regular account password).',
        });
        return;
      }

      if (detail.includes('enotfound') || detail.includes('econnrefused') || detail.includes('timeout')) {
        res.status(502).json({
          error: `Could not reach IMAP server ${trimmedHost}:${safePort}. Double-check the server host and port.`,
        });
        return;
      }

      res.status(500).json({
        error: errObj?.responseText || errObj?.message || 'Failed to connect via IMAP.',
      });
    } finally {
      try {
        await client.logout();
      } catch {
        // Ignore disconnect error if connection never opened
      }
    }
  });

  // Parse real exported .eml or .mbox files (e.g. Gmail "Download message" or Google Takeout)
  app.post('/api/import/emails', async (req, res) => {
    try {
      const { files = [] } = req.body as {
        files?: Array<{ name: string; content: string }>;
      };

      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: 'Please upload at least one .eml or .mbox file.' });
        return;
      }

      const rawSources: Array<{ label: string; raw: string }> = [];

      for (const file of files) {
        if (!file?.content || typeof file.content !== 'string') continue;
        const lowerName = (file.name || '').toLowerCase();

        if (lowerName.endsWith('.mbox') || file.content.startsWith('From ')) {
          // Split standard MBOX format on top-level "From " envelope boundaries
          const chunks = file.content
            .split(/\r?\n(?=From [^\r\n]+ \d{4}\r?\n)/)
            .map((chunk) => chunk.replace(/^From [^\r\n]+\r?\n/, '').trim())
            .filter(Boolean);

          for (let i = 0; i < chunks.length && rawSources.length < 2000; i++) {
            rawSources.push({ label: `${file.name}#${i + 1}`, raw: chunks[i] });
          }
        } else {
          if (rawSources.length < 2000) {
            rawSources.push({ label: file.name || 'message.eml', raw: file.content });
          }
        }
      }

      const messages: MailMessage[] = [];

      for (let i = 0; i < rawSources.length; i++) {
        const entry = rawSources[i];
        try {
          const parsed = await simpleParser(entry.raw);
          const firstFrom = parsed.from?.value?.[0];
          const rawFromAddress = firstFrom?.address || parsed.from?.text || '';
          const cleanEmail = extractEmailAddress(rawFromAddress);
          const cleanName = firstFrom?.name?.trim() || extractDisplayName(cleanEmail || 'Unknown');

          const toField = Array.isArray(parsed.to)
            ? parsed.to.map((t) => t.text).join(', ')
            : parsed.to?.text || '';

          const rawHtml =
            typeof parsed.html === 'string' && parsed.html.trim()
              ? sanitizeEmailHtml(parsed.html)
              : '';
          const bodyText =
            (parsed.text && parsed.text.trim()) ||
            (rawHtml ? stripHtmlToText(rawHtml) : '') ||
            parsed.subject ||
            '';

          const attachments: MailAttachment[] = Array.isArray(parsed.attachments)
            ? parsed.attachments.map((att, idx) => {
                const sizeBytes = att.size || att.content?.length || 0;
                return {
                  id: `import-${i}-att-${idx}`,
                  filename: att.filename || `attachment-${idx + 1}`,
                  mimeType: att.contentType || 'application/octet-stream',
                  sizeBytes,
                  contentId: att.cid || undefined,
                  inlineDataBase64:
                    att.content && sizeBytes <= 4 * 1024 * 1024
                      ? att.content.toString('base64')
                      : undefined,
                };
              })
            : [];

          const resolvedHtml = rawHtml ? resolveInlineCidImages(rawHtml, attachments) : undefined;

          messages.push({
            id: `import-${Date.now()}-${i}`,
            provider: 'import',
            fromName: cleanName,
            fromEmail: cleanEmail,
            to: toField,
            subject: parsed.subject || '(No Subject)',
            snippet: bodyText.replace(/\s+/g, ' ').slice(0, 170),
            bodyText,
            bodyHtml: resolvedHtml,
            attachments: attachments.length > 0 ? attachments : undefined,
            fullBodyLoaded: true,
            dateIso: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
            unread: true,
          });
        } catch {
          // Skip unparseable entries cleanly
        }
      }

      if (messages.length === 0) {
        res.status(400).json({
          error:
            'No valid email messages were found in the uploaded file(s). Please upload standard .eml or .mbox exports.',
        });
        return;
      }

      messages.sort((a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime());
      res.json({ messages });
    } catch (error) {
      console.error('Import emails error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to parse uploaded email files.',
      });
    }
  });

  // Microsoft Outlook OAuth URL (Popup opens provider directly)
  app.get('/api/auth/outlook/url', (_req, res) => {
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
    const redirectUri = `${getAppBaseUrl()}/auth/outlook/callback`;

    if (!clientId || !clientSecret) {
      res.status(400).json({
        error: 'OUTLOOK_NOT_CONFIGURED',
        callbackUrl: redirectUri,
        message:
          'Add OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET in AI Studio Secrets to enable Microsoft Outlook sign-in.',
      });
      return;
    }

    cleanupExpiredStates();
    const state = crypto.randomUUID();
    pendingOAuthStates.set(state, { provider: 'outlook', createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: 'openid profile email offline_access User.Read Mail.Read',
      state,
      prompt: 'select_account',
    });

    res.json({
      url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
    });
  });

  app.get(['/auth/outlook/callback', '/auth/outlook/callback/'], async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const errorDesc = typeof req.query.error_description === 'string' ? req.query.error_description : '';

    if (errorDesc || !code || !pendingOAuthStates.has(state)) {
      res.status(400).send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OUTLOOK_OAUTH_ERROR', error: ${JSON.stringify(
              errorDesc || 'Outlook authorization failed or expired.'
            )} }, '*');
            window.close();
          }
        </script><p>Outlook sign-in failed. You may close this window.</p></body></html>
      `);
      return;
    }

    pendingOAuthStates.delete(state);

    try {
      const redirectUri = `${getAppBaseUrl()}/auth/outlook/callback`;
      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.OUTLOOK_CLIENT_ID || '',
          client_secret: process.env.OUTLOOK_CLIENT_SECRET || '',
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error_description?: string;
      };

      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Token exchange failed');
      }

      const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = (await profileRes.json()) as {
        displayName?: string;
        mail?: string;
        userPrincipalName?: string;
      };

      const outlookEmail = (profile.mail || profile.userPrincipalName || '').trim().toLowerCase();
      if (!isAllowedCampusEmail(outlookEmail, ALLOWED_CAMPUS_DOMAINS)) {
        const errMsg = buildCampusRestrictionError(outlookEmail, ALLOWED_CAMPUS_DOMAINS);
        res.status(403).send(`
          <html><body><script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OUTLOOK_OAUTH_ERROR', error: ${JSON.stringify(errMsg)} }, '*');
              window.close();
            }
          </script><p>${escapeHtml(errMsg)}</p></body></html>
        `);
        return;
      }

      const payload = {
        type: 'OUTLOOK_OAUTH_SUCCESS',
        accessToken: tokenData.access_token,
        account: {
          provider: 'outlook',
          email: outlookEmail,
          displayName: profile.displayName || 'College Mail User',
        },
      };

      res.send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage(${JSON.stringify(payload)}, '*');
            window.close();
          }
        </script><p>Outlook connected. Closing window...</p></body></html>
      `);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Outlook connection error';
      res.status(500).send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OUTLOOK_OAUTH_ERROR', error: ${JSON.stringify(msg)} }, '*');
            window.close();
          }
        </script><p>${escapeHtml(msg)}</p></body></html>
      `);
    }
  });

  app.get('/api/outlook/messages', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Outlook access token.' });
        return;
      }

      const maxResults = Math.min(100, Math.max(5, Number(req.query.maxResults) || 100));
      const requestedNextLink =
        typeof req.query.nextLink === 'string' ? req.query.nextLink.trim() : '';
      const graphUrl =
        requestedNextLink &&
        requestedNextLink.startsWith('https://graph.microsoft.com/v1.0/me/messages')
          ? requestedNextLink
          : `https://graph.microsoft.com/v1.0/me/messages?$top=${maxResults}&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,isRead,webLink&$orderby=receivedDateTime desc`;

      const graphRes = await fetch(graphUrl, {
        headers: { Authorization: authHeader },
      });

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        res.status(graphRes.status).json({
          error: `Microsoft Graph API error (${graphRes.status}): ${errText.slice(0, 200)}`,
        });
        return;
      }

      const data = (await graphRes.json()) as {
        value?: Array<{
          id: string;
          conversationId?: string;
          subject?: string;
          bodyPreview?: string;
          body?: { contentType?: string; content?: string };
          from?: { emailAddress?: { name?: string; address?: string } };
          toRecipients?: Array<{ emailAddress?: { address?: string } }>;
          receivedDateTime?: string;
          isRead?: boolean;
          webLink?: string;
        }>;
        '@odata.nextLink'?: string;
      };

      const messages: MailMessage[] = (data.value ?? []).map((item) => {
        const rawBody = item.body?.content || item.bodyPreview || '';
        const isHtml = item.body?.contentType?.toLowerCase() === 'html';
        const bodyHtml = isHtml && rawBody ? sanitizeEmailHtml(rawBody) : undefined;
        const bodyText = isHtml ? stripHtmlToText(rawBody) : rawBody;

        return {
          id: item.id,
          threadId: item.conversationId,
          provider: 'outlook',
          fromName: item.from?.emailAddress?.name || item.from?.emailAddress?.address || 'Unknown',
          fromEmail: (item.from?.emailAddress?.address || '').toLowerCase(),
          to: (item.toRecipients ?? [])
            .map((r) => r.emailAddress?.address)
            .filter(Boolean)
            .join(', '),
          subject: item.subject || '(No Subject)',
          snippet: item.bodyPreview || bodyText.slice(0, 160),
          bodyText,
          bodyHtml,
          webLink: item.webLink,
          fullBodyLoaded: true,
          dateIso: item.receivedDateTime || new Date().toISOString(),
          unread: item.isRead === false,
        };
      });

      res.json({
        messages,
        nextLink: data['@odata.nextLink'] || null,
      });
    } catch (error) {
      console.error('Outlook messages route error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch Outlook messages.',
      });
    }
  });

  // Yahoo Mail OAuth URL
  app.get('/api/auth/yahoo/url', (_req, res) => {
    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;
    const redirectUri = `${getAppBaseUrl()}/auth/yahoo/callback`;

    if (!clientId || !clientSecret) {
      res.status(400).json({
        error: 'YAHOO_NOT_CONFIGURED',
        callbackUrl: redirectUri,
        message:
          'Add YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in AI Studio Secrets to enable Yahoo Mail sign-in.',
      });
      return;
    }

    cleanupExpiredStates();
    const state = crypto.randomUUID();
    pendingOAuthStates.set(state, { provider: 'yahoo', createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email mail-r',
      state,
    });

    res.json({
      url: `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`,
    });
  });

  app.get(['/auth/yahoo/callback', '/auth/yahoo/callback/'], async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!code || !pendingOAuthStates.has(state)) {
      res.status(400).send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'YAHOO_OAUTH_ERROR', error: 'Yahoo authorization failed or expired.' }, '*');
            window.close();
          }
        </script><p>Yahoo sign-in failed. You may close this window.</p></body></html>
      `);
      return;
    }

    pendingOAuthStates.delete(state);

    try {
      const redirectUri = `${getAppBaseUrl()}/auth/yahoo/callback`;
      const basicAuth = Buffer.from(
        `${process.env.YAHOO_CLIENT_ID || ''}:${process.env.YAHOO_CLIENT_SECRET || ''}`
      ).toString('base64');

      const tokenRes = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      });

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error_description?: string;
      };

      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Yahoo token exchange failed');
      }

      const userInfoRes = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = (await userInfoRes.json()) as {
        name?: string;
        email?: string;
      };

      const yahooEmail = (profile.email || '').trim().toLowerCase();
      if (!isAllowedCampusEmail(yahooEmail, ALLOWED_CAMPUS_DOMAINS)) {
        const errMsg = buildCampusRestrictionError(yahooEmail, ALLOWED_CAMPUS_DOMAINS);
        res.status(403).send(`
          <html><body><script>
            if (window.opener) {
              window.opener.postMessage({ type: 'YAHOO_OAUTH_ERROR', error: ${JSON.stringify(errMsg)} }, '*');
              window.close();
            }
          </script><p>${escapeHtml(errMsg)}</p></body></html>
        `);
        return;
      }

      const payload = {
        type: 'YAHOO_OAUTH_SUCCESS',
        accessToken: tokenData.access_token,
        account: {
          provider: 'yahoo',
          email: yahooEmail,
          displayName: profile.name || 'College Mail User',
        },
      };

      res.send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage(${JSON.stringify(payload)}, '*');
            window.close();
          }
        </script><p>Yahoo connected. Closing window...</p></body></html>
      `);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Yahoo connection error';
      res.status(500).send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'YAHOO_OAUTH_ERROR', error: ${JSON.stringify(msg)} }, '*');
            window.close();
          }
        </script><p>${escapeHtml(msg)}</p></body></html>
      `);
    }
  });

  // Hybrid Deterministic Directory + Gemini Semantic Classification Endpoint (Campus-authenticated + Free-tier resilient)
  app.post('/api/classify', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          code: 'CAMPUS_AUTH_REQUIRED',
          error: 'Sign in with your @rvce.edu.in mail to classify emails.',
        });
        return;
      }

      const campusCheck = await verifyCampusGmailToken(authHeader);
      if (!campusCheck.ok) {
        res.status(campusCheck.status).json({
          code: campusCheck.code,
          error: campusCheck.error,
        });
        return;
      }

      const {
        messages = [],
        rules = DEFAULT_CLASSIFICATION_RULES,
        feedbackExamples = [],
      } = req.body as {
        messages?: MailMessage[];
        rules?: ClassificationRule[];
        feedbackExamples?: TrainingFeedbackExample[];
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.json({ classifications: {} });
        return;
      }

      const activeRules: ClassificationRule[] =
        Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_CLASSIFICATION_RULES;

      const classifications: Record<string, MailClassification> = {};
      const messageById = new Map<string, MailMessage>();
      const needsGemini: Array<{
        id: string;
        cacheKey: string;
        fromName: string;
        fromEmail: string;
        subject: string;
        snippet: string;
        bodyExcerpt: string;
        labels?: string[];
      }> = [];

      const rulesSig = computeRulesSignature(activeRules, feedbackExamples);

      // Step 1: Deterministic rules + popular-website fast-path + cache lookup (0ms, zero API cost)
      for (const msg of messages) {
        messageById.set(msg.id, msg);
        const directMatch = matchMessageDeterministically(msg, activeRules);
        if (directMatch) {
          classifications[msg.id] = {
            categoryId: directMatch.categoryId,
            confidence: 1.0,
            matchedBy: 'directory',
            reason: directMatch.rule
              ? `Matched ${directMatch.rule.shortName} (${directMatch.matchedEntry}).`
              : `Routed to General Inbox (${directMatch.matchedEntry}).`,
          };
          continue;
        }

        // Fast-path official popular websites directly to General Inbox to save free-tier quota across campus
        if (canFastPathOfficialWebsiteToGeneral(msg, activeRules, feedbackExamples)) {
          classifications[msg.id] = {
            categoryId: 'general',
            confidence: 0.96,
            matchedBy: 'directory',
            reason: 'Official email from a popular website routed to General Inbox.',
          };
          continue;
        }

        const relevantLabels = (msg.labelIds ?? []).filter(
          (l) => l === 'SPAM' || l === 'CATEGORY_PROMOTIONS' || l === 'CATEGORY_SOCIAL'
        );
        const cacheKey = `${rulesSig}::${msg.fromEmail}::${msg.replyTo || ''}::${msg.subject}::${relevantLabels.join(',')}::${(msg.snippet || '').slice(0, 80)}`;
        const cached = classificationCache.get(cacheKey);
        if (cached) {
          classifications[msg.id] = cached;
          continue;
        }

        needsGemini.push({
          id: msg.id,
          cacheKey,
          fromName: msg.fromName,
          fromEmail: msg.fromEmail,
          subject: decodeHtmlEntities(msg.subject),
          snippet: decodeHtmlEntities(msg.snippet),
          bodyExcerpt: decodeHtmlEntities((msg.bodyText || msg.snippet || '').slice(0, 240)),
          labels: relevantLabels.length > 0 ? relevantLabels : undefined,
        });
      }

      // Step 2: Rate-limit-safe Gemini classification with zero-cost local fallback if quota is hit or unconfigured
      const canUseGemini = hasGeminiApiKey() && checkCampusAiRateLimit(campusCheck.email);

      if (needsGemini.length > 0 && canUseGemini) {
        const batchSize = 25;
        const batches: typeof needsGemini[] = [];
        for (let i = 0; i < needsGemini.length; i += batchSize) {
          batches.push(needsGemini.slice(i, i + batchSize));
        }

        const concurrency = 3;
        let cursor = 0;
        const worker = async () => {
          while (cursor < batches.length) {
            const idx = cursor++;
            const batch = batches[idx];
            try {
              const partial = await classifyBatchWithGemini(batch, activeRules, feedbackExamples);
              Object.assign(classifications, partial);
            } catch (batchErr) {
              // Seamless zero-cost local fallback if Gemini free-tier quota or network fails
              console.warn(
                'Gemini batch fallback to local classifier:',
                batchErr instanceof Error ? batchErr.message : String(batchErr)
              );
              for (const item of batch) {
                const orig = messageById.get(item.id);
                classifications[item.id] = classifyMessageLocallyFallback(
                  orig || {
                    fromName: item.fromName,
                    fromEmail: item.fromEmail,
                    subject: item.subject,
                    snippet: item.snippet,
                    bodyText: item.bodyExcerpt,
                    labelIds: item.labels,
                  },
                  activeRules,
                  feedbackExamples
                );
              }
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(concurrency, batches.length) }, () => worker())
        );

        // Populate cache for instant subsequent syncs
        for (const item of needsGemini) {
          const result = classifications[item.id];
          if (result && result.matchedBy === 'ai_semantic') {
            setCacheEntry(item.cacheKey, result);
          }
        }
      } else if (needsGemini.length > 0) {
        for (const item of needsGemini) {
          const orig = messageById.get(item.id);
          classifications[item.id] = classifyMessageLocallyFallback(
            orig || {
              fromName: item.fromName,
              fromEmail: item.fromEmail,
              subject: item.subject,
              snippet: item.snippet,
              bodyText: item.bodyExcerpt,
              labelIds: item.labels,
            },
            activeRules,
            feedbackExamples
          );
        }
      }

      res.json({ classifications });
    } catch (error) {
      console.error('Classification error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Classification failed. Please try again.',
      });
    }
  });

  // Single-email test bench endpoint (campus-authenticated with zero-cost fallback)
  app.post('/api/classify/test', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          code: 'CAMPUS_AUTH_REQUIRED',
          error: 'Sign in with your @rvce.edu.in mail to test classification.',
        });
        return;
      }

      const campusCheck = await verifyCampusGmailToken(authHeader);
      if (!campusCheck.ok) {
        res.status(campusCheck.status).json({
          code: campusCheck.code,
          error: campusCheck.error,
        });
        return;
      }

      const {
        fromEmail = '',
        subject = '',
        bodyText = '',
        rules = DEFAULT_CLASSIFICATION_RULES,
        feedbackExamples = [],
      } = req.body as {
        fromEmail?: string;
        subject?: string;
        bodyText?: string;
        rules?: ClassificationRule[];
        feedbackExamples?: TrainingFeedbackExample[];
      };

      const activeRules =
        Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_CLASSIFICATION_RULES;

      const testMsg = {
        fromEmail,
        subject,
        snippet: bodyText.slice(0, 180),
        bodyText,
      };

      const directMatch = matchMessageDeterministically(testMsg, activeRules);
      if (directMatch) {
        const result: MailClassification = {
          categoryId: directMatch.categoryId,
          confidence: 1.0,
          matchedBy: 'directory',
          reason: directMatch.rule
            ? `Matched ${directMatch.rule.name} (${directMatch.matchedEntry}).`
            : `Routed to General Inbox (${directMatch.matchedEntry}).`,
        };
        res.json({ classification: result });
        return;
      }

      if (canFastPathOfficialWebsiteToGeneral(testMsg, activeRules, feedbackExamples)) {
        res.json({
          classification: {
            categoryId: 'general',
            confidence: 0.96,
            matchedBy: 'directory',
            reason: 'Official email from a popular website routed to General Inbox.',
          },
        });
        return;
      }

      if (hasGeminiApiKey() && checkCampusAiRateLimit(campusCheck.email)) {
        try {
          const aiMap = await classifyBatchWithGemini(
            [
              {
                id: 'test-email',
                fromName: extractDisplayName(fromEmail || 'unknown@example.com'),
                fromEmail: extractEmailAddress(fromEmail || 'unknown@example.com'),
                subject: subject || '(No Subject)',
                snippet: bodyText.slice(0, 180),
                bodyExcerpt: bodyText.slice(0, 1000),
              },
            ],
            activeRules,
            feedbackExamples
          );

          res.json({
            classification: aiMap['test-email'] || classifyMessageLocallyFallback(testMsg, activeRules, feedbackExamples),
          });
          return;
        } catch (aiErr) {
          console.warn(
            'Test classification fallback to local classifier:',
            aiErr instanceof Error ? aiErr.message : String(aiErr)
          );
        }
      }

      res.json({
        classification: classifyMessageLocallyFallback(testMsg, activeRules, feedbackExamples),
      });
    } catch (error) {
      console.error('Test classification error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Test classification failed.',
      });
    }
  });

  // Natural-language training order parser (campus-authenticated with zero-cost fallback)
  app.post('/api/rules/parse', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          code: 'CAMPUS_AUTH_REQUIRED',
          error: 'Sign in with your @rvce.edu.in mail to create training orders.',
        });
        return;
      }

      const campusCheck = await verifyCampusGmailToken(authHeader);
      if (!campusCheck.ok) {
        res.status(campusCheck.status).json({
          code: campusCheck.code,
          error: campusCheck.error,
        });
        return;
      }

      const { instruction, existingRules = DEFAULT_CLASSIFICATION_RULES } = req.body as {
        instruction?: string;
        existingRules?: ClassificationRule[];
      };

      if (!instruction || !instruction.trim()) {
        res.status(400).json({ error: 'Please enter a training order or instruction.' });
        return;
      }

      if (hasGeminiApiKey() && checkCampusAiRateLimit(campusCheck.email)) {
        try {
          const ai = getAiClient();
          const existingSummary = existingRules.map((r) => ({
            id: r.id,
            name: r.name,
          }));

          const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Parse the following email classification training order into a structured rule:\n\n"${instruction.trim()}"\n\nExisting mailboxes: ${JSON.stringify(existingSummary)}`,
            config: {
              systemInstruction: `You convert natural-language email sorting orders into clean structured rules.
If the user is adding senders or keywords to an EXISTING mailbox (like "academic" or "volunteering"), set action="update_existing" and targetRuleId to that mailbox's id.
If the user is creating a NEW mailbox (e.g. "PLACEMENT MAILS", "CLUBS & EVENTS", "INTERNSHIPS"), set action="create_new", generate a clean slug id (lowercase alphanumeric/hyphen), uppercase box name ending in MAILS if natural, shortName (1-2 words), concise description, extracted email addresses/domains (fix obvious punctuation typos like ,in -> .in and split concatenated addresses), extracted semantic keywords, and whether AI semantics should be enabled (true if they mention topic/word matching).`,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  action: { type: Type.STRING },
                  targetRuleId: { type: Type.STRING },
                  name: { type: Type.STRING },
                  shortName: { type: Type.STRING },
                  description: { type: Type.STRING },
                  senders: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  keywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  useAiSemantics: { type: Type.BOOLEAN },
                },
                required: [
                  'action',
                  'targetRuleId',
                  'name',
                  'shortName',
                  'description',
                  'senders',
                  'keywords',
                  'useAiSemantics',
                ],
              },
            },
          });

          const raw = (response.text ?? '').trim();
          const parsed = JSON.parse(raw);
          res.json({ parsedRule: parsed });
          return;
        } catch (aiErr) {
          console.warn(
            'Rule parse fallback to local parser:',
            aiErr instanceof Error ? aiErr.message : String(aiErr)
          );
        }
      }

      res.json({
        parsedRule: parseTrainingOrderLocallyFallback(instruction, existingRules),
      });
    } catch (error) {
      console.error('Rule parse error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to parse training order.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '365d',
        immutable: true,
      })
    );
    app.use(express.static(distPath, { maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NexaMAIL server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
