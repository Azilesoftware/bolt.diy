import type { Message } from 'ai';
import type { ChatHistory } from './useChatHistory';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatHistory');

// this is used at the top level and never rejects
export async function openDatabase(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    const request = indexedDB.open('boltHistory', 1);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('chats')) {
        const store = db.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('id', 'id', { unique: true });
        store.createIndex('urlId', 'urlId', { unique: true });
      }
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event: Event) => {
      resolve(undefined);
      logger.error((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function setMessages(
  db: IDBDatabase,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');

    const request = store.put({
      id,
      messages,
      urlId,
      description,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMessages(db: IDBDatabase, id: string): Promise<ChatHistory> {
  return (await getMessagesById(db, id)) || (await getMessagesByUrlId(db, id));
}

export async function getMessagesByUrlId(db: IDBDatabase, id: string): Promise<ChatHistory> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('urlId');
    const request = index.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistory);
    request.onerror = () => reject(request.error);
  });
}

export async function getMessagesById(db: IDBDatabase, id: string): Promise<ChatHistory> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistory);
    request.onerror = () => reject(request.error);
  });
}

export async function getNextId(db: IDBDatabase): Promise<string> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.count();

    request.onsuccess = () => resolve(String(request.result));
    request.onerror = () => reject(request.error);
  });
}

export async function getUrlId(db: IDBDatabase, id: string): Promise<string> {
  const idList = await getUrlIds(db);

  if (!idList.includes(id)) {
    return id;
  } else {
    let i = 2;

    while (idList.includes(`${id}-${i}`)) {
      i++;
    }

    return `${id}-${i}`;
  }
}

async function getUrlIds(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const idList: string[] = [];

    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (cursor) {
        idList.push(cursor.value.urlId);
        cursor.continue();
      } else {
        resolve(idList);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}