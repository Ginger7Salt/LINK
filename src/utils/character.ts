import type { CharacterProfile } from '@/types/domain';
import { normalizeVisualProfile } from '@/utils/profile';
import { normalizeChatModelOverrides } from '@/utils/settings';
import { normalizeVoomFrequency } from '@/utils/voom';

const defaultCharacterSignature = '这个角色还没有写个性签名。';
const maxMindStateLines = 5;

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

export function normalizeCharacterProfile(character: CharacterProfile, fallbackUserId = ''): CharacterProfile {
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

  return {
    ...character,
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