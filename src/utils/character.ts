import type { CharacterInitialProfile, CharacterProfile, CharacterProfileHistoryEntry, CharacterProfileHistoryField, VisualProfile } from '@/types/domain';
import { normalizeVisualProfile } from '@/utils/profile';
import { normalizeChatModelOverrides } from '@/utils/settings';
import { normalizeVoomFrequency } from '@/utils/voom';

export const defaultNewFriendSignature = '该用户很懒，什么也没留下';
const defaultCharacterSignature = '这个角色还没有写个性签名。';
const maxMindStateLines = 5;
const profileHistoryFields = new Set<CharacterProfileHistoryField>(['nickname', 'signature', 'mood']);

export function normalizeCharacterMindStateLines(lines: unknown) {
  if (Array.isArray(lines)) {
    return lines
      .flatMap((line) => String(line ?? '').split(/\r?\n/))
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, maxMindStateLines);
  }

  if (typeof lines === 'string') {
    return lines
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, maxMindStateLines);
  }

  return [];
}

export function getCharacterDisplayName(character: Pick<CharacterProfile, 'userNote' | 'nickname' | 'name'>) {
  return String(character.userNote ?? '').trim() || String(character.nickname ?? '').trim() || String(character.name ?? '').trim() || 'new.friend';
}

export function getCharacterVoomAuthorName(character: Pick<CharacterProfile, 'userNote' | 'nickname'>) {
  return String(character.userNote ?? '').trim() || String(character.nickname ?? '').trim() || 'new.friend';
}

function normalizeCharacterInitialProfile(initialProfile: Partial<CharacterInitialProfile> | null | undefined, fallback: CharacterInitialProfile) {
  if (!initialProfile || typeof initialProfile !== 'object') return undefined;
  const nickname = String(initialProfile.nickname ?? '').trim() || fallback.nickname;
  const signature = String(initialProfile.signature ?? '').trim() || fallback.signature || defaultNewFriendSignature;
  return { nickname, signature };
}

function normalizeCharacterProfileHistory(history: unknown): CharacterProfileHistoryEntry[] {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Partial<CharacterProfileHistoryEntry> & { value?: unknown };
      const field = profileHistoryFields.has(record.field as CharacterProfileHistoryField) ? record.field as CharacterProfileHistoryField : null;
      const previousValue = String(record.previousValue ?? '').trim();
      const nextValue = String(record.nextValue ?? record.value ?? '').trim();
      if (!field || previousValue === nextValue) return null;
      return {
        id: String(record.id ?? '').trim() || `profile_history_${Math.random().toString(16).slice(2)}`,
        field,
        previousValue,
        nextValue,
        createdAt: Number.isFinite(record.createdAt) ? Number(record.createdAt) : Date.now()
      };
    })
    .filter((entry): entry is CharacterProfileHistoryEntry => Boolean(entry))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getCharacterInitialProfile(character: Pick<CharacterProfile, 'initialProfile' | 'nickname' | 'name'>): CharacterInitialProfile {
  const nickname = String(character.initialProfile?.nickname ?? '').trim()
    || String(character.name ?? '').trim()
    || String(character.nickname ?? '').trim()
    || 'new.friend';
  const signature = String(character.initialProfile?.signature ?? '').trim() || defaultNewFriendSignature;
  return { nickname, signature };
}

export function normalizeCharacterProfile(character: CharacterProfile, fallbackUserId = ''): CharacterProfile {
  const { initialProfile: rawInitialProfile, ...characterBase } = character;
  const nickname = String(character.nickname ?? '').trim() || String(character.name ?? '').trim() || 'new.friend';
  const name = String(character.name ?? '').trim() || nickname;
  const description = String(character.description ?? '').trim();
  const signature = String(character.signature ?? '').trim() || String(character.subtitle ?? '').trim() || defaultCharacterSignature;
  const boundUserId = String(character.boundUserId ?? '').trim() || fallbackUserId;
  const localWorldBookIds = Array.isArray(character.localWorldBookIds)
    ? [...new Set(character.localWorldBookIds.filter(Boolean))]
    : [];
  const voomFrequency = normalizeVoomFrequency(character.voomFrequency);
  const mindStateLines = normalizeCharacterMindStateLines(character.mindState?.lines);
  const profile = normalizeVisualProfile(character.profile, {
    id: character.id,
    nickname,
    name,
    avatar: character.avatar,
    signature
  });
  const boundUserProfile = character.boundUserProfile
    ? normalizeVisualProfile(character.boundUserProfile as Partial<VisualProfile>)
    : undefined;
  const initialProfile = normalizeCharacterInitialProfile(rawInitialProfile, { nickname, signature });
  const profileHistory = normalizeCharacterProfileHistory(character.profileHistory);

  return {
    ...characterBase,
    nickname,
    name,
    description,
    signature,
    userNote: String(character.userNote ?? '').trim(),
    boundUserId,
    subtitle: String(character.subtitle ?? '').trim() || signature,
    lastSeen: String(character.lastSeen ?? '').trim() || '现在',
    localWorldBookIds,
    voomFrequency,
    modelOverrides: normalizeChatModelOverrides(character.modelOverrides),
    profile,
    ...(boundUserProfile ? { boundUserProfile } : {}),
    ...(initialProfile ? { initialProfile } : {}),
    ...(profileHistory.length ? { profileHistory } : {}),
    mindState: mindStateLines.length
      ? {
          lines: mindStateLines,
          updatedAt: Number.isFinite(character.mindState?.updatedAt) ? Number(character.mindState?.updatedAt) : Date.now(),
          readAt: Number.isFinite(character.mindState?.readAt) ? Number(character.mindState?.readAt) : 0,
          sourceConversationId: String(character.mindState?.sourceConversationId ?? '').trim() || undefined
        }
      : undefined
  };
}