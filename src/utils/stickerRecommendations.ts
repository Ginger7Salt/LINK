import type { ChatMessage, Sticker, StickerGroup } from '@/types/domain';

export const RECOMMENDED_STICKER_GROUP_ID = 'sticker_group_recommended';
export const RECOMMENDED_STICKER_GROUP_NAME = '推荐';

interface StickerRecommendationInput {
  query: string;
  stickers: Sticker[];
  groups: StickerGroup[];
  messages: ChatMessage[];
  conversationId: string;
  boundGroupIds?: string[];
  limit?: number;
}

const synonymGroups = [
  ['笑', '哈哈', '开心', '高兴', '乐', '喜', '嘻嘻', '嘿嘿', '大笑'],
  ['哭', '难过', '委屈', '伤心', '泪', '呜呜', '可怜', '心碎'],
  ['爱', '喜欢', '亲', '亲亲', '抱', '抱抱', '贴贴', '啵', '心动'],
  ['生气', '气', '怒', '哼', '烦', '讨厌', '无语', '白眼'],
  ['尴尬', '汗', '慌', '紧张', '害羞', '脸红', '羞'],
  ['困', '睡', '晚安', '累', '疲惫', '困困'],
  ['吃', '饿', '饭', '奶茶', '咖啡', '甜', '零食'],
  ['好', '赞', '棒', '可以', 'ok', 'OK', '收到', '明白'],
  ['问', '疑问', '为什么', '怎么', '啥', '什么', '？', '?'],
  ['再见', '拜拜', '走了', '晚点', '回见']
];

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}

function createQueryTerms(query: string) {
  const normalizedQuery = normalizeText(query);
  const terms = new Set<string>();
  if (normalizedQuery) terms.add(normalizedQuery);

  const looseParts = query
    .toLocaleLowerCase()
    .split(/[\s,，.。!！?？;；:：、|｜/\\]+/)
    .map((part) => normalizeText(part))
    .filter(Boolean);
  looseParts.forEach((part) => terms.add(part));

  for (const group of synonymGroups) {
    const normalizedGroup = group.map((term) => normalizeText(term)).filter(Boolean);
    if (!normalizedGroup.some((term) => normalizedQuery.includes(term) || term.includes(normalizedQuery))) continue;
    normalizedGroup.forEach((term) => terms.add(term));
  }

  return [...terms].filter((term) => term.length > 0);
}

function createStickerSendStats(messages: ChatMessage[], conversationId: string) {
  const globalCounts = new Map<string, number>();
  const conversationCounts = new Map<string, number>();

  for (const message of messages) {
    const stickerId = message.sender === 'user' ? message.sticker?.stickerId : '';
    if (!stickerId) continue;
    globalCounts.set(stickerId, (globalCounts.get(stickerId) ?? 0) + 1);
    if (message.conversationId === conversationId) {
      conversationCounts.set(stickerId, (conversationCounts.get(stickerId) ?? 0) + 1);
    }
  }

  return { globalCounts, conversationCounts };
}

function createGroupUsageCounts(stickers: Sticker[], conversationCounts: Map<string, number>) {
  const stickerById = new Map(stickers.map((sticker) => [sticker.id, sticker]));
  const groupCounts = new Map<string, number>();
  conversationCounts.forEach((count, stickerId) => {
    const sticker = stickerById.get(stickerId);
    if (!sticker) return;
    sticker.groupIds.forEach((groupId) => groupCounts.set(groupId, (groupCounts.get(groupId) ?? 0) + count));
  });
  return groupCounts;
}

function scoreRecency(lastUsedAt?: number) {
  if (!lastUsedAt) return 0;
  const ageMs = Date.now() - lastUsedAt;
  if (ageMs < 24 * 60 * 60 * 1000) return 18;
  if (ageMs < 7 * 24 * 60 * 60 * 1000) return 12;
  if (ageMs < 30 * 24 * 60 * 60 * 1000) return 7;
  return 3;
}

function scoreTextMatch(target: string, terms: string[], fullQuery: string) {
  if (!fullQuery) return 0;
  let score = target.includes(fullQuery) ? 76 : 0;
  for (const term of terms) {
    if (term === fullQuery) continue;
    if (target.includes(term)) score += 30;
  }
  if (score > 0) return score;

  const chars = [...new Set(fullQuery)].filter((char) => target.includes(char));
  return fullQuery.length >= 2 && chars.length >= Math.min(2, fullQuery.length) ? chars.length * 5 : 0;
}

export function recommendStickers(input: StickerRecommendationInput) {
  const limit = Math.max(1, Math.floor(input.limit ?? 8));
  const query = normalizeText(input.query).slice(-24);
  const terms = createQueryTerms(input.query);
  const groupNameById = new Map(input.groups.map((group) => [group.id, normalizeText(group.name)]));
  const boundGroupIds = new Set(input.boundGroupIds ?? []);
  const { globalCounts, conversationCounts } = createStickerSendStats(input.messages, input.conversationId);
  const conversationGroupCounts = createGroupUsageCounts(input.stickers, conversationCounts);

  return input.stickers
    .map((sticker) => {
      const description = normalizeText(sticker.description);
      const groupNames = sticker.groupIds.map((groupId) => groupNameById.get(groupId) ?? '').join('');
      const descriptionScore = scoreTextMatch(description, terms, query);
      const groupNameScore = Math.round(scoreTextMatch(groupNames, terms, query) * 0.46);
      const queryScore = descriptionScore + groupNameScore;
      if (query && queryScore <= 0) return null;

      const conversationCount = conversationCounts.get(sticker.id) ?? 0;
      const globalCount = globalCounts.get(sticker.id) ?? 0;
      const groupScore = sticker.groupIds.reduce((total, groupId) => {
        const usageScore = Math.min(24, (conversationGroupCounts.get(groupId) ?? 0) * 4);
        const bindingScore = boundGroupIds.has(groupId) ? 14 : 0;
        return total + usageScore + bindingScore;
      }, 0);
      const score = queryScore
        + scoreRecency(sticker.lastUsedAt)
        + Math.sqrt(conversationCount) * 20
        + Math.sqrt(globalCount) * 8
        + groupScore;

      return { sticker, score };
    })
    .filter((entry): entry is { sticker: Sticker; score: number } => Boolean(entry && entry.score > 0))
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff) return scoreDiff;
      const usedDiff = (right.sticker.lastUsedAt ?? 0) - (left.sticker.lastUsedAt ?? 0);
      if (usedDiff) return usedDiff;
      return right.sticker.updatedAt - left.sticker.updatedAt;
    })
    .slice(0, limit)
    .map((entry) => entry.sticker);
}