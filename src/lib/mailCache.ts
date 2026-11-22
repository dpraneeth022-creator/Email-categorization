import type { MailMessage } from '../shared/types';

const DB_NAME = 'nexamail_campus_cache_v1';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';
const STORE_META = 'meta';

export interface CachedMailboxMeta {
  accountEmail: string;
  nextPageToken: string | null;
  totalEstimate: number | null;
  rulesVersion: string;
  lastSyncedAt: number;
}

interface StoredMessageRecord {
  cacheKey: string;
  accountEmail: string;
  id: string;
  dateIso: string;
  message: MailMessage;
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

export async function loadCachedMailbox(accountEmail: string): Promise<{
  messages: MailMessage[];
  meta: CachedMailboxMeta | null;
}> {
  const db = await openCacheDb();
  if (!db) return { messages: [], meta: null };

  const acct = normalizeAccountKey(accountEmail);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_MESSAGES, STORE_META], 'readonly');
      const msgStore = tx.objectStore(STORE_MESSAGES);
      const metaStore = tx.objectStore(STORE_META);

      const index = msgStore.index('by_account');
      const msgReq = index.getAll(IDBKeyRange.only(acct));
      const metaReq = metaStore.get(acct);

      let messages: MailMessage[] = [];
      let meta: CachedMailboxMeta | null = null;

      msgReq.onsuccess = () => {
        const records = (msgReq.result as StoredMessageRecord[] | undefined) ?? [];
        messages = records
          .map((rec) => rec.message)
          .filter((m): m is MailMessage => Boolean(m && m.id));
      };

      metaReq.onsuccess = () => {
        meta = (metaReq.result as CachedMailboxMeta | undefined) ?? null;
      };

      tx.oncomplete = () => {
        db.close();
        resolve({ messages, meta });
      };

      tx.onerror = () => {
        db.close();
        resolve({ messages: [], meta: null });
      };
    } catch {
      db.close();
      resolve({ messages: [], meta: null });
    }
  });
}

export async function saveCachedMessages(
  accountEmail: string,
  messages: MailMessage[]
): Promise<void> {
  if (!accountEmail || messages.length === 0) return;
  const db = await openCacheDb();
  if (!db) return;

  const acct = normalizeAccountKey(accountEmail);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);

      for (const msg of messages) {
        if (!msg?.id) continue;
        const record: StoredMessageRecord = {
          cacheKey: `${acct}::${msg.id}`,
          accountEmail: acct,
          id: msg.id,
          dateIso: msg.dateIso || '',
          message: msg,
        };
        store.put(record);
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
