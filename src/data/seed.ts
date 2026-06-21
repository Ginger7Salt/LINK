import type { AppSettings, CharacterProfile, ChatMessage, Conversation, Sticker, StickerGroup, UserProfile, VoomPost, WorldBookEntry } from '@/types/domain';
import { createVisualProfile, defaultProfileAvatar } from '@/utils/profile';

const now = Date.now();

export const defaultUsers: UserProfile[] = [
  {
    id: '1008600001',
    nickname: 'Linker',
    name: 'momo',
    avatar: defaultProfileAvatar,
    description: '该用户很懒，什么也没留下',
    signature: 'link to your excutive character',
    boundCharacterIds: [],
    profile: createVisualProfile({
      id: '1008600001',
      nickname: 'Linker',
      name: 'momo',
      signature: 'link to your excutive character'
    })
  }
];

export const defaultCharacters: CharacterProfile[] = [];

export const defaultConversations: Conversation[] = [];

export const defaultStickerGroups: StickerGroup[] = [
  {
    id: 'sticker_group_default',
    name: 'ganadi',
    createdAt: now,
    updatedAt: now
  }
];

export const defaultStickers: Sticker[] = [
  {
    id: 'sticker_ganadi_stare',
    description: '紧盯着你',
    imageUrl: 'https://img.heliar.top/file/1781413300001_IMG_20260614_125939.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'sticker_ganadi_speechless',
    description: '无语',
    imageUrl: 'https://img.heliar.top/file/1781413305538_IMG_20260614_125924.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 1,
    updatedAt: now - 1
  },
  {
    id: 'sticker_ganadi_like',
    description: '小狗点赞',
    imageUrl: 'https://img.heliar.top/file/1781413297430_IMG_20260614_125856.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 2,
    updatedAt: now - 2
  },
  {
    id: 'sticker_ganadi_love',
    description: '小狗示爱',
    imageUrl: 'https://img.heliar.top/file/1781413298387_IMG_20260614_125848.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 3,
    updatedAt: now - 3
  },
  {
    id: 'sticker_ganadi_wronged',
    description: '小狗委屈',
    imageUrl: 'https://img.heliar.top/file/1781413294473_IMG_20260614_125839.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 4,
    updatedAt: now - 4
  },
  {
    id: 'sticker_ganadi_cry',
    description: '小狗哭泣',
    imageUrl: 'https://img.heliar.top/file/1781413299876_IMG_20260614_125825.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 5,
    updatedAt: now - 5
  },
  {
    id: 'sticker_ganadi_negotiate',
    description: '我需要谈判',
    imageUrl: 'https://img.heliar.top/file/1781413294947_IMG_20260614_125808.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 6,
    updatedAt: now - 6
  },
  {
    id: 'sticker_ganadi_escape',
    description: '就这样狗溜溜的逃离',
    imageUrl: 'https://img.heliar.top/file/1781413295195_IMG_20260614_125749.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 7,
    updatedAt: now - 7
  },
  {
    id: 'sticker_ganadi_court',
    description: '告到小狗法庭',
    imageUrl: 'https://img.heliar.top/file/1781413282665_IMG_20260614_125742.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 8,
    updatedAt: now - 8
  },
  {
    id: 'sticker_ganadi_losing_water',
    description: '正在大量流失水分。',
    imageUrl: 'https://img.heliar.top/file/1781413288631_IMG_20260614_125734.jpg',
    groupIds: ['sticker_group_default'],
    sourceType: 'url',
    createdAt: now - 9,
    updatedAt: now - 9
  }
];

export const defaultMessages: ChatMessage[] = [];

export const defaultWorldBooks: WorldBookEntry[] = [];

export const defaultVoomPosts: VoomPost[] = [];

export const defaultSettings: AppSettings = {
  activeUserId: '1008600001',
  apiEndpoint: '',
  apiKey: '',
  model: 'gpt-compatible-model',
  modelOverrides: {
    online: '',
    offline: '',
    summary: '',
    voom: ''
  },
  autoGenerateVoom: true,
  disclaimerAccepted: false,
  ttsEnabled: false,
  ttsVoice: 'alloy',
  ttsPlaybackMode: 'manual',
  ttsMinimax: {
    enabled: false,
    apiKey: '',
    groupId: '',
    apiUrl: 'https://api.minimax.io/v1/t2a_v2',
    model: 'speech-02-hd',
    voiceId: 'male-qn-qingse',
    speed: 1,
    volume: 1,
    pitch: 0,
    sampleRate: 32000,
    bitrate: 128000,
    audioFormat: 'mp3',
    channel: 1
  },
  imageModel: 'gpt-image-1',
  imageSize: '1024x1024',
  imagePromptPrefix: '',
  imageOpenAi: {
    activeVendorId: '',
    size: '1024x1024',
    activePromptPresetId: 'openai_default',
    promptPresets: [{ id: 'openai_default', name: '默认预设', positivePrompt: '', negativePrompt: '' }],
    positivePrompt: '',
    negativePrompt: '',
    lastImageUrl: '',
    vendors: []
  },
  imageNovelAi: {
    endpointMode: 'proxy',
    apiUrl: 'https://image.novelai.net',
    proxyUrl: 'https://nai.lolidoll.cc.cd',
    apiKey: '',
    model: 'nai-diffusion-4-5-full',
    availableModels: [
      { id: 'nai-diffusion-4-5-full', label: 'NAI Diffusion Anime V4.5 Full' },
      { id: 'nai-diffusion-4-5-curated', label: 'NAI Diffusion Anime V4.5 Curated' },
      { id: 'nai-diffusion-4-5-curated-preview', label: 'NAI Diffusion Anime V4.5 Curated Preview' },
      { id: 'nai-diffusion-4-full', label: 'NAI Diffusion Anime V4 Full' },
      { id: 'nai-diffusion-4-curated-preview', label: 'NAI Diffusion Anime V4 Curated Preview' },
      { id: 'nai-diffusion-3', label: 'NAI Diffusion Anime V3' },
      { id: 'nai-diffusion-furry-3', label: 'NAI Diffusion Furry V3' }
    ],
    activePromptPresetId: 'novelai_default',
    promptPresets: [{ id: 'novelai_default', name: '默认预设', positivePrompt: '', negativePrompt: '' }],
    positivePrompt: '',
    negativePrompt: '',
    width: 832,
    height: 1216,
    guidance: 6.5,
    steps: 28,
    sampler: 'k_euler_ancestral',
    ucPreset: 0,
    qualityToggle: true,
    sm: false,
    smDyn: false,
    dynamicThresholding: false,
    cfgRescale: 0,
    noiseSchedule: 'native',
    seed: '',
    lastImageUrl: ''
  },
  imagePollinations: {
    apiKey: '',
    referrer: 'link-pwa',
    model: 'zimage',
    availableModels: [
      { id: 'zimage', label: 'Z-Image' },
      { id: 'flux', label: 'Flux' },
      { id: 'gptimage', label: 'GPT Image' },
      { id: 'kontext', label: 'FLUX.1 Kontext' },
      { id: 'seedream5', label: 'Seedream 5' },
      { id: 'nanobanana', label: 'NanoBanana' },
      { id: 'klein', label: 'Klein' },
      { id: 'qwen-image', label: 'Qwen Image' }
    ],
    activePromptPresetId: 'pollinations_default',
    promptPresets: [{ id: 'pollinations_default', name: '默认预设', positivePrompt: '', negativePrompt: '' }],
    positivePrompt: '',
    negativePrompt: '',
    width: 1024,
    height: 1024,
    seed: '',
    safe: 'true',
    quality: 'medium',
    referenceImage: '',
    transparent: false,
    enhance: true,
    nologo: true,
    private: true,
    lastImageUrl: ''
  },
  imageModelOverrides: {
    worldBook: { provider: '', model: '' },
    voom: { provider: '', model: '' },
    onlineChat: { provider: '', model: '' }
  },
  voomImageProvider: '',
  voomImageModel: '',
  voomReadAtByUser: {},
  imagePrivateOnly: true,
  githubBackup: {
    enabled: false,
    token: '',
    owner: '',
    repo: 'link-private-backups',
    branch: 'main',
    path: 'link-backup.json',
    intervalMinutes: 30,
    lastBackupAt: 0,
    lastBackupStatus: 'idle',
    lastBackupError: '',
    latestRemoteBackupAt: 0,
    latestRemoteBackupSha: '',
    pendingRestoreSha: '',
    pendingRestoreAt: 0,
    history: [],
    progress: {
      phase: 'idle',
      label: '',
      percent: 0,
      updatedAt: 0
    }
  },
  apiVendors: []
};