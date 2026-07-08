import type { CharacterInitialProfile, CharacterProfile, CharacterProfileHistoryEntry, CharacterProfileHistoryField, CharacterThemeStyleBindings, VisualProfile } from '@/types/domain';
import { normalizeVisualProfile, removeVisualProfileAvatar, toCharacterVisualProfile } from '@/utils/profile';
import { normalizeChatModelOverrides } from '@/utils/settings';
import { normalizeVoomFrequency } from '@/utils/voom';

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

export function getCharacterAiName(character: Pick<CharacterProfile, 'name' | 'nickname'>) {
  return String(character.name ?? '').trim() || String(character.nickname ?? '').trim() || '角色';
}

export function getCharacterVoomAuthorName(character: Pick<CharacterProfile, 'nickname' | 'name'>) {
  return String(character.nickname ?? '').trim() || String(character.name ?? '').trim() || 'new.friend';
}

export function getCharacterVoomDisplayName(character: Pick<CharacterProfile, 'userNote' | 'nickname' | 'name'>) {
  return getCharacterDisplayName(character);
}

function normalizeCharacterInitialProfile(initialProfile: Partial<CharacterInitialProfile> | null | undefined, fallback: CharacterInitialProfile) {
  if (!initialProfile || typeof initialProfile !== 'object') return undefined;
  const nickname = String(initialProfile.nickname ?? '').trim() || fallback.nickname;
  const signature = String(initialProfile.signature ?? '').trim() || fallback.signature;
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
      const sourceConversationId = String(record.sourceConversationId ?? '').trim();
      const sourceReplyBatchId = String(record.sourceReplyBatchId ?? '').trim();
      if (!field || previousValue === nextValue) return null;
      return {
        id: String(record.id ?? '').trim() || `profile_history_${Math.random().toString(16).slice(2)}`,
        field,
        previousValue,
        nextValue,
        createdAt: Number.isFinite(record.createdAt) ? Number(record.createdAt) : Date.now(),
        ...(sourceConversationId ? { sourceConversationId } : {}),
        ...(sourceReplyBatchId ? { sourceReplyBatchId } : {})
      };
    })
    .filter((entry): entry is CharacterProfileHistoryEntry => Boolean(entry))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function normalizeCharacterThemeStyleBindings(bindings: Partial<CharacterThemeStyleBindings> | null | undefined): CharacterThemeStyleBindings {
  return {
    onlinePresetId: String(bindings?.onlinePresetId ?? '').trim(),
    offlinePresetId: String(bindings?.offlinePresetId ?? '').trim()
  };
}

export function getCharacterInitialProfile(character: Pick<CharacterProfile, 'initialProfile' | 'nickname' | 'name'>): CharacterInitialProfile {
  const nickname = String(character.initialProfile?.nickname ?? '').trim()
    || String(character.name ?? '').trim()
    || String(character.nickname ?? '').trim()
    || 'new.friend';
  const signature = String(character.initialProfile?.signature ?? '').trim();
  return { nickname, signature };
}

export function normalizeCharacterProfile(character: CharacterProfile, fallbackUserId = ''): CharacterProfile {
  const { initialProfile: rawInitialProfile, ...characterBase } = character;
  const nickname = String(character.nickname ?? '').trim();
  const name = String(character.name ?? '').trim() || nickname || 'new.friend';
  const description = String(character.description ?? '').trim();
  const signature = String(character.signature ?? '').trim();
  const boundUserId = String(character.boundUserId ?? '').trim() || fallbackUserId;
  const localWorldBookIds = Array.isArray(character.localWorldBookIds)
    ? [...new Set(character.localWorldBookIds.filter(Boolean))]
    : [];
  const voomFrequency = normalizeVoomFrequency(character.voomFrequency);
  const mindStateLines = normalizeCharacterMindStateLines(character.mindState?.lines);
  const profileThemeContent = String(character.mindState?.profileThemeContent ?? '').trim();
  const hasProfileThemeSnapshot = Boolean(String(character.mindState?.profileThemeId ?? '').trim() || profileThemeContent);
  const profile = toCharacterVisualProfile(normalizeVisualProfile(removeVisualProfileAvatar(character.profile), {
    id: character.id,
    nickname,
    name,
    avatar: character.avatar,
    signature
  }));
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
    themeStyleBindings: normalizeCharacterThemeStyleBindings(character.themeStyleBindings),
    profile,
    ...(boundUserProfile ? { boundUserProfile } : {}),
    ...(initialProfile ? { initialProfile } : {}),
    ...(profileHistory.length ? { profileHistory } : {}),
    mindState: mindStateLines.length || hasProfileThemeSnapshot
      ? {
          lines: mindStateLines,
          profileThemeId: String(character.mindState?.profileThemeId ?? '').trim() || undefined,
          profileThemeName: String(character.mindState?.profileThemeName ?? '').trim() || undefined,
          profileThemeContent: profileThemeContent || undefined,
          profileThemeHtml: String(character.mindState?.profileThemeHtml ?? '').trim() || undefined,
          profileThemeCss: String(character.mindState?.profileThemeCss ?? '').trim() || undefined,
          updatedAt: Number.isFinite(character.mindState?.updatedAt) ? Number(character.mindState?.updatedAt) : Date.now(),
          readAt: Number.isFinite(character.mindState?.readAt) ? Number(character.mindState?.readAt) : 0,
          sourceConversationId: String(character.mindState?.sourceConversationId ?? '').trim() || undefined,
          sourceReplyBatchId: String(character.mindState?.sourceReplyBatchId ?? '').trim() || undefined
        }
      : undefined
  };
}