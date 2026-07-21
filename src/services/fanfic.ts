import { generateImageByProvider, hasTextGenerationConfig, requestTextGeneration } from '@/services/ai';
import type {
  AppSettings,
  CharacterProfile,
  FanficBook,
  FanficChapter,
  FanficComment,
  FanficCreativeDna,
  FanficOutlineChapter,
  FanficStoryBible,
  FanficTopic,
  UserProfile
} from '@/types/domain';
import { createId } from '@/utils/id';
import { defaultFanficStoryBible, normalizeFanficCreativeDna } from '@/utils/fanfic';
import { getSelectedImageModelOption } from '@/utils/settings';

export interface FanficCreationPreferences {
  tone: string;
  pov: string;
  endingPreference: string;
  chapterTarget: number;
  contentBoundaries: string[];
  extraGuidance: string;
}

export interface FanficBookPlan {
  title: string;
  authorName: string;
  summary: string;
  genre: string;
  tags: string[];
  topicPitch: string;
  tone: string;
  pov: string;
  endingPreference: string;
  contentBoundaries: string[];
  coverPrompt: string;
  coverPalette: string[];
  storyBible: FanficStoryBible;
  outline: FanficOutlineChapter[];
}

export interface FanficChapterBundle {
  chapter: FanficChapter;
  comments: FanficComment[];
  bookComments: FanficComment[];
}

interface RawChapterBundle {
  chapter?: {
    title?: unknown;
    paragraphs?: unknown;
    summary?: unknown;
    continuity?: unknown;
    hotspots?: unknown;
    nextDirections?: unknown;
  };
  comments?: unknown;
  bookComments?: unknown;
}

const commentNames = ['凌晨四点半', '栗子拿铁', '慢慢读信', '盐汽水气泡', '纸页留白', '小岛来信', '雾里看灯', '晚风第七页', '青柚苏打', '折一枝月光', '匿名候车人', '冬日软糖'];
const fallbackTrendKeywords = ['慢热救赎', '悬疑求生', '网恋掉马', '时间循环', '群像成长', '先婚后爱', '科幻末世', '古风权谋'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asString(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function asStringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => asString(entry)).filter(Boolean))].slice(0, limit);
}

function extractJsonContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const objectStart = candidate.indexOf('{');
  const objectEnd = candidate.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) return candidate.slice(objectStart, objectEnd + 1);
  const arrayStart = candidate.indexOf('[');
  const arrayEnd = candidate.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) return candidate.slice(arrayStart, arrayEnd + 1);
  return candidate;
}

function parseJson(content: string) {
  try {
    return JSON.parse(extractJsonContent(content)) as unknown;
  } catch {
    throw new Error('文本模型没有返回完整的同人文 JSON，请重试或更换上下文能力更强的模型。');
  }
}

function countFanficCharacters(content: string) {
  return [...content.replace(/\s+/g, '')].length;
}

function normalizeChapterTarget(value: number) {
  const target = Math.round(Number(value) || 12);
  return Math.min(30, Math.max(4, target));
}

function normalizePalette(value: unknown) {
  const colors = asStringArray(value, 3).filter((entry) => /^#[0-9a-f]{6}$/i.test(entry));
  return [...colors, '#f2d7d9', '#dce7de', '#f8f1e4'].slice(0, 3);
}

function normalizeStoryBible(value: unknown): FanficStoryBible {
  const source = isRecord(value) ? value : {};
  const supportingCharacters = Array.isArray(source.supportingCharacters)
    ? source.supportingCharacters.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const name = asString(entry.name);
        if (!name) return [];
        return [{
          name,
          role: asString(entry.role, '重要配角'),
          goal: asString(entry.goal),
          secret: asString(entry.secret)
        }];
      }).slice(0, 8)
    : [];
  return {
    ...defaultFanficStoryBible(),
    premise: asString(source.premise),
    era: asString(source.era, '架空当代'),
    locations: asStringArray(source.locations, 8),
    worldRules: asStringArray(source.worldRules, 10),
    supportingCharacters,
    relationshipArc: asString(source.relationshipArc),
    coreMystery: asString(source.coreMystery),
    motifs: asStringArray(source.motifs, 6)
  };
}

function normalizeOutline(value: unknown, chapterTarget: number, topic: FanficTopic): FanficOutlineChapter[] {
  const rawOutline = Array.isArray(value) ? value : [];
  const outline = rawOutline.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const order = index + 1;
    return [{
      order,
      title: asString(entry.title, `第${order}章`),
      premise: asString(entry.premise, topic.hook),
      emotionalBeat: asString(entry.emotionalBeat, topic.relationship),
      cliffhanger: asString(entry.cliffhanger, '留下一个推动下一章的新问题。')
    }];
  }).slice(0, chapterTarget);
  while (outline.length < chapterTarget) {
    const order = outline.length + 1;
    outline.push({
      order,
      title: `第${order}章`,
      premise: order === chapterTarget ? '完成核心冲突并回应主要伏笔。' : '沿核心冲突推进新的原创事件。',
      emotionalBeat: order === chapterTarget ? '双方完成关系选择。' : '双方关系在合作与分歧中向前一步。',
      cliffhanger: order === chapterTarget ? '留下有余韵但完整的结尾。' : '出现新的事实或选择。'
    });
  }
  return outline;
}

function creativeDnaForWriter(dna: FanficCreativeDna) {
  return {
    userTraits: dna.userTraits,
    characterTraits: dna.characterTraits,
    chemistry: dna.chemistry,
    narrativeBoundaries: dna.narrativeBoundaries
  };
}

export async function distillFanficCreativeDna(input: {
  user: UserProfile;
  character: CharacterProfile;
  userName: string;
  characterName: string;
  settings?: AppSettings;
}) {
  const prompt = [
    '你是原创小说的人物气质提炼器。只做抽象提炼，不写故事。',
    '下面两份资料只允许用于判断人格倾向、价值观、表达节奏和两人可能形成的关系化学反应。',
    '严禁把资料里的职业、年龄、时代、地点、组织、家庭、社会关系、能力、经历、事件、口头禅、原句、世界观带入输出。',
    `用户唯一真名：${input.userName}`,
    `角色唯一真名：${input.characterName}`,
    `用户资料：${input.user.description || '未填写'}`,
    `角色资料：${input.character.description || '未填写'}`,
    '输出 JSON：{"userTraits":[3-6个抽象短语],"characterTraits":[3-6个抽象短语],"chemistry":[3-6个关系动力短语],"narrativeBoundaries":[创作边界],"forbiddenCarryovers":[资料中不得复用的专有名词、职业、地点、经历或能力，使用短词列出]}。',
    'userTraits、characterTraits、chemistry 不得连续复制资料中 8 个以上汉字；除双方真名外不要输出资料中的完整句子。只输出 JSON。'
  ].join('\n\n');
  const reply = await requestTextGeneration(input.settings, prompt, '', { temperature: 0.35, maxTokens: 1400 });
  const parsed = parseJson(reply);
  return normalizeFanficCreativeDna(isRecord(parsed) ? parsed : {});
}

export async function generateFanficBookPlan(input: {
  userName: string;
  characterName: string;
  creativeDna: FanficCreativeDna;
  topic: FanficTopic;
  preferences: FanficCreationPreferences;
  settings?: AppSettings;
}): Promise<FanficBookPlan> {
  const chapterTarget = normalizeChapterTarget(input.preferences.chapterTarget);
  const prompt = [
    '你是原创长篇小说策划编辑。创建一部全新平行世界小说，唯一双主角必须是用户真名与角色真名。',
    `双主角真名：${input.userName}、${input.characterName}。只能使用这两个真名指代双主角，不得创造替代名、网名或沿用任何旧称呼。`,
    `抽象人物 DNA：${JSON.stringify(creativeDnaForWriter(input.creativeDna))}`,
    `题材：${JSON.stringify({ title: input.topic.title, hook: input.topic.hook, setting: input.topic.setting, conflict: input.topic.conflict, relationship: input.topic.relationship, tags: input.topic.tags })}`,
    `创作偏好：${JSON.stringify({ ...input.preferences, chapterTarget })}`,
    '原创铁律：所有时代、地点、职业、身份、能力、组织、家庭、相识过程、共同经历、事件、台词和世界规则都必须从零原创；不得引用任何既有作品、真实作者、明星、IP 或原人物设定。',
    '双方必须同等重要，每章都要推动两人的行动线或关系线；配角只能服务于双主角主线。不要模仿任何真实作者文风。',
    `规划恰好 ${chapterTarget} 章，每章约 2500 字。第一章需要高概念开场，中段持续升级，最后一章完成主要冲突。`,
    '输出严格 JSON：{"title":"原创小说名","authorName":"虚构笔名","summary":"120-220字简介","genre":"类型","tags":[4-7个],"topicPitch":"一句话卖点","tone":"基调","pov":"叙事视角","endingPreference":"结局倾向","contentBoundaries":[边界],"coverPrompt":"不含文字和真人肖像的英文封面底图提示词","coverPalette":[三个#RRGGBB],"storyBible":{"premise":"核心前提","era":"原创时代","locations":[地点],"worldRules":[规则],"supportingCharacters":[{"name":"原创配角真名","role":"作用","goal":"目标","secret":"秘密"}],"relationshipArc":"关系弧线","coreMystery":"核心问题","motifs":[意象]},"outline":[{"order":1,"title":"章名","premise":"本章事件","emotionalBeat":"情感节拍","cliffhanger":"章末钩子"}]}。只输出 JSON。'
  ].join('\n\n');
  const reply = await requestTextGeneration(input.settings, prompt, '', { temperature: 0.9, maxTokens: Math.min(7000, 2200 + chapterTarget * 240) });
  const parsed = parseJson(reply);
  if (!isRecord(parsed)) throw new Error('小说规划返回格式无效。');
  const title = asString(parsed.title);
  if (!title) throw new Error('小说规划缺少书名。');
  const authorNameCandidate = asString(parsed.authorName, '雾灯编辑部');
  const blockedNames = new Set([input.userName, input.characterName]);
  const authorName = blockedNames.has(authorNameCandidate) ? '雾灯编辑部' : authorNameCandidate;
  return {
    title,
    authorName,
    summary: asString(parsed.summary, input.topic.hook),
    genre: asString(parsed.genre, input.topic.tags[0] || '原创故事'),
    tags: asStringArray(parsed.tags, 8),
    topicPitch: asString(parsed.topicPitch, input.topic.hook),
    tone: asString(parsed.tone, input.preferences.tone),
    pov: asString(parsed.pov, input.preferences.pov),
    endingPreference: asString(parsed.endingPreference, input.preferences.endingPreference),
    contentBoundaries: asStringArray(parsed.contentBoundaries, 12).length ? asStringArray(parsed.contentBoundaries, 12) : input.preferences.contentBoundaries,
    coverPrompt: asString(parsed.coverPrompt, `editorial book cover, ${input.topic.setting}, two symbolic silhouettes, Korean indie magazine aesthetic, no text`),
    coverPalette: normalizePalette(parsed.coverPalette),
    storyBible: normalizeStoryBible(parsed.storyBible),
    outline: normalizeOutline(parsed.outline, chapterTarget, input.topic)
  };
}

function normalizeRawComments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const content = asString(entry.content);
    if (!content) return [];
    return [{
      hotspotKey: asString(entry.hotspotKey),
      authorName: asString(entry.authorName, commentNames[index % commentNames.length]),
      content,
      replyTo: Number.isInteger(Number(entry.replyTo)) ? Number(entry.replyTo) : -1,
      likes: Math.min(9999, Math.max(0, Math.round(Number(entry.likes) || 0)))
    }];
  }).slice(0, 30);
}

function createFallbackChapterComments(book: FanficBook, chapter: FanficChapter): FanficComment[] {
  const hotspots = chapter.hotspots.length ? chapter.hotspots : [{ id: '', label: '本章高潮', excerpt: chapter.paragraphs.at(-1)?.text.slice(0, 46) || chapter.title }];
  const now = Date.now();
  return hotspots.flatMap((hotspot, hotspotIndex) => [
    `这里的“${hotspot.excerpt.slice(0, 28)}”真的一下把前面的情绪都收紧了。`,
    `${book.userName}和${book.characterName}明明都在保护对方，选择的方法却完全相反，太会拉扯了。`,
    `回头看本章开头，原来这个高潮早就埋了细节，下一章一定还会反转。`,
    `不是单纯为了刺激，高潮之后两个人的关系确实往前走了一步。`
  ].map((content, commentIndex) => ({
    id: createId('fanfic_comment'),
    bookId: book.id,
    chapterId: chapter.id,
    hotspotId: hotspot.id || undefined,
    scope: 'chapter' as const,
    authorType: 'generated' as const,
    authorName: commentNames[(hotspotIndex * 4 + commentIndex) % commentNames.length],
    avatarSeed: `fanfic-reader-${hotspotIndex}-${commentIndex}`,
    content,
    likes: 7 + hotspotIndex * 9 + commentIndex * 3,
    createdAt: now + hotspotIndex * 20 + commentIndex
  })));
}

function createFallbackBookComments(book: FanficBook, chapter: FanficChapter): FanficComment[] {
  const contents = [
    `封面和书名很有完整作品的感觉，${book.userName}与${book.characterName}这个全新世界开得很稳。`,
    `第一章没有急着解释所有规则，悬念和人物关系是一起推进的。`,
    `喜欢双方都是真正主角，不是谁围着谁转，期待后面的关系弧线。`,
    `简介里的核心冲突已经在《${chapter.title}》落地了，准备追更。`
  ];
  const now = Date.now();
  return contents.map((content, index) => ({
    id: createId('fanfic_comment'),
    bookId: book.id,
    scope: 'book',
    authorType: 'generated',
    authorName: commentNames[(index + 5) % commentNames.length],
    avatarSeed: `fanfic-book-reader-${index}`,
    content,
    likes: 12 + index * 8,
    createdAt: now + index
  }));
}

function normalizeChapterBundle(raw: RawChapterBundle, input: { book: FanficBook; order: number; includeBookComments: boolean }): FanficChapterBundle {
  const rawChapter = isRecord(raw.chapter) ? raw.chapter : {};
  const paragraphTexts = asStringArray(rawChapter.paragraphs, 60);
  if (paragraphTexts.length < 6) throw new Error('章节正文不完整，请重试。');
  const chapterId = createId('fanfic_chapter');
  const now = Date.now();
  const paragraphs = paragraphTexts.map((text, index) => ({ id: `${chapterId}_p${index + 1}`, text }));
  const rawHotspots = Array.isArray(rawChapter.hotspots) ? rawChapter.hotspots : [];
  const hotspotKeyToId = new Map<string, string>();
  const hotspots = rawHotspots.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const requestedIndex = Math.round(Number(entry.paragraphIndex) || 0) - 1;
    const paragraphIndex = Math.min(paragraphs.length - 1, Math.max(0, requestedIndex >= 0 ? requestedIndex : paragraphs.length - 1));
    const paragraph = paragraphs[paragraphIndex];
    const id = createId('fanfic_hotspot');
    hotspotKeyToId.set(asString(entry.key, `hotspot-${index + 1}`), id);
    return [{
      id,
      paragraphId: paragraph.id,
      label: asString(entry.label, `高潮 ${index + 1}`),
      excerpt: asString(entry.excerpt, paragraph.text.slice(0, 64)),
      reason: asString(entry.reason, '本章情绪或剧情转折点。'),
      commentCount: 0
    }];
  }).slice(0, 3);
  if (!hotspots.length) {
    const paragraph = paragraphs[Math.max(0, paragraphs.length - 2)];
    const id = createId('fanfic_hotspot');
    hotspotKeyToId.set('hotspot-1', id);
    hotspots.push({ id, paragraphId: paragraph.id, label: '本章高潮', excerpt: paragraph.text.slice(0, 64), reason: '本章主要转折点。', commentCount: 0 });
  }
  const content = paragraphs.map((paragraph) => paragraph.text).join('\n\n');
  const chapter: FanficChapter = {
    id: chapterId,
    bookId: input.book.id,
    order: input.order,
    title: asString(rawChapter.title, input.book.outline[input.order - 1]?.title || `第${input.order}章`),
    content,
    paragraphs,
    summary: asString(rawChapter.summary, content.slice(0, 180)),
    continuity: asStringArray(rawChapter.continuity, 16),
    hotspots,
    nextDirections: asStringArray(rawChapter.nextDirections, 3),
    wordCount: countFanficCharacters(content),
    status: 'published',
    model: '',
    createdAt: now,
    updatedAt: now
  };
  const blockedAuthorNames = new Set([input.book.userName, input.book.characterName]);
  const rawComments = normalizeRawComments(raw.comments);
  const generatedCommentIds = rawComments.map(() => createId('fanfic_comment'));
  let comments: FanficComment[] = rawComments.map((entry, index) => ({
    id: generatedCommentIds[index],
    bookId: input.book.id,
    chapterId,
    hotspotId: hotspotKeyToId.get(entry.hotspotKey) || hotspots[index % hotspots.length]?.id,
    scope: 'chapter',
    authorType: 'generated',
    authorName: blockedAuthorNames.has(entry.authorName) ? commentNames[index % commentNames.length] : entry.authorName,
    avatarSeed: `fanfic-reader-${entry.authorName}-${index}`,
    content: entry.content,
    parentId: entry.replyTo >= 0 && entry.replyTo < index ? generatedCommentIds[entry.replyTo] : undefined,
    likes: entry.likes,
    createdAt: now + index
  }));
  if (comments.length < 8) comments = createFallbackChapterComments(input.book, chapter);
  const commentCountByHotspot = new Map<string, number>();
  comments.forEach((comment) => {
    if (!comment.hotspotId) return;
    commentCountByHotspot.set(comment.hotspotId, (commentCountByHotspot.get(comment.hotspotId) ?? 0) + 1);
  });
  chapter.hotspots = chapter.hotspots.map((hotspot) => ({ ...hotspot, commentCount: commentCountByHotspot.get(hotspot.id) ?? 0 }));

  const rawBookComments = input.includeBookComments ? normalizeRawComments(raw.bookComments) : [];
  let bookComments: FanficComment[] = rawBookComments.map((entry, index) => ({
    id: createId('fanfic_comment'),
    bookId: input.book.id,
    scope: 'book',
    authorType: 'generated',
    authorName: blockedAuthorNames.has(entry.authorName) ? commentNames[(index + 4) % commentNames.length] : entry.authorName,
    avatarSeed: `fanfic-book-reader-${entry.authorName}-${index}`,
    content: entry.content,
    likes: entry.likes,
    createdAt: now + index
  }));
  if (input.includeBookComments && bookComments.length < 4) bookComments = createFallbackBookComments(input.book, chapter);
  return { chapter, comments, bookComments };
}

function buildChapterPrompt(input: {
  book: FanficBook;
  order: number;
  previousChapters: FanficChapter[];
  direction?: string;
  strictLength?: boolean;
  includeBookComments: boolean;
}) {
  const outline = input.book.outline[input.order - 1];
  const previousContext = input.previousChapters.slice(-3).map((chapter) => ({ order: chapter.order, title: chapter.title, summary: chapter.summary, continuity: chapter.continuity }));
  return [
    '你是原创中文小说作者兼评论区编辑。一次性生成一章完整正文、该章高潮锚点、对应章评；如果是第一章，同时生成整本书的首批书评。',
    `唯一双主角真名：${input.book.userName}、${input.book.characterName}。两人必须拥有同等叙事重量；不得使用昵称、替代名或让配角成为主角。`,
    `抽象人物 DNA：${JSON.stringify(creativeDnaForWriter(input.book.creativeDna))}`,
    `本书原创世界圣经：${JSON.stringify(input.book.storyBible)}`,
    `本书信息：${JSON.stringify({ title: input.book.title, summary: input.book.summary, tone: input.book.tone, pov: input.book.pov, endingPreference: input.book.endingPreference, contentBoundaries: input.book.contentBoundaries })}`,
    `本章序号：${input.order}；本章大纲：${JSON.stringify(outline ?? {})}`,
    `前文摘要与连续性：${JSON.stringify(previousContext)}；全书事实账本：${JSON.stringify(input.book.continuity)}`,
    input.direction?.trim() ? `用户选择的发展方向：${input.direction.trim()}` : '发展方向：严格沿本章大纲自然推进。',
    `正文要求：去除空白后目标 2500 个中文字符，允许范围 ${input.strictLength ? '2300-2750' : '2200-2850'}；分成 16-28 个自然段。不能用梗概、列表、章节预告代替正文。`,
    '剧情要求：本章必须有完整的小目标、升级过程和明确高潮；双主角都要主动行动；高潮必须改变事实或关系；结尾留下下一章可接续的具体钩子。',
    '原创要求：只使用本书世界圣经，不得引入任何原角色背景、聊天经历、世界书、现实明星、真实作者、现成 IP 或榜单作品元素。不得解释创作规则。',
    '章评要求：选择 2-3 个真正的高潮自然段，每个高潮生成 4-7 条具体评论，总计 12-20 条；包含情绪反应、细节分析、伏笔猜测、关系讨论和少量楼中楼，不要全是“啊啊啊”。虚构读者名不能使用双主角真名。',
    input.includeBookComments ? '另生成 4-8 条整本书评论，基于封面感、简介与第一章，不剧透后续大纲。' : 'bookComments 输出空数组。',
    '输出严格 JSON：{"chapter":{"title":"章名","paragraphs":["自然段"],"summary":"120-180字本章摘要","continuity":["新增事实或未解伏笔"],"hotspots":[{"key":"h1","paragraphIndex":从1开始的段落序号,"label":"高潮短标签","excerpt":"对应短摘录","reason":"为何是高潮"}],"nextDirections":["三个下一章可选方向"]},"comments":[{"hotspotKey":"h1","authorName":"虚构读者名","content":"具体评论","replyTo":-1或此前评论下标,"likes":数字}],"bookComments":[同结构但无需hotspotKey]}。只输出 JSON。'
  ].filter(Boolean).join('\n\n');
}

export async function generateFanficChapterWithComments(input: {
  book: FanficBook;
  order: number;
  previousChapters: FanficChapter[];
  direction?: string;
  settings?: AppSettings;
}): Promise<FanficChapterBundle> {
  const includeBookComments = input.order === 1;
  let bestBundle: FanficChapterBundle | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = buildChapterPrompt({ ...input, strictLength: attempt > 0, includeBookComments });
    const reply = await requestTextGeneration(input.settings, prompt, '', { temperature: attempt ? 0.78 : 0.9, maxTokens: 7600 });
    const parsed = parseJson(reply);
    const bundle = normalizeChapterBundle(isRecord(parsed) ? parsed as RawChapterBundle : {}, { book: input.book, order: input.order, includeBookComments });
    bundle.chapter.model = input.settings?.model || undefined;
    if (!bestBundle || Math.abs(bundle.chapter.wordCount - 2500) < Math.abs(bestBundle.chapter.wordCount - 2500)) bestBundle = bundle;
    if (bundle.chapter.wordCount >= 2100 && bundle.chapter.wordCount <= 3000) return bundle;
  }
  if (!bestBundle) throw new Error('章节与评论生成失败。');
  if (bestBundle.chapter.wordCount < 1800) throw new Error(`章节仅生成 ${bestBundle.chapter.wordCount} 字，未达到可发布长度，请重试。`);
  return bestBundle;
}

export async function fetchFanficTrendKeywords() {
  const response = await fetch('/api/fanfic/trends', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 401 ? '联网题材需要先通过访问验证。' : '暂时无法获取联网题材，请稍后重试。');
  const payload = await response.json() as { keywords?: unknown; fetchedAt?: unknown; sourceLabel?: unknown };
  return {
    keywords: asStringArray(payload.keywords, 14).length ? asStringArray(payload.keywords, 14) : fallbackTrendKeywords,
    fetchedAt: Number(payload.fetchedAt) || Date.now(),
    sourceLabel: asString(payload.sourceLabel, '公开榜单趋势')
  };
}

export async function generateFanficTrendTopics(input: { keywords: string[]; settings?: AppSettings }): Promise<FanficTopic[]> {
  if (!hasTextGenerationConfig(input.settings)) return [];
  const prompt = [
    '根据公开趋势标签生成 6 个完全原创的双主角小说题材卡。趋势标签只能作为类型强度参考，禁止提及或改写任何榜单作品、IP、明星、作者、书名和梗概。',
    `趋势标签：${JSON.stringify(input.keywords)}`,
    '每个题材必须创造全新的时代/地点/职业/世界规则/核心冲突，适合任意两位真名主角代入，关系与剧情并重，题材之间差异明显。',
    '输出 JSON 数组：[{"title":"短题材名","hook":"一句高概念钩子","setting":"原创背景","conflict":"核心冲突","relationship":"关系动力","tags":[4-6个标签],"trendKeywords":[使用的趋势词]}]。只输出 JSON。'
  ].join('\n\n');
  const reply = await requestTextGeneration(input.settings, prompt, '', { temperature: 1, maxTokens: 2600 });
  const parsed = parseJson(reply);
  const entries = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.topics) ? parsed.topics : [];
  const now = Date.now();
  return entries.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const title = asString(entry.title);
    const hook = asString(entry.hook);
    if (!title || !hook) return [];
    return [{
      id: createId('fanfic_topic_trend'),
      source: 'trend' as const,
      title,
      hook,
      setting: asString(entry.setting),
      conflict: asString(entry.conflict),
      relationship: asString(entry.relationship),
      tags: asStringArray(entry.tags, 6),
      trendKeywords: asStringArray(entry.trendKeywords, 4),
      builtIn: false,
      createdAt: now + index,
      expiresAt: now + 24 * 60 * 60 * 1000
    }];
  }).slice(0, 6);
}

export async function generateFanficCover(book: FanficBook, settings?: AppSettings) {
  if (!settings?.imageGenerationEnabled) return '';
  const selectedModel = getSelectedImageModelOption(settings, 'voom');
  if (!selectedModel) return '';
  const result = await generateImageByProvider(selectedModel.provider, settings, {
    positivePrompt: `${book.coverPrompt}, vertical editorial book cover artwork, symbolic scene for two protagonists, muted Korean indie magazine palette, premium paper texture, no letters, no words, no typography, no logo, no watermark`,
    negativePrompt: 'text, letters, title, logo, watermark, celebrity, copyrighted character, photorealistic identifiable person, extra limbs, low quality',
    model: selectedModel.model,
    width: 768,
    height: 1152,
    size: settings.imageOpenAi.size
  });
  return result.imageUrl;
}