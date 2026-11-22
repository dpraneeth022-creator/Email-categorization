import type { MailClassification, MailMessage } from '../shared/types';

const DB_NAME = 'nexamail_campus_cache_v1';
const DB_VERSION = 2;
const STORE_MESSAGES = 'messages';
const STORE_META = 'meta';
const STORE_CLASSIFICATIONS = 'classifications';

export interface CachedMailboxMeta {
  accountEmail: string;
  nextPageToken: string | null;
  totalEstimate: number | null;
  rulesVersion: string;
  lastSyncedAt: number;
  latestMessageTimestamp?: number | null;
  elToAcademicMigrated?: boolean;
}

interface StoredMessageRecord {
  cacheKey: string;
  accountEmail: string;
  id: string;
  dateIso: string;
  message: MailMessage;
}

interface StoredClassificationRecord {
  cacheKey: string;
  accountEmail: string;
  messageId: string;
  classification: MailClassification;
  updatedAt: number;
}

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'cacheKey' });
          msgStore.createIndex('by_account', 'accountEmail', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'accountEmail' });
        }
        if (!db.objectStoreNames.contains(STORE_CLASSIFICATIONS)) {
          const clsStore = db.createObjectStore(STORE_CLASSIFICATIONS, { keyPath: 'cacheKey' });
          clsStore.createIndex('by_account', 'accountEmail', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function normalizeAccountKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Loads all persisted emails, saved classifications, and mailbox metadata from IndexedDB.
 * Merges saved classifications from the dedicated classifications store onto every message
 * so already-classified emails are always preserved and never re-classified.
 */
export async function loadCachedMailbox(accountEmail: string): Promise<{
  messages: MailMessage[];
  meta: CachedMailboxMeta | null;
  classifications: Record<string, MailClassification>;
}> {
  const db = await openCacheDb();
  if (!db) return { messages: [], meta: null, classifications: {} };

  const acct = normalizeAccountKey(accountEmail);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_MESSAGES, STORE_META, STORE_CLASSIFICATIONS], 'readonly');
      const msgStore = tx.objectStore(STORE_MESSAGES);
      const metaStore = tx.objectStore(STORE_META);
      const clsStore = tx.objectStore(STORE_CLASSIFICATIONS);

      const msgReq = msgStore.index('by_account').getAll(IDBKeyRange.only(acct));
      const metaReq = metaStore.get(acct);
      const clsReq = clsStore.index('by_account').getAll(IDBKeyRange.only(acct));

      let rawMessages: MailMessage[] = [];
      let meta: CachedMailboxMeta | null = null;
      const classifications: Record<string, MailClassification> = {};

      msgReq.onsuccess = () => {
        const records = (msgReq.result as StoredMessageRecord[] | undefined) ?? [];
        rawMessages = records
          .map((rec) => rec.message)
          .filter((m): m is MailMessage => Boolean(m && m.id));
      };

      metaReq.onsuccess = () => {
        meta = (metaReq.result as CachedMailboxMeta | undefined) ?? null;
      };

      clsReq.onsuccess = () => {
        const records = (clsReq.result as StoredClassificationRecord[] | undefined) ?? [];
        for (const rec of records) {
          if (rec.messageId && rec.classification?.categoryId) {
            classifications[rec.messageId] = rec.classification;
          }
        }
      };

      tx.oncomplete = () => {
        db.close();
        // Ensure pre-v2 messages that already had a classification also populate the lookup map
        const mergedMessages = rawMessages.map((msg) => {
          const savedCls = classifications[msg.id];
          if (savedCls) {
            return { ...msg, classification: savedCls };
          }
          if (msg.classification?.categoryId) {
            classifications[msg.id] = msg.classification;
          }
          return msg;
        });
        resolve({ messages: mergedMessages, meta, classifications });
      };

      tx.onerror = () => {
        db.close();
        resolve({ messages: [], meta: null, classifications: {} });
      };
    } catch {
      db.close();
      resolve({ messages: [], meta: null, classifications: {} });
    }
  });
}

/**
 * Loads the complete map of already-classified messageIds from IndexedDB so the classifier
 * strictly skips any email that already has a saved category.
 */
export async function loadSavedClassifications(
  accountEmail: string
): Promise<Record<string, MailClassification>> {
  const db = await openCacheDb();
  if (!db) return {};

  const acct = normalizeAccountKey(accountEmail);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_CLASSIFICATIONS, STORE_MESSAGES], 'readonly');
      const clsReq = tx
        .objectStore(STORE_CLASSIFICATIONS)
        .index('by_account')
        .getAll(IDBKeyRange.only(acct));
      const msgReq = tx
        .objectStore(STORE_MESSAGES)
        .index('by_account')
        .getAll(IDBKeyRange.only(acct));

      const map: Record<string, MailClassification> = {};

      msgReq.onsuccess = () => {
        const records = (msgReq.result as StoredMessageRecord[] | undefined) ?? [];
        for (const rec of records) {
          if (rec.id && rec.message?.classification?.categoryId && !map[rec.id]) {
            map[rec.id] = rec.message.classification;
          }
        }
      };

      clsReq.onsuccess = () => {
        const records = (clsReq.result as StoredClassificationRecord[] | undefined) ?? [];
        for (const rec of records) {
          if (rec.messageId && rec.classification?.categoryId) {
            map[rec.messageId] = rec.classification;
          }
        }
      };

      tx.oncomplete = () => {
        db.close();
        resolve(map);
      };
      tx.onerror = () => {
        db.close();
        resolve({});
      };
    } catch {
      db.close();
      resolve({});
    }
  });
}

/**
 * Persists full email records (and mirrors any assigned classifications into the
 * dedicated classifications store atomically).
 */
export async function saveCachedMessages(
  accountEmail: string,
  messages: MailMessage[]
): Promise<void> {
  if (!accountEmail || messages.length === 0) return;
  const db = await openCacheDb();
  if (!db) return;

  const acct = normalizeAccountKey(accountEmail);
  const now = Date.now();

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_MESSAGES, STORE_CLASSIFICATIONS], 'readwrite');
      const msgStore = tx.objectStore(STORE_MESSAGES);
      const clsStore = tx.objectStore(STORE_CLASSIFICATIONS);

      for (const msg of messages) {
        if (!msg?.id) continue;
        const cacheKey = `${acct}::${msg.id}`;
        const record: StoredMessageRecord = {
          cacheKey,
          accountEmail: acct,
          id: msg.id,
          dateIso: msg.dateIso || '',
          message: msg,
        };
        msgStore.put(record);

        if (msg.classification?.categoryId) {
          const clsRecord: StoredClassificationRecord = {
            cacheKey,
            accountEmail: acct,
            messageId: msg.id,
            classification: msg.classification,
            updatedAt: now,
          };
          clsStore.put(clsRecord);
        }
      }

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Persists explicit classification entries into the dedicated IndexedDB classification store.
 */
export async function saveCachedClassifications(
  accountEmail: string,
  classifications: Record<string, MailClassification>
): Promise<void> {
  const entries = Object.entries(classifications);
  if (!accountEmail || entries.length === 0) return;
  const db = await openCacheDb();
  if (!db) return;

  const acct = normalizeAccountKey(accountEmail);
  const now = Date.now();

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_CLASSIFICATIONS, 'readwrite');
      const clsStore = tx.objectStore(STORE_CLASSIFICATIONS);

      for (const [messageId, classification] of entries) {
        if (!messageId || !classification?.categoryId) continue;
        const record: StoredClassificationRecord = {
          cacheKey: `${acct}::${messageId}`,
          accountEmail: acct,
          messageId,
          classification,
          updatedAt: now,
        };
        clsStore.put(record);
      }

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function saveCachedMeta(meta: CachedMailboxMeta): Promise<void> {
  if (!meta.accountEmail) return;
  const db = await openCacheDb();
  if (!db) return;

  const normalized: CachedMailboxMeta = {
    ...meta,
    accountEmail: normalizeAccountKey(meta.accountEmail),
  };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put(normalized);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Permanently removes specified message IDs from both the messages and classifications IndexedDB stores.
 */
export async function deleteCachedMessages(
  accountEmail: string,
  messageIds: string[]
): Promise<void> {
  if (!accountEmail || messageIds.length === 0) return;
  const db = await openCacheDb();
  if (!db) return;

  const acct = normalizeAccountKey(accountEmail);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_MESSAGES, STORE_CLASSIFICATIONS], 'readwrite');
      const msgStore = tx.objectStore(STORE_MESSAGES);
      const clsStore = tx.objectStore(STORE_CLASSIFICATIONS);

      for (const id of messageIds) {
        if (!id) continue;
        const cacheKey = `${acct}::${id}`;
        msgStore.delete(cacheKey);
        clsStore.delete(cacheKey);
      }

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

