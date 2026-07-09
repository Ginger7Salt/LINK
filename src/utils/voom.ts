import type { VoomFrequency, VoomImageMode } from '@/types/domain';

export const voomFrequencyOptions: Array<{ value: VoomFrequency; label: string; chance: number }> = [
  { value: 'very-low', label: '极低', chance: 0.05 },
  { value: 'low', label: '低', chance: 0.12 },
  { value: 'medium', label: '中', chance: 0.25 },
  { value: 'high', label: '高', chance: 0.42 },
  { value: 'very-high', label: '极高', chance: 0.65 },
  { value: 'always', label: '每次', chance: 1 }
];

const voomFrequencyValues = new Set(voomFrequencyOptions.map((option) => option.value));

export function normalizeVoomFrequency(value: unknown, fallback: VoomFrequency = 'medium'): VoomFrequency {
  const frequency = String(value ?? '').trim() as VoomFrequency;
  return voomFrequencyValues.has(frequency) ? frequency : fallback;
}

export function getVoomFrequencyChance(frequency: VoomFrequency) {
  return voomFrequencyOptions.find((option) => option.value === frequency)?.chance ?? 0.25;
}

export const voomImageModeOptions: Array<{ value: VoomImageMode; label: string; description: string }> = [
  { value: 'character-choice', label: '角色自主判断', description: '由角色按当前心情和内容决定是否配图。' },
  { value: 'manual', label: '手动配图策略', description: '由你决定是否配图，并设置出现频率。' }
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripVoomCommentReplyPrefix(content: string, targetName = '') {
  let normalized = content.trim();
  const target = targetName.trim();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const previous = normalized;
    if (target) {
      const escapedTarget = escapeRegExp(target);
      normalized = normalized
        .replace(new RegExp(`^(?:回复\\s*)+${escapedTarget}\\s*[：:，,、-]?\\s*`, 'u'), '')
        .replace(new RegExp(`^@${escapedTarget}\\s*[：:，,、-]?\\s*`, 'u'), '')
        .trim();
    }
    normalized = normalized
      .replace(/^(?:回复\s*){2,}/u, '回复 ')
      .replace(/^回复\s+[^：:，,、\s]{1,24}\s*[：:，,、-]+\s*/u, '')
      .replace(/^@[^：:，,、\s]{1,24}\s*[：:，,、-]?\s*/u, '')
      .trim();
    if (normalized === previous) break;
  }

  return normalized || content.trim();
}