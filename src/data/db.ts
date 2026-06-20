import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { toRaw } from 'vue';
import type { AppSettings, AppSnapshot, CharacterProfile, ChatMessage, Conversation, ConversationMemoryRecord, ConversationSettings, GeneratedImageRecord, Sticker, StickerGroup, UserProfile, VoomPost, WorldBookEntry } from '@/types/domain';
import { normalizeUserProfile } from '@/utils/profile';
import { normalizeAppSettings } from '@/utils/settings';
import { normalizeWorldBooks } from '@/utils/worldBook';
import { defaultCharacters, defaultConversations, defaultMessages, defaultSettings, defaultStickerGroups, defaultStickers, defaultUsers, defaultVoomPosts, defaultWorldBooks } from './seed';

interface LinkDb extends DBSchema {
  user: { key: string; value: UserProfile };
  characters: { key: string; value: CharacterProfile };
  conversations: { key: string; value: Conversation; indexes: { byChar: string } };
  messages: { key: string; value: ChatMessage; indexes: { byConversation: string } };
  voomPosts: { key: string; value: VoomPost; indexes: { byChar: string; byConversation: string } };
  worldBooks: { key: string; value: WorldBookEntry; indexes: { byScope: string } };
  stickerGroups: { key: string; value: StickerGroup };
  stickers: { key: string; value: Sticker };
  conversationSettings: { key: string; value: ConversationSettings };
  conversationMemories: { key: string; value: ConversationMemoryRecord; indexes: { byConversation: string } };
  generatedImages: { key: string; value: GeneratedImageRecord; indexes: { byProvider: string; byCreatedAt: number } };
  settings: { key: string; value: AppSettings };
}

let dbPromise: Promise<IDBPDatabase<LinkDb>> | undefined;

const storeNames = ['user', 'characters', 'conversations', 'messages', 'voomPosts', 'worldBooks', 'stickerGroups', 'stickers', 'conversationSettings', 'conversationMemories', 'generatedImages', 'settings'] as const;
const legacyDefaultUserIds = new Set(['1008600002']);
const legacyDefaultCharacterIds = new Set(['2000100001', '2000100002', '2000100003']);
const legacyDefaultConversationIds = new Set(['conv_2000100001', 'conv_2000100002', 'conv_2000100003']);
const legacyDefaultWorldBookIds = new Set(['wb_global_online', 'wb_global_offline', 'wb_local_campus', 'wb_local_art', 'wb_local_tokyo']);
const legacyDefaultVoomPostIds = new Set(['voom_seed_1']);

export function getDb() {
  dbPromise ??= openDB<LinkDb>('link-local-db', 5, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains('user')) db.createObjectStore('user', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('characters')) db.createObjectStore('characters', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('conversations')) {
        const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
        conversationStore.createIndex('byChar', 'charId');
      }
      if (!db.objectStoreNames.contains('messages')) {
        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
        messageStore.createIndex('byConversation', 'conversationId');
      }
      if (!db.objectStoreNames.contains('voomPosts')) {
        const voomStore = db.createObjectStore('voomPosts', { keyPath: 'id' });
        voomStore.createIndex('byChar', 'charId');
        voomStore.createIndex('byConversation', 'conversationId');
      }
      if (!db.objectStoreNames.contains('worldBooks')) {
        const worldBookStore = db.createObjectStore('worldBooks', { keyPath: 'id' });
        worldBookStore.createIndex('byScope', 'scope');
      }
      if (!db.objectStoreNames.contains('stickerGroups')) db.createObjectStore('stickerGroups', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('stickers')) db.createObjectStore('stickers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('conversationSettings')) db.createObjectStore('conversationSettings', { keyPath: 'conversationId' });
      if (!db.objectStoreNames.contains('conversationMemories')) {
        const memoryStore = db.createObjectStore('conversationMemories', { keyPath: 'id' });
        memoryStore.createIndex('byConversation', 'conversationId');
      }
      if (!db.objectStoreNames.contains('generatedImages')) {
        const generatedImageStore = db.createObjectStore('generatedImages', { keyPath: 'id' });
        generatedImageStore.createIndex('byProvider', 'provider');
        generatedImageStore.createIndex('byCreatedAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');

      if (oldVersion < 4) {
        const stickerGroupStore = transaction.objectStore('stickerGroups');
        const stickerStore = transaction.objectStore('stickers');
        defaultStickerGroups.forEach((group) => {
          void stickerGroupStore.put(group);
        });
        defaultStickers.forEach((sticker) => {
          void stickerStore.put(sticker);
        });
      }
    }
  });
  return dbPromise;
}

export async function seedDatabase() {
  const db = await getDb();
  const existingUser = await db.get('user', defaultUsers[0].id);
  if (existingUser) return;

  const tx = db.transaction(['user', 'characters', 'conversations', 'messages', 'voomPosts', 'worldBooks', 'stickerGroups', 'stickers', 'conversationSettings', 'conversationMemories', 'generatedImages', 'settings'], 'readwrite');
  await Promise.all(defaultUsers.map((user) => tx.objectStore('user').put(user)));
  await Promise.all(defaultCharacters.map((character) => tx.objectStore('characters').put(character)));
  await Promise.all(defaultConversations.map((conversation) => tx.objectStore('conversations').put(conversation)));
  await Promise.all(defaultMessages.map((message) => tx.objectStore('messages').put(message)));
  await Promise.all(defaultVoomPosts.map((post) => tx.objectStore('voomPosts').put(post)));
  await Promise.all(defaultWorldBooks.map((entry) => tx.objectStore('worldBooks').put(entry)));
  await Promise.all(defaultStickerGroups.map((entry) => tx.objectStore('stickerGroups').put(entry)));
  await Promise.all(defaultStickers.map((entry) => tx.objectStore('stickers').put(entry)));
  await tx.objectStore('settings').put(defaultSettings, 'main');
  await tx.done;
}

async function pruneLegacyDefaultData() {
  const db = await getDb();
  const tx = db.transaction(storeNames, 'readwrite');
  const userStore = tx.objectStore('user');
  const messageStore = tx.objectStore('messages');
  const voomStore = tx.objectStore('voomPosts');
  const memoryStore = tx.objectStore('conversationMemories');
  const settingsStore = tx.objectStore('settings');
  const [users, messages, voomPosts, conversationMemories, settings] = await Promise.all([
    userStore.getAll(),
    messageStore.getAll(),
    voomStore.getAll(),
    memoryStore.getAll(),
    settingsStore.get('main')
  ]);

  users.forEach((user) => {
    if (legacyDefaultUserIds.has(user.id)) {
      void userStore.delete(user.id);
      return;
    }

    const boundCharacterIds = user.boundCharacterIds.filter((id) => !legacyDefaultCharacterIds.has(id));
    if (boundCharacterIds.length !== user.boundCharacterIds.length) {
      void userStore.put({ ...user, boundCharacterIds });
    }
  });

  legacyDefaultCharacterIds.forEach((id) => void tx.objectStore('characters').delete(id));
  legacyDefaultConversationIds.forEach((id) => {
    void tx.objectStore('conversations').delete(id);
    void tx.objectStore('conversationSettings').delete(id);
  });
  legacyDefaultWorldBookIds.forEach((id) => void tx.objectStore('worldBooks').delete(id));
  messages
    .filter((message) => legacyDefaultConversationIds.has(message.conversationId))
    .forEach((message) => void messageStore.delete(message.id));
  voomPosts
    .filter((post) => legacyDefaultVoomPostIds.has(post.id) || legacyDefaultCharacterIds.has(post.charId) || (post.conversationId && legacyDefaultConversationIds.has(post.conversationId)))
    .forEach((post) => void voomStore.delete(post.id));
  conversationMemories
    .filter((memory) => legacyDefaultConversationIds.has(memory.conversationId))
    .forEach((memory) => void memoryStore.delete(memory.id));

  if (settings && legacyDefaultUserIds.has(settings.activeUserId)) {
    void settingsStore.put({ ...settings, activeUserId: defaultSettings.activeUserId }, 'main');
  }

  await tx.done;
}

export async function loadSnapshot() {
  await seedDatabase();
  await pruneLegacyDefaultData();
  const db = await getDb();
  const [users, characters, conversations, messages, voomPosts, worldBooks, stickerGroups, stickers, conversationSettings, conversationMemories, generatedImages, settings] = await Promise.all([
    db.getAll('user'),
    db.getAll('characters'),
    db.getAll('conversations'),
    db.getAll('messages'),
    db.getAll('voomPosts'),
    db.getAll('worldBooks'),
    db.getAll('stickerGroups'),
    db.getAll('stickers'),
    db.getAll('conversationSettings'),
    db.getAll('conversationMemories'),
    db.getAll('generatedImages'),
    db.get('settings', 'main')
  ]);

  return {
    users: users.map((user) => normalizeUserProfile(user)),
    characters,
    conversations,
    messages,
    voomPosts,
    worldBooks: normalizeWorldBooks(worldBooks),
    stickerGroups,
    stickers,
    conversationSettings,
    conversationMemories,
    generatedImages,
    settings: normalizeAppSettings(settings ?? defaultSettings)
  };
}

export async function replaceSnapshot(snapshot: AppSnapshot) {
  const db = await getDb();
  const tx = db.transaction(storeNames, 'readwrite');

  const userStore = tx.objectStore('user');
  void userStore.clear();
  snapshot.users.forEach((entry) => void userStore.put(toPersistableValue(entry)));

  const characterStore = tx.objectStore('characters');
  void characterStore.clear();
  snapshot.characters.forEach((entry) => void characterStore.put(toPersistableValue(entry)));

  const conversationStore = tx.objectStore('conversations');
  void conversationStore.clear();
  snapshot.conversations.forEach((entry) => void conversationStore.put(toPersistableValue(entry)));

  const messageStore = tx.objectStore('messages');
  void messageStore.clear();
  snapshot.messages.forEach((entry) => void messageStore.put(toPersistableValue(entry)));

  const voomStore = tx.objectStore('voomPosts');
  void voomStore.clear();
  snapshot.voomPosts.forEach((entry) => void voomStore.put(toPersistableValue(entry)));

  const worldBookStore = tx.objectStore('worldBooks');
  void worldBookStore.clear();
  snapshot.worldBooks.forEach((entry) => void worldBookStore.put(toPersistableValue(entry)));

  const stickerGroupStore = tx.objectStore('stickerGroups');
  void stickerGroupStore.clear();
  snapshot.stickerGroups.forEach((entry) => void stickerGroupStore.put(toPersistableValue(entry)));

  const stickerStore = tx.objectStore('stickers');
  void stickerStore.clear();
  snapshot.stickers.forEach((entry) => void stickerStore.put(toPersistableValue(entry)));

  const conversationSettingsStore = tx.objectStore('conversationSettings');
  void conversationSettingsStore.clear();
  snapshot.conversationSettings.forEach((entry) => void conversationSettingsStore.put(toPersistableValue(entry)));

  const conversationMemoryStore = tx.objectStore('conversationMemories');
  void conversationMemoryStore.clear();
  snapshot.conversationMemories.forEach((entry) => void conversationMemoryStore.put(toPersistableValue(entry)));

  const generatedImageStore = tx.objectStore('generatedImages');
  void generatedImageStore.clear();
  (snapshot.generatedImages ?? []).forEach((entry) => void generatedImageStore.put(toPersistableValue(entry)));

  const settingsStore = tx.objectStore('settings');
  void settingsStore.clear();
  void settingsStore.put(toPersistableValue(snapshot.settings), 'main');

  await tx.done;
}

type StoreName = typeof storeNames[number];

function toPersistableValue<T>(value: T): T {
  return stripVueProxy(value, new WeakMap()) as T;
}

function stripVueProxy(value: unknown, seen: WeakMap<object, unknown>): unknown {
  const rawValue = toRaw(value);
  if (!rawValue || typeof rawValue !== 'object') return rawValue;

  if (rawValue instanceof Date) return new Date(rawValue);
  if (rawValue instanceof Blob) return rawValue;
  if (rawValue instanceof ArrayBuffer) return rawValue.slice(0);
  if (ArrayBuffer.isView(rawValue)) return rawValue;

  const cachedValue = seen.get(rawValue);
  if (cachedValue) return cachedValue;

  if (Array.isArray(rawValue)) {
    const nextValue: unknown[] = [];
    seen.set(rawValue, nextValue);
    rawValue.forEach((entry) => nextValue.push(stripVueProxy(entry, seen)));
    return nextValue;
  }

  if (rawValue instanceof Map) {
    const nextValue = new Map<unknown, unknown>();
    seen.set(rawValue, nextValue);
    rawValue.forEach((entryValue, entryKey) => {
      nextValue.set(stripVueProxy(entryKey, seen), stripVueProxy(entryValue, seen));
    });
    return nextValue;
  }

  if (rawValue instanceof Set) {
    const nextValue = new Set<unknown>();
    seen.set(rawValue, nextValue);
    rawValue.forEach((entry) => nextValue.add(stripVueProxy(entry, seen)));
    return nextValue;
  }

  const prototype = Object.getPrototypeOf(rawValue);
  if (prototype !== Object.prototype && prototype !== null) return rawValue;

  const nextValue: Record<string, unknown> = {};
  seen.set(rawValue, nextValue);
  Object.entries(rawValue).forEach(([key, entry]) => {
    nextValue[key] = stripVueProxy(entry, seen);
  });
  return nextValue;
}

export async function putEntity<TStore extends StoreName>(storeName: TStore, value: LinkDb[TStore]['value'], key?: LinkDb[TStore]['key']) {
  const db = await getDb();
  const persistableValue = toPersistableValue(value);
  if (key !== undefined) {
    await db.put(storeName, persistableValue as never, key as never);
    return;
  }
  await db.put(storeName, persistableValue as never);
}

export async function deleteEntity<TStore extends StoreName>(storeName: TStore, key: LinkDb[TStore]['key']) {
  const db = await getDb();
  await db.delete(storeName, key as never);
}