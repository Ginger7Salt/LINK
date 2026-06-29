export type ChatMode = 'online' | 'offline';

export type AppTab = 'home' | 'chats' | 'voom' | 'music' | 'fanfic';

export interface VisualProfileStats {
  posts: number;
  postsLabel: string;
  followers: string;
  followersLabel: string;
  following: string | number;
  followingLabel: string;
}

export interface VisualProfileLink {
  id: string;
  label: string;
  url: string;
}

export interface VisualProfileHighlight {
  id: string;
  title: string;
  image: string;
}

export interface VisualProfileMoment {
  id: string;
  title: string;
  image: string;
}

export interface VisualProfile {
  nickname: string;
  handle: string;
  avatar: string;
  bio: string;
  backgroundImage: string;
  location: string;
  mood: string;
  archiveLabel: string;
  editLabel: string;
  editorTitle: string;
  messageLabel: string;
  momentsLabel: string;
  accentColor: string;
  textColor: string;
  avatarBorderColor: string;
  stats: VisualProfileStats;
  tags: string[];
  chips: string[];
  links: VisualProfileLink[];
  highlights: VisualProfileHighlight[];
  moments: VisualProfileMoment[];
}

export type UserVisualProfile = Omit<VisualProfile, 'avatar'>;

export interface UserProfile {
  id: string;
  nickname: string;
  name: string;
  avatar: string;
  description: string;
  signature: string;
  boundCharacterIds: string[];
  profile: UserVisualProfile;
}

export interface CharacterMindState {
  lines: string[];
  updatedAt: number;
  readAt: number;
  sourceConversationId?: string;
  sourceReplyBatchId?: string;
}

export interface CharacterInitialProfile {
  nickname: string;
  signature: string;
}

export type CharacterProfileHistoryField = 'nickname' | 'signature' | 'mood';

export interface CharacterProfileHistoryEntry {
  id: string;
  field: CharacterProfileHistoryField;
  previousValue: string;
  nextValue: string;
  createdAt: number;
  sourceConversationId?: string;
  sourceReplyBatchId?: string;
}

export interface CharacterProfile {
  id: string;
  nickname: string;
  name: string;
  avatar: string;
  description: string;
  signature: string;
  userNote: string;
  boundUserId: string;
  subtitle: string;
  lastSeen: string;
  localWorldBookIds: string[];
  voomFrequency: VoomFrequency;
  initialProfile?: CharacterInitialProfile;
  profileHistory?: CharacterProfileHistoryEntry[];
  boundUserProfile?: VisualProfile;
  profile?: VisualProfile;
  mindState?: CharacterMindState;
  modelOverrides?: ChatModelOverrides;
}

export type VoomFrequency = 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | 'always';

export type ChatModelScope = 'online' | 'offline' | 'summary' | 'voom' | 'theater';

export interface ChatModelOverrides {
  online: string;
  offline: string;
  summary: string;
  voom: string;
  theater: string;
}

export interface ChatAppearanceSettings {
  backgroundImage: string;
  backgroundImages: string[];
  backgroundColor: string;
  userBubbleColor: string;
  userTextColor: string;
  characterBubbleColor: string;
  characterTextColor: string;
  narrationBubbleColor: string;
  narrationTextColor: string;
  showMessageTime: boolean;
  showReadStatus: boolean;
  showUserAvatar: boolean;
  showOnlyFirstAvatarInReply: boolean;
  hideVoomNarration: boolean;
}

export interface ChatMemorySettings {
  enabled: boolean;
  autoSummarize: boolean;
  summarizeEvery: number;
  summaryModel: string;
  summaryPrompt: string;
  mergeSummaryPrompt: string;
  vectorMemoryEnabled: boolean;
  hideSummarizedMessages: boolean;
  atomWriterEnabled: boolean;
  atomWriterEvery: number;
  autoMergeEnabled: boolean;
  autoMergeThreshold: number;
  autoMergeBatchSize: number;
}

export interface ConversationTimeAwarenessSettings {
  enabled: boolean;
}

export interface ConversationProactiveReplySettings {
  enabled: boolean;
  frequency: VoomFrequency;
  lastTriggeredAt: number;
}

export type OfflineParagraphMode = 'long' | 'short' | 'mixed';
export type OfflinePerspective = 'omniscient-third' | 'character-third' | 'character-second' | 'user-first' | 'user-second';
export type OfflineInterruptionMode = 'advance' | 'strict';
export type OfflineRetellMode = 'retell' | 'direct';
export type OfflineTonePreset = 'daily' | 'push-pull' | 'ambiguous' | 'romance' | 'bittersweet' | 'custom';

export interface OfflinePromptPreset {
  id: string;
  name: string;
  content: string;
}

export interface ConversationOfflineSettings {
  enhanceAppearance: boolean;
  enhanceOutfit: boolean;
  expandLength: boolean;
  characterPsychology: boolean;
  paragraphMode: OfflineParagraphMode;
  perspective: OfflinePerspective;
  interruptionMode: OfflineInterruptionMode;
  retellMode: OfflineRetellMode;
  wordCount: string;
  writingStylePresetId: string;
  writingStylePresets: OfflinePromptPreset[];
  writingStyle: string;
  tonePresetId: string;
  tonePresets: OfflinePromptPreset[];
  tone: OfflineTonePreset;
  customTone: string;
}

export interface ConversationSettings {
  conversationId: string;
  memory: ChatMemorySettings;
  modelOverrides: ChatModelOverrides;
  appearance: ChatAppearanceSettings;
  narrationModeEnabled: boolean;
  autoGenerateVoom: boolean;
  voomFrequency: VoomFrequency;
  autoGenerateTheater: boolean;
  theaterFrequency: VoomFrequency;
  stickerVisionEnabled: boolean;
  stickerSuggestionsEnabled: boolean;
  offlineInvitationEnabled: boolean;
  characterStickerGroupIds: string[];
  timeAwareness: ConversationTimeAwarenessSettings;
  proactiveReply: ConversationProactiveReplySettings;
  offline: ConversationOfflineSettings;
}

export type ConversationMemoryEntryType = 'fact' | 'preference' | 'promise' | 'conflict' | 'plot' | 'relationship' | 'boundary' | 'emotion' | 'world';
export type ConversationMemoryEntryStatus = 'active' | 'open' | 'resolved' | 'superseded' | 'cancelled';

export interface ConversationMemoryScoreBreakdown {
  label: string;
  value: number;
  reason: string;
}

export interface ConversationMemoryEntry {
  id: string;
  type: ConversationMemoryEntryType;
  status: ConversationMemoryEntryStatus;
  subject: string;
  content: string;
  owner?: string;
  counterparty?: string;
  due?: string;
  resolution?: string;
  evidenceFloors: number[];
  lastTouchedFloor: number;
  importance: number;
  vector?: number[];
  sourceAtomIds?: string[];
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface ConversationMemoryAtom extends ConversationMemoryEntry {
  conversationId: string;
  mode: ChatMode;
  sourceMemoryId?: string;
  sourceMessageIds: string[];
  confidence: number;
  pinned?: boolean;
  archivedAt?: number;
}

export interface ConversationMemoryDebugTrace {
  conversationId: string;
  queryText: string;
  generatedAt: number;
  tokenBudget: number;
  selectedTokenCount: number;
  selectedAtoms: Array<{
    id: string;
    type: ConversationMemoryEntryType;
    status: ConversationMemoryEntryStatus;
    subject: string;
    content: string;
    score: number;
    scoreBreakdown: ConversationMemoryScoreBreakdown[];
    matchedTokens: string[];
    tokenCount: number;
  }>;
}

export interface ConversationMemoryRecord {
  id: string;
  conversationId: string;
  mode: ChatMode;
  kind: 'short-term' | 'long-term';
  startFloor: number;
  endFloor: number;
  hiddenStartFloor: number;
  hiddenEndFloor: number;
  summary: string;
  tokenCount: number;
  vector: number[];
  entries?: ConversationMemoryEntry[];
  sourceMessageIds: string[];
  model: string;
  isMergedSummary?: boolean;
  mergedFrom?: ConversationMemoryRecord[];
  createdAt: number;
  updatedAt: number;
  compressedAt?: number;
}

export interface Conversation {
  id: string;
  userId: string;
  charId: string;
  title: string;
  activeMode: ChatMode;
  updatedAt: number;
  unreadCount: number;
  summary: string;
}

export type StickerSourceType = 'url' | 'local-image' | 'text-file' | 'doc-file' | 'json-file' | 'manual';

export interface StickerGroup {
  id: string;
  name: string;
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Sticker {
  id: string;
  description: string;
  imageUrl: string;
  groupIds: string[];
  sourceType: StickerSourceType;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatStickerAttachment {
  stickerId: string;
  description: string;
  imageUrl: string;
}

export type ChatImageAttachmentKind = 'photo' | 'local' | 'description' | 'generated';

export type ChatImageProviderType = 'openai' | 'novelai' | 'pollinations' | 'mock' | 'local';

export interface ChatImageCandidate {
  id: string;
  image: string;
  description: string;
  provider: ChatImageProviderType;
  model?: string;
  size?: string;
  createdAt: number;
}

export interface ChatImageAttachment {
  kind: ChatImageAttachmentKind;
  description: string;
  aiHint?: string;
  url?: string;
  provider?: ChatImageProviderType;
  model?: string;
  size?: string;
  candidates?: ChatImageCandidate[];
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export type ChatVoiceAttachmentSource = 'recorded' | 'text';

export type TtsProviderType = 'openai' | 'minimax';

export interface ChatVoiceAttachment {
  source: ChatVoiceAttachmentSource;
  transcript: string;
  duration: number;
  audioUrl?: string;
  mimeType?: string;
  ttsProvider?: TtsProviderType;
  ttsVoiceId?: string;
  ttsGeneratedAt?: number;
}

export interface ChatLocationAttachment {
  name: string;
  address?: string;
  distance: string;
}

export type ChatTransferStatus = 'pending' | 'accepted' | 'rejected';

export interface ChatTransferAttachment {
  amount: string;
  currency: 'CNY';
  note?: string;
  status: ChatTransferStatus;
  respondedAt?: number;
}

export type ChatOfflineInvitationStatus = 'pending' | 'accepted' | 'rejected';

export interface ChatOfflineInvitationAttachment {
  prompt: string;
  status: ChatOfflineInvitationStatus;
  respondedAt?: number;
  startedAt?: number;
}

export interface ChatMessageQuote {
  messageId: string;
  sender: 'user' | 'char' | 'system';
  authorName: string;
  content: string;
  sticker?: ChatStickerAttachment;
  image?: ChatImageAttachment;
  voice?: ChatVoiceAttachment;
  location?: ChatLocationAttachment;
  transfer?: ChatTransferAttachment;
  offlineInvitation?: ChatOfflineInvitationAttachment;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: 'user' | 'char' | 'system';
  mode: ChatMode;
  content: string;
  translation?: string;
  createdAt: number;
  displayStyle?: 'default' | 'narration';
  voomPostId?: string;
  voomCommentId?: string;
  voomEventType?: 'post' | 'like' | 'unlike' | 'comment' | 'reply';
  sticker?: ChatStickerAttachment;
  image?: ChatImageAttachment;
  voice?: ChatVoiceAttachment;
  location?: ChatLocationAttachment;
  transfer?: ChatTransferAttachment;
  offlineInvitation?: ChatOfflineInvitationAttachment;
  quote?: ChatMessageQuote;
  replyBatchId?: string;
  replyVariantGroupId?: string;
  replyVariantIndex?: number;
  replyVariantState?: 'active' | 'inactive';
  plotChoices?: string[];
  status?: 'sending' | 'sent' | 'failed';
  editedAt?: number;
}

export type FavoriteMessageKind = 'text' | 'image' | 'sticker' | 'voice' | 'location' | 'transfer' | 'offlineInvitation' | 'narration';

export interface FavoriteMessageRecord {
  id: string;
  sourceMessageId: string;
  conversationId: string;
  mode: ChatMode;
  kind: FavoriteMessageKind;
  sender: 'user' | 'char' | 'system';
  authorName: string;
  authorAvatar?: string;
  characterId?: string;
  characterName?: string;
  characterAvatar?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  summary: string;
  message: ChatMessage;
  messageCreatedAt: number;
  favoritedAt: number;
}

export type VoomPostAuthorType = 'character' | 'user';

export type VoomPostVisibility = 'public' | 'selected';

export type VoomImageProviderType = ImageProviderType | 'mock' | 'local';

export interface VoomImageCandidate {
  id: string;
  image: string;
  description: string;
  provider: VoomImageProviderType;
  model?: string;
  size?: string;
  createdAt: number;
}

export interface VoomPost {
  id: string;
  charId: string;
  conversationId?: string;
  conversationIds?: string[];
  proactiveCommentExpansionCharacterIds?: string[];
  authorType?: VoomPostAuthorType;
  userId?: string;
  visibility?: VoomPostVisibility;
  visibleCharacterIds?: string[];
  authorName: string;
  authorAvatar: string;
  content: string;
  contentTranslation?: string;
  image?: string;
  imageDescription?: string;
  imageProvider?: VoomImageProviderType;
  imageCandidates?: VoomImageCandidate[];
  createdAt: number;
  comments: VoomComment[];
  likes: string[];
}

export interface VoomComment {
  id: string;
  authorName: string;
  content: string;
  contentTranslation?: string;
  authorId?: string;
  parentId?: string;
  createdAt?: number;
}

export interface SmallTheaterTopic {
  id: string;
  charId: string;
  title: string;
  prompt: string;
  enabled: boolean;
  builtIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SmallTheater {
  id: string;
  charId: string;
  conversationId?: string;
  topicId?: string;
  topicTitle: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  summary: string;
  html: string;
  model?: string;
  createdAt: number;
}

export type MusicSource = 'netease' | 'kuwo' | 'joox' | 'tencent' | 'tidal' | 'qobuz' | 'bilibili' | 'apple' | 'ytmusic' | 'spotify';

export interface MusicTrack {
  id: string;
  platformId: string;
  urlId?: string;
  source: MusicSource | string;
  name: string;
  artists: string[];
  album: string;
  picId: string;
  lyricId: string;
  coverUrl?: string;
  audioUrl?: string;
  duration?: number;
  addedAt?: number;
  updatedAt?: number;
}

export interface MusicComment {
  id: string;
  authorName: string;
  authorId?: string;
  authorType: 'user' | 'character' | 'passerby';
  avatar?: string;
  content: string;
  contentTranslation?: string;
  parentId?: string;
  createdAt: number;
}

export interface MusicCommentThread {
  trackKey: string;
  track: MusicTrack;
  comments: MusicComment[];
  expanded: boolean;
  generatedAt: number;
  updatedAt: number;
}

export type WorldBookScope = 'global-online' | 'global-offline' | 'local';

export type WorldBookEntryActivation = 'keyword' | 'constant' | 'priority';

export type WorldBookInsertionPosition = 'before-chat' | 'after-chat';

export interface WorldBookLoreEntry {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  activation: WorldBookEntryActivation;
  keys: string[];
  secondaryKeys: string[];
  position: WorldBookInsertionPosition;
  order: number;
  depth: number;
  probability: number;
  caseSensitive: boolean;
}

export interface WorldBookEntry {
  id: string;
  title: string;
  content: string;
  entries: WorldBookLoreEntry[];
  scope: WorldBookScope;
  enabled: boolean;
  coverImage: string;
  coverPrompt: string;
  coverNegativePrompt: string;
  coverProvider: ImageProviderType | '';
}

export type ImageProviderType = 'openai' | 'novelai' | 'pollinations';

export type ImageModuleId = ImageProviderType;

export type ImageModelScope = 'worldBook' | 'voom' | 'onlineChat';

export interface ImageModelSelection {
  provider: ImageProviderType | '';
  model: string;
}

export interface GeneratedImageRecord {
  id: string;
  provider: ImageModuleId;
  imageUrl: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  size: string;
  source: 'settings' | 'world-book' | 'voom';
  createdAt: number;
}

export interface ApiVendorModel {
  id: string;
  nickname: string;
  selected: boolean;
}

export interface ApiVendor {
  id: string;
  enabled: boolean;
  name: string;
  apiUrl: string;
  apiPath: string;
  apiKey: string;
  avatar: string;
  preferBase64ImageResponse: boolean;
  models: ApiVendorModel[];
}

export interface ImagePromptPreset {
  id: string;
  name: string;
  positivePrompt: string;
  negativePrompt: string;
}

export type NovelAiEndpointMode = 'proxy' | 'official';

export interface NovelAiModelOption {
  id: string;
  label: string;
}

export interface PollinationsModelOption {
  id: string;
  label: string;
}

export interface OpenAiImageSettings {
  activeVendorId: string;
  size: string;
  activePromptPresetId: string;
  promptPresets: ImagePromptPreset[];
  positivePrompt: string;
  negativePrompt: string;
  lastImageUrl: string;
  vendors: ApiVendor[];
}

export interface NovelAiImageSettings {
  endpointMode: NovelAiEndpointMode;
  apiUrl: string;
  proxyUrl: string;
  apiKey: string;
  model: string;
  availableModels: NovelAiModelOption[];
  activePromptPresetId: string;
  promptPresets: ImagePromptPreset[];
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  guidance: number;
  steps: number;
  sampler: string;
  ucPreset: number;
  qualityToggle: boolean;
  sm: boolean;
  smDyn: boolean;
  dynamicThresholding: boolean;
  cfgRescale: number;
  noiseSchedule: string;
  seed: string;
  lastImageUrl: string;
}

export interface PollinationsImageSettings {
  apiKey: string;
  referrer: string;
  model: string;
  availableModels: PollinationsModelOption[];
  activePromptPresetId: string;
  promptPresets: ImagePromptPreset[];
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  seed: string;
  safe: string;
  quality: string;
  referenceImage: string;
  transparent: boolean;
  enhance: boolean;
  nologo: boolean;
  private: boolean;
  lastImageUrl: string;
}

export type GitHubBackupStatus = 'idle' | 'running' | 'success' | 'failed';

export interface GitHubBackupHistoryRecord {
  sha: string;
  committedAt: number;
  exportedAt: number;
  message: string;
}

export interface GitHubBackupProgress {
  phase: 'idle' | 'checking' | 'uploading' | 'downloading' | 'restoring' | 'completed' | 'failed';
  label: string;
  percent: number;
  updatedAt: number;
}

export interface GitHubBackupSettings {
  enabled: boolean;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  intervalMinutes: number;
  lastBackupAt: number;
  lastBackupStatus: GitHubBackupStatus;
  lastBackupError: string;
  latestRemoteBackupAt: number;
  latestRemoteBackupSha: string;
  pendingRestoreSha: string;
  pendingRestoreAt: number;
  history: GitHubBackupHistoryRecord[];
  progress: GitHubBackupProgress;
}

export type MinimaxTtsAudioFormat = 'mp3' | 'wav' | 'pcm';

export type OpenAiTtsAudioFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface OpenAiTtsSettings {
  activeVendorId: string;
  vendors: ApiVendor[];
  apiKey: string;
  apiUrl: string;
  model: string;
  voice: string;
  responseFormat: OpenAiTtsAudioFormat;
  speed: number;
  instructions: string;
}

export interface MinimaxTtsSettings {
  enabled: boolean;
  apiKey: string;
  groupId: string;
  apiUrl: string;
  model: string;
  voiceId: string;
  speed: number;
  volume: number;
  pitch: number;
  sampleRate: number;
  bitrate: number;
  audioFormat: MinimaxTtsAudioFormat;
  channel: 1 | 2;
}

export type RingtoneEventType = 'voom' | 'message' | 'theater';

export type RingtoneSourceType = 'default' | 'imported';

export interface RingtoneAsset {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  source: RingtoneSourceType;
  updatedAt: number;
}

export interface CharacterRingtoneSettings {
  characterId: string;
  voom?: RingtoneAsset;
  message?: RingtoneAsset;
  theater?: RingtoneAsset;
}

export interface AppRingtoneSettings {
  enabled: boolean;
  global: Record<RingtoneEventType, RingtoneAsset>;
  characters: Record<string, CharacterRingtoneSettings>;
}

export interface AppKeepAliveSettings {
  enabled: boolean;
  silentAudio: boolean;
  notifications: boolean;
  wakeLock: boolean;
}

export type ThemeFontSource = 'url' | 'file' | 'family';

export interface ThemeFontEntry {
  id: string;
  name: string;
  family: string;
  source: ThemeFontSource;
  url: string;
  mimeType: string;
  size: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ThemeFontSettings {
  activeFontId: string;
  entries: ThemeFontEntry[];
}

export interface AppThemeSettings {
  fonts: ThemeFontSettings;
  global: Record<string, never>;
  online: Record<string, never>;
  offline: Record<string, never>;
}

export interface AppSettings {
  activeUserId: string;
  apiEndpoint: string;
  apiKey: string;
  model: string;
  modelOverrides: ChatModelOverrides;
  apiVendors: ApiVendor[];
  autoGenerateVoom: boolean;
  disclaimerAccepted: boolean;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsPlaybackMode: 'manual' | 'auto';
  ttsProvider: TtsProviderType;
  ttsOpenAi: OpenAiTtsSettings;
  ttsMinimax: MinimaxTtsSettings;
  imageModel: string;
  imageSize: string;
  imagePromptPrefix: string;
  imageOpenAi: OpenAiImageSettings;
  imageNovelAi: NovelAiImageSettings;
  imagePollinations: PollinationsImageSettings;
  imageModelOverrides: Record<ImageModelScope, ImageModelSelection>;
  voomImageProvider: ImageProviderType | '';
  voomImageModel: string;
  voomReadAtByUser: Record<string, Record<string, number>>;
  smallTheaterTopicDefaultsInitialized: Record<string, number>;
  keepAlive: AppKeepAliveSettings;
  ringtoneSettings: AppRingtoneSettings;
  themeSettings: AppThemeSettings;
  imagePrivateOnly: boolean;
  imageGenerationEnabled: boolean;
  githubBackup: GitHubBackupSettings;
}

export interface AppSnapshot {
  users: UserProfile[];
  characters: CharacterProfile[];
  conversations: Conversation[];
  messages: ChatMessage[];
  voomPosts: VoomPost[];
  smallTheaterTopics: SmallTheaterTopic[];
  smallTheaters: SmallTheater[];
  musicFavoriteTracks: MusicTrack[];
  musicCommentThreads: MusicCommentThread[];
  worldBooks: WorldBookEntry[];
  stickerGroups: StickerGroup[];
  stickers: Sticker[];
  conversationSettings: ConversationSettings[];
  conversationMemories: ConversationMemoryRecord[];
  conversationMemoryAtoms: ConversationMemoryAtom[];
  generatedImages: GeneratedImageRecord[];
  favorites: FavoriteMessageRecord[];
  settings: AppSettings;
}

export interface PromptContext {
  user: UserProfile;
  character: CharacterProfile;
  boundUser: UserProfile;
  mode: ChatMode;
  messages: ChatMessage[];
  recentVoomPosts?: VoomPost[];
  recentSmallTheaters?: SmallTheater[];
  worldBooks: WorldBookEntry[];
  conversationSummary: string;
  memorySummary?: string;
  stickerVisionEnabled?: boolean;
  narrationModeEnabled?: boolean;
  offlineInvitationEnabled?: boolean;
  availableStickers?: ChatStickerAttachment[];
  timeAwareness?: ConversationTimeAwarenessSettings;
  offlineSettings?: ConversationOfflineSettings;
  replyInstruction?: string;
}

export interface GenerateReplyInput extends PromptContext {
  userMessage: string;
  settings?: AppSettings;
  modelOverride?: string;
}