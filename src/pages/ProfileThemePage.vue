<template>
  <section v-if="conversation && character" class="screen no-tabs profile-theme-page">
    <header class="top-bar profile-theme-topbar">
      <button class="profile-theme-title-button" type="button" aria-label="返回聊天" @click="goBack">
        <h1 class="top-title">Profile Themes</h1>
      </button>
      <div class="profile-theme-header-actions">
        <button class="header-action-button" type="button" aria-label="主页清理设置" title="主页清理" @click="openHomepageCleanupSettings">
          <SlidersHorizontal :size="18" stroke-width="2.4" />
        </button>
        <button class="header-action-button" type="button" aria-label="分享主页主题" title="分享主页主题" @click="openExporter">
          <Share2 :size="18" stroke-width="2.4" />
        </button>
        <button class="header-action-button" type="button" aria-label="新增主页主题" title="新增主页主题" @click="openCreator">
          <Plus :size="18" stroke-width="2.4" />
        </button>
      </div>
    </header>

    <main class="profile-theme-main">
      <section class="profile-theme-panel">
        <section v-if="activeTab === 'themes'" class="profile-theme-section" aria-label="主页主题管理">
        <header class="profile-theme-section-head">
          <div>
            <p class="section-kicker">Random Pool</p>
            <h2>主页主题池</h2>
          </div>
          <span class="section-count">{{ enabledThemes.length }}/{{ themes.length }}</span>
        </header>

        <article
          v-for="theme in themes"
          :key="theme.id"
          class="profile-theme-card"
          :class="{ disabled: !theme.enabled }"
          role="button"
          tabindex="0"
          @click="openEditTheme(theme)"
          @keydown.enter.prevent="openEditTheme(theme)"
          @keydown.space.prevent="openEditTheme(theme)"
        >
          <button class="theme-switch" :class="{ active: theme.enabled }" type="button" role="switch" :aria-checked="theme.enabled" @click.stop="toggleTheme(theme)">
            <span></span>
          </button>
          <div class="theme-copy">
            <strong>{{ theme.name }}</strong>
            <small>{{ theme.builtIn ? '默认 Mood 主题' : theme.source === 'imported' ? 'PNG 导入主题' : '自定义主题' }}</small>
          </div>
          <span class="theme-meta">{{ countPromptLines(theme.prompt) }} 行提示</span>
        </article>

        <section v-if="!themes.length" class="profile-theme-empty">
          <Sparkles :size="28" />
          <h2>还没有主页主题</h2>
          <p>新增主题后，角色每次回复会从启用主题里随机选择一个更新主页。</p>
          <button type="button" @click="openCreator">新增主题</button>
        </section>
        </section>

        <section v-else class="profile-theme-section" aria-label="生成主页">
          <header class="profile-theme-section-head">
            <div>
              <p class="section-kicker">Homepages</p>
              <h2>生成主页</h2>
            </div>
            <span class="section-count">{{ homepages.length }}</span>
          </header>

          <article v-for="homepage in homepages" :key="homepage.id" class="homepage-record-card">
            <button class="homepage-record-main" type="button" @click="openHomepagePreview(homepage.id)">
              <span class="homepage-record-copy">
                <strong>{{ homepage.themeName }}</strong>
                <small>{{ formatHomepageTime(homepage.updatedAt || homepage.createdAt) }}</small>
                <em>{{ homepagePreviewText(homepage) }}</em>
              </span>
            </button>
            <button class="homepage-record-delete" type="button" aria-label="删除生成主页" title="删除" @click="deleteHomepage(homepage.id)">
              <X :size="17" stroke-width="2.5" />
            </button>
          </article>

          <section v-if="!homepages.length" class="profile-theme-empty">
            <PanelsTopLeft :size="28" />
            <h2>还没有生成主页</h2>
            <p>启用自定义主页主题后，角色线上回复会把生成结果保存到这里。</p>
          </section>
        </section>
      </section>
    </main>

    <nav class="profile-theme-bottom-tabs" aria-label="主页自定义页面切换">
      <button type="button" :class="{ active: activeTab === 'themes' }" @click="setActiveTab('themes')">
        <ListChecks :size="20" />
        <span>主题管理</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'homepages' }" @click="setActiveTab('homepages')">
        <PanelsTopLeft :size="20" />
        <span>生成主页</span>
      </button>
    </nav>

    <AppModal v-model="showEditor" title="编辑主页主题" variant="ins">
      <form class="profile-theme-editor" @submit.prevent="submitEditor">
        <label>
          <span>主题名称</span>
          <input v-model="themeDraft.name" maxlength="36" placeholder="例如：小红书、微博、Mood" />
        </label>
        <label>
          <span>跟随正文生成的提示词</span>
          <textarea v-model="themeDraft.prompt" maxlength="12000" rows="7" placeholder="写清楚希望模型生成什么主页资料内容。"></textarea>
        </label>
        <label>
          <span>正则提取（可选）</span>
          <input v-model="themeDraft.regex" placeholder="例如：\\s*([\\s\\S]+)$" />
        </label>
        <label>
          <span>主页代码</span>
          <textarea v-model="themeDraft.code" maxlength="24000" rows="12" spellcheck="false" placeholder="写完整角色主页 HTML，可在顶部加入 <style>...</style>。支持 {{content}}、{{lines}}、{{title}}。"></textarea>
        </label>
        <label class="theme-editor-switch">
          <input v-model="themeDraft.enabled" type="checkbox" />
          <span>加入随机生成池</span>
        </label>
        <div class="theme-editor-actions" :class="{ editing: canDeleteEditingTheme }">
          <button v-if="canDeleteEditingTheme" class="danger" type="button" @click="deleteEditingTheme">删除</button>
          <button class="secondary" type="button" @click="showEditor = false">取消</button>
          <button class="primary" type="submit">保存</button>
        </div>
      </form>
    </AppModal>

    <AppModal v-model="showCreator" title="添加主页主题" :show-header="false" fixed-height variant="ins">
      <form class="profile-theme-editor profile-theme-creator" @submit.prevent="submitCreator">
        <section class="composer-hero">
          <span class="composer-avatar"><component :is="creatorTab === 'theme' ? Plus : Upload" :size="26" /></span>
          <div>
            <span>Profile Theme</span>
            <strong>{{ creatorTab === 'theme' ? '新增主页主题' : 'PNG 导入' }}</strong>
            <p>{{ creatorTab === 'theme' ? '填写提示词、正则和完整主页代码，保存为全局共用主页主题。' : '选择别人分享的 LINK 主页主题 PNG。' }}</p>
          </div>
        </section>

        <nav class="composer-tabs" aria-label="主页主题添加方式">
          <button class="composer-tab" :class="{ active: creatorTab === 'theme' }" type="button" @click="creatorTab = 'theme'">新增主页主题</button>
          <button class="composer-tab" :class="{ active: creatorTab === 'png' }" type="button" @click="creatorTab = 'png'">导入 PNG</button>
        </nav>

        <section v-if="creatorTab === 'theme'" class="composer-section profile-theme-editor-fields">
          <label>
            <span>主题名称</span>
            <input v-model="themeDraft.name" maxlength="36" placeholder="例如：小红书、微博、Mood" />
          </label>
          <label>
            <span>跟随正文生成的提示词</span>
            <textarea v-model="themeDraft.prompt" maxlength="12000" rows="7" placeholder="写清楚希望模型生成什么主页资料内容。"></textarea>
          </label>
          <label>
            <span>正则提取（可选）</span>
            <input v-model="themeDraft.regex" placeholder="例如：\\s*([\\s\\S]+)$" />
          </label>
          <label>
            <span>主页代码</span>
            <textarea v-model="themeDraft.code" maxlength="24000" rows="12" spellcheck="false" placeholder="写完整角色主页 HTML，可在顶部加入 <style>...</style>。支持 {{content}}、{{lines}}、{{title}}。"></textarea>
          </label>
          <label class="theme-editor-switch">
            <input v-model="themeDraft.enabled" type="checkbox" />
            <span>加入随机生成池</span>
          </label>
        </section>

        <section v-else class="composer-section">
          <label class="file-drop-card">
            <Upload :size="18" />
            <strong>选择 PNG 主题图片</strong>
            <span>{{ selectedPngFile ? selectedPngFile.name : '导入别人分享的主页主题' }}</span>
            <input type="file" accept="image/png" @change="selectPngFile" />
          </label>
        </section>

        <p v-if="importError" class="sync-feedback error">{{ importError }}</p>
        <div class="profile-theme-modal-footer composer-footer">
          <button class="footer-button footer-cancel" type="button" @click="showCreator = false">取消</button>
          <button class="footer-button footer-save" type="submit" :disabled="importing">{{ importing ? '处理中...' : creatorTab === 'theme' ? '保存' : '导入' }}</button>
        </div>
      </form>
    </AppModal>

    <AppModal v-model="showExporter" title="分享主页主题" :show-header="false" fixed-height variant="ins">
      <section class="profile-theme-exporter style-export-composer">
        <section class="composer-hero">
          <span class="composer-avatar"><Share2 :size="26" /></span>
          <div>
            <span>Share Profile</span>
            <strong>导出 PNG</strong>
            <p>选择要分享的自定义主页主题，导出的 PNG 可被其他用户导入。</p>
          </div>
        </section>
        <section v-if="exportableThemes.length" class="export-theme-list export-preset-list">
          <label v-for="theme in exportableThemes" :key="theme.id" class="export-theme-item export-preset-item">
            <input v-model="selectedExportThemeIds" type="checkbox" :value="theme.id" />
            <span>
              <strong>{{ theme.name }}</strong>
              <small>{{ countPromptLines(theme.prompt) }} 行提示 · {{ theme.source === 'imported' ? '导入' : '自定义' }}</small>
            </span>
          </label>
        </section>
        <section v-else class="profile-theme-empty compact-empty">
          <strong>还没有可分享的自定义主题</strong>
          <p>默认 Mood 主题不需要分享，先新增或导入一个主题。</p>
        </section>
        <p v-if="exportError" class="sync-feedback error">{{ exportError }}</p>
        <div class="profile-theme-modal-footer composer-footer">
          <button class="footer-button footer-cancel" type="button" @click="showExporter = false">取消</button>
          <button class="footer-button footer-save" type="button" :disabled="exporting || !selectedExportThemeIds.length" @click="exportSelectedThemes">{{ exporting ? '导出中...' : '导出 PNG' }}</button>
        </div>
      </section>
    </AppModal>

    <AppModal v-model="showHomepagePreview" title="生成主页预览" :show-header="false" variant="profile-ins">
      <section v-if="selectedHomepage" class="homepage-preview-sheet">
        <div class="homepage-preview-body" :data-profile-theme-scope="homepageScopeId(selectedHomepage)" v-html="homepageHtml(selectedHomepage)"></div>
      </section>
    </AppModal>

    <AppModal v-model="showHomepageCleanupSettings" title="主页清理" variant="ins">
      <section class="homepage-cleanup-panel">
        <section class="cleanup-character-card single-character">
          <div class="cleanup-character-top">
            <div class="cleanup-character-head">
              <img :src="character.avatar" :alt="character.name || character.nickname" />
              <span>
                <strong>{{ character.name || character.nickname }}</strong>
                <small>{{ homepageCleanupSetting.enabled ? `${homepageCleanupSetting.days} 天前自动清理` : '自动清理已关闭' }}</small>
              </span>
            </div>
            <label class="cleanup-switch-card" :aria-label="`${character.name || character.nickname} 主页自动清理`">
              <input type="checkbox" :checked="homepageCleanupSetting.enabled" @change="updateHomepageCleanupEnabled" />
              <span class="cleanup-switch-track"></span>
            </label>
          </div>
          <div class="cleanup-compact-row character-row">
            <label class="cleanup-select-field">
              <span>早于</span>
              <select :value="homepageCleanupSetting.preset" @change="selectHomepageCleanupPresetFromEvent">
                <option v-for="option in cleanupPresetOptions" :key="`homepage-${option.preset}`" :value="option.preset">{{ option.label }}</option>
              </select>
            </label>
            <label v-if="homepageCleanupSetting.preset === 'custom'" class="cleanup-days-field">
              <input :value="homepageCleanupSetting.days" inputmode="numeric" min="1" max="3650" type="number" @change="updateHomepageCleanupCustomDays" />
              <span>天</span>
            </label>
            <button class="cleanup-text-action" type="button" :disabled="homepageCleanupRunning || !homepageCleanupCountForDays(homepageCleanupSetting.days)" @click="cleanupHomepageBySetting">清理</button>
          </div>
        </section>

        <section class="cleanup-manual-card">
          <div class="cleanup-section-head">
            <span>手动清理</span>
            <small>{{ manualHomepageCleanupCount }} 张可清理</small>
          </div>
          <div class="cleanup-compact-row">
            <label class="cleanup-select-field">
              <span>早于</span>
              <select :value="manualHomepageCleanupPreset" @change="setManualHomepageCleanupPresetFromEvent">
                <option v-for="option in cleanupPresetOptions" :key="`manual-homepage-${option.preset}`" :value="option.preset">{{ option.label }}</option>
              </select>
            </label>
            <label v-if="manualHomepageCleanupPreset === 'custom'" class="cleanup-days-field">
              <input v-model.number="manualHomepageCleanupCustomDays" inputmode="numeric" min="1" max="3650" type="number" />
              <span>天</span>
            </label>
            <button class="cleanup-text-action danger" type="button" :disabled="homepageCleanupRunning || !manualHomepageCleanupCount" @click="runManualHomepageCleanup">
              {{ homepageCleanupRunning ? '清理中' : '清理' }}
            </button>
          </div>
        </section>

        <p v-if="homepageCleanupNotice" class="cleanup-notice">{{ homepageCleanupNotice }}</p>
      </section>
    </AppModal>
  </section>

  <section v-else class="screen no-tabs profile-theme-page missing-profile-theme">
    <header class="top-bar profile-theme-topbar">
      <button class="profile-theme-title-button" type="button" aria-label="返回聊天" @click="goBack">
        <h1 class="top-title">Profile Themes</h1>
      </button>
    </header>
    <main class="profile-theme-main">
      <section class="profile-theme-empty">
        <h2>没有找到这段聊天</h2>
        <button type="button" @click="goBack">返回</button>
      </section>
    </main>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ListChecks, PanelsTopLeft, Plus, Share2, SlidersHorizontal, Sparkles, Upload, X } from 'lucide-vue-next';
import AppModal from '@/components/common/AppModal.vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfileHomepageAutoCleanupSettings, ProfileHomepageAutoCleanupPreset, ProfileHomepageRecord, ProfileTheme } from '@/types/domain';
import { composeProfileThemeCode, decodeProfileThemesFromPng, defaultCustomProfileThemeCode, defaultProfileThemePrompt, encodeProfileThemesToPng, renderProfileThemeHtml, scopeProfileThemeCss, splitProfileThemeCode } from '@/utils/profileThemes';

const props = defineProps<{ id: string }>();

const route = useRoute();
const router = useRouter();
const store = useAppStore();

type ProfileThemeTab = 'themes' | 'homepages';

const activeTab = ref<ProfileThemeTab>(normalizeProfileThemeTab(route.query.tab));
const showEditor = ref(false);
const showCreator = ref(false);
const showExporter = ref(false);
const showHomepagePreview = ref(false);
const showHomepageCleanupSettings = ref(false);
const creatorTab = ref<'theme' | 'png'>('theme');
const editingThemeId = ref('');
const selectedHomepageId = ref('');
const selectedPngFile = ref<File | null>(null);
const importError = ref('');
const exportError = ref('');
const importing = ref(false);
const exporting = ref(false);
const homepageCleanupRunning = ref(false);
const homepageCleanupNotice = ref('');
const manualHomepageCleanupPreset = ref<ProfileHomepageAutoCleanupPreset>('7');
const manualHomepageCleanupCustomDays = ref(14);
const selectedExportThemeIds = ref<string[]>([]);
let homepagePreviewStyleElement: HTMLStyleElement | null = null;

const cleanupPresetOptions: Array<{ preset: ProfileHomepageAutoCleanupPreset; label: string; days: number }> = [
  { preset: '3', label: '3天', days: 3 },
  { preset: '7', label: '7天', days: 7 },
  { preset: '30', label: '一个月', days: 30 },
  { preset: 'custom', label: '自定义', days: 14 }
];

const homepageTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const themeDraft = reactive({
  name: '',
  prompt: '',
  regex: '',
  code: '',
  enabled: true
});

const conversation = computed(() => store.conversationById(props.id));
const character = computed(() => conversation.value ? store.characterById(conversation.value.charId) : null);
const themes = computed(() => character.value ? store.profileThemesForCharacter(character.value.id) : []);
const homepages = computed(() => character.value ? store.profileHomepagesForCharacter(character.value.id) : []);
const enabledThemes = computed(() => themes.value.filter((theme) => theme.enabled));
const editingTheme = computed(() => editingThemeId.value ? themes.value.find((theme) => theme.id === editingThemeId.value) ?? null : null);
const canDeleteEditingTheme = computed(() => Boolean(editingTheme.value && !editingTheme.value.builtIn));
const exportableThemes = computed(() => themes.value.filter((theme) => !theme.builtIn));
const selectedHomepage = computed(() => selectedHomepageId.value ? homepages.value.find((homepage) => homepage.id === selectedHomepageId.value) ?? null : null);
const manualHomepageCleanupDays = computed(() => manualHomepageCleanupPreset.value === 'custom'
  ? normalizeHomepageCleanupDays(manualHomepageCleanupCustomDays.value)
  : Number(manualHomepageCleanupPreset.value)
);
const manualHomepageCleanupCount = computed(() => homepageCleanupCountForDays(manualHomepageCleanupDays.value));
const homepageCleanupSetting = computed(() => character.value ? homepageCleanupSettingForCharacter(character.value.id) : defaultHomepageCleanupSetting());

function normalizeProfileThemeTab(tab: unknown): ProfileThemeTab {
  return tab === 'themes' ? 'themes' : 'homepages';
}

onMounted(async () => {
  await store.hydrate();
  if (character.value) {
    await store.ensureProfileThemesForCharacter(character.value.id);
    await runAutoHomepageCleanupForCurrentCharacter();
  }
});

watch(() => character.value?.id, async (characterId) => {
  if (!characterId) return;
  await store.ensureProfileThemesForCharacter(characterId);
  await runAutoHomepageCleanupForCurrentCharacter();
}, { immediate: true });

watch(() => route.query.tab, (tab) => {
  activeTab.value = normalizeProfileThemeTab(tab);
});

watch(showExporter, (open) => {
  if (open) return;
  selectedExportThemeIds.value = [];
  exportError.value = '';
  exporting.value = false;
});

watch(showCreator, (open) => {
  if (open) return;
  selectedPngFile.value = null;
  importError.value = '';
  importing.value = false;
});

watch([showHomepagePreview, selectedHomepage], ([open, homepage]) => {
  if (open && homepage) {
    updateHomepagePreviewStyle(homepage);
    return;
  }
  removeHomepagePreviewStyle();
});

onBeforeUnmount(() => {
  removeHomepagePreviewStyle();
});

function setActiveTab(tab: ProfileThemeTab) {
  activeTab.value = tab;
  void router.replace({ query: { ...route.query, tab } });
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  void router.replace({ name: 'chat-room', params: { id: props.id } });
}

function countPromptLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length || 1;
}

function normalizeHomepageCleanupDays(value: unknown) {
  return Math.min(3650, Math.max(1, Math.round(Number(value) || 1)));
}

function defaultHomepageCleanupSetting(): CharacterProfileHomepageAutoCleanupSettings {
  return {
    enabled: false,
    days: 7,
    preset: '7',
    lastCleanupAt: 0
  };
}

function daysForPreset(preset: ProfileHomepageAutoCleanupPreset, fallbackDays = 7) {
  if (preset === 'custom') return normalizeHomepageCleanupDays(fallbackDays);
  return normalizeHomepageCleanupDays(Number(preset));
}

function normalizeHomepageCleanupPreset(value: unknown): ProfileHomepageAutoCleanupPreset {
  return value === '3' || value === '7' || value === '30' || value === 'custom' ? value : '7';
}

function homepageCleanupSettingForCharacter(characterId: string): CharacterProfileHomepageAutoCleanupSettings {
  const entry = store.settings?.profileHomepageAutoCleanup?.[characterId];
  if (!entry) return defaultHomepageCleanupSetting();
  const preset = normalizeHomepageCleanupPreset(entry.preset);
  const days = daysForPreset(preset, entry.days);
  return {
    enabled: Boolean(entry.enabled),
    days,
    preset,
    lastCleanupAt: Math.max(0, Math.round(Number(entry.lastCleanupAt) || 0))
  };
}

function homepageCleanupCountForDays(days: number) {
  const currentCharacter = character.value;
  if (!currentCharacter) return 0;
  const cutoff = Date.now() - normalizeHomepageCleanupDays(days) * 24 * 60 * 60 * 1000;
  return homepages.value.filter((homepage) => (homepage.updatedAt || homepage.createdAt) < cutoff).length;
}

function formatHomepageTime(timestamp: number) {
  if (!timestamp) return '未知时间';
  return homepageTimeFormatter.format(new Date(timestamp));
}

function homepagePreviewText(homepage: ProfileHomepageRecord) {
  return (homepage.content || homepage.html || '这张主页没有可显示的文字内容。')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '这张主页没有可显示的文字内容。';
}

function homepageScopeId(homepage: ProfileHomepageRecord) {
  return `profile-homepage-${homepage.id}`;
}

function homepageHtml(homepage: ProfileHomepageRecord) {
  return homepage.html || renderProfileThemeHtml(homepage.content, '');
}

function updateHomepagePreviewStyle(homepage: ProfileHomepageRecord) {
  const css = scopeProfileThemeCss(homepage.css || '', homepageScopeId(homepage));
  if (!css) {
    removeHomepagePreviewStyle();
    return;
  }
  if (!homepagePreviewStyleElement) {
    homepagePreviewStyleElement = document.createElement('style');
    homepagePreviewStyleElement.setAttribute('data-profile-homepage-preview-style', 'true');
    document.head.appendChild(homepagePreviewStyleElement);
  }
  homepagePreviewStyleElement.textContent = css;
}

function removeHomepagePreviewStyle() {
  homepagePreviewStyleElement?.remove();
  homepagePreviewStyleElement = null;
}

function openHomepagePreview(homepageId: string) {
  selectedHomepageId.value = homepageId;
  showHomepagePreview.value = true;
}

async function deleteHomepage(homepageId: string) {
  const homepage = homepages.value.find((entry) => entry.id === homepageId);
  if (!homepage) return;
  if (!window.confirm(`删除“${homepage.themeName}”生成的这张主页？`)) return;
  await store.deleteProfileHomepage(homepageId);
  if (selectedHomepageId.value === homepageId) {
    selectedHomepageId.value = '';
    showHomepagePreview.value = false;
  }
}

async function saveHomepageCleanupSetting(nextSetting: CharacterProfileHomepageAutoCleanupSettings) {
  const currentCharacter = character.value;
  if (!currentCharacter || !store.settings) return;
  await store.saveSettings({
    ...store.settings,
    profileHomepageAutoCleanup: {
      ...store.settings.profileHomepageAutoCleanup,
      [currentCharacter.id]: nextSetting
    }
  });
}

function openHomepageCleanupSettings() {
  const setting = homepageCleanupSetting.value;
  manualHomepageCleanupPreset.value = '7';
  manualHomepageCleanupCustomDays.value = 14;
  homepageCleanupNotice.value = '';
  if (setting.preset === 'custom') manualHomepageCleanupCustomDays.value = setting.days;
  showHomepageCleanupSettings.value = true;
}

async function updateHomepageCleanupEnabled(event: Event) {
  const enabled = Boolean((event.target as HTMLInputElement).checked);
  const setting = homepageCleanupSetting.value;
  await saveHomepageCleanupSetting({ ...setting, enabled });
}

async function selectHomepageCleanupPreset(preset: ProfileHomepageAutoCleanupPreset) {
  const setting = homepageCleanupSetting.value;
  await saveHomepageCleanupSetting({
    ...setting,
    preset,
    days: daysForPreset(preset, setting.days)
  });
}

function selectHomepageCleanupPresetFromEvent(event: Event) {
  void selectHomepageCleanupPreset(normalizeHomepageCleanupPreset((event.target as HTMLSelectElement).value));
}

async function updateHomepageCleanupCustomDays(event: Event) {
  const days = normalizeHomepageCleanupDays((event.target as HTMLInputElement).value);
  const setting = homepageCleanupSetting.value;
  await saveHomepageCleanupSetting({ ...setting, preset: 'custom', days });
}

function setManualHomepageCleanupPresetFromEvent(event: Event) {
  manualHomepageCleanupPreset.value = normalizeHomepageCleanupPreset((event.target as HTMLSelectElement).value);
}

async function cleanupHomepageBySetting() {
  const currentCharacter = character.value;
  if (!currentCharacter || homepageCleanupRunning.value) return;
  homepageCleanupRunning.value = true;
  try {
    const days = homepageCleanupSetting.value.days;
    const removedCount = await store.cleanupProfileHomepagesForCharacters([currentCharacter.id], days);
    homepageCleanupNotice.value = removedCount ? `已清理 ${removedCount} 张生成主页。` : '没有需要清理的生成主页。';
  } finally {
    homepageCleanupRunning.value = false;
  }
}

async function runManualHomepageCleanup() {
  const currentCharacter = character.value;
  if (!currentCharacter || homepageCleanupRunning.value) return;
  homepageCleanupRunning.value = true;
  try {
    const removedCount = await store.cleanupProfileHomepagesForCharacters([currentCharacter.id], manualHomepageCleanupDays.value);
    homepageCleanupNotice.value = removedCount ? `已清理 ${removedCount} 张生成主页。` : '没有需要清理的生成主页。';
  } finally {
    homepageCleanupRunning.value = false;
  }
}

async function runAutoHomepageCleanupForCurrentCharacter() {
  const currentCharacter = character.value;
  if (!currentCharacter) return;
  await store.runProfileHomepageAutoCleanupForCharacters([currentCharacter.id]);
}

function resetThemeDraft() {
  editingThemeId.value = '';
  themeDraft.name = '';
  themeDraft.prompt = defaultProfileThemePrompt;
  themeDraft.regex = '';
  themeDraft.code = defaultCustomProfileThemeCode;
  themeDraft.enabled = true;
}

function openCreator() {
  resetThemeDraft();
  selectedPngFile.value = null;
  importError.value = '';
  creatorTab.value = 'theme';
  showCreator.value = true;
}

function openEditTheme(theme: ProfileTheme) {
  editingThemeId.value = theme.id;
  themeDraft.name = theme.name;
  themeDraft.prompt = theme.prompt;
  themeDraft.regex = theme.regex;
  themeDraft.code = composeProfileThemeCode(theme.template, theme.css) || defaultCustomProfileThemeCode;
  themeDraft.enabled = theme.enabled;
  showEditor.value = true;
}

async function saveThemeDraft(options: { closeCreator?: boolean } = {}) {
  const currentCharacter = character.value;
  if (!currentCharacter) return;
  const name = themeDraft.name.trim();
  const prompt = themeDraft.prompt.trim();
  if (!name || !prompt) {
    store.showConfigAlert('请填写主页主题名称和提示词。', '无法保存主页主题');
    return;
  }

  const existingTheme = editingTheme.value;
  const profileThemeCode = splitProfileThemeCode(themeDraft.code);
  if (existingTheme) {
    await store.saveProfileTheme({
      ...existingTheme,
      name,
      prompt,
      regex: themeDraft.regex.trim(),
      template: profileThemeCode.html,
      css: profileThemeCode.css
    });
    await store.setProfileThemeEnabledForCharacter(currentCharacter.id, existingTheme.id, themeDraft.enabled);
  } else {
    const createdTheme = await store.createProfileTheme({
      charId: currentCharacter.id,
      name,
      prompt,
      regex: themeDraft.regex.trim(),
      template: profileThemeCode.html,
      css: profileThemeCode.css
    });
    if (createdTheme) await store.setProfileThemeEnabledForCharacter(currentCharacter.id, createdTheme.id, themeDraft.enabled);
  }
  if (options.closeCreator) showCreator.value = false;
  else showEditor.value = false;
}

async function submitEditor() {
  await saveThemeDraft();
}

async function toggleTheme(theme: ProfileTheme) {
  const currentCharacter = character.value;
  if (!currentCharacter) return;
  await store.setProfileThemeEnabledForCharacter(currentCharacter.id, theme.id, !theme.enabled);
}

async function deleteEditingTheme() {
  const theme = editingTheme.value;
  if (!theme || theme.builtIn) return;
  if (!window.confirm(`删除主页主题“${theme.name}”？已生成的主页内容会保留。`)) return;
  await store.deleteProfileTheme(theme.id);
  editingThemeId.value = '';
  showEditor.value = false;
}

function openExporter() {
  selectedExportThemeIds.value = exportableThemes.value.map((theme) => theme.id);
  exportError.value = '';
  showExporter.value = true;
}

function selectPngFile(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedPngFile.value = input.files?.[0] ?? null;
  input.value = '';
  importError.value = '';
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('读取 PNG 文件失败')));
    reader.readAsDataURL(file);
  });
}

async function importThemesFromPng() {
  const currentCharacter = character.value;
  const file = selectedPngFile.value;
  if (!currentCharacter || !file || importing.value) {
    if (!file) importError.value = '请先选择 PNG 主页主题图片。';
    return;
  }
  if (file.type && file.type !== 'image/png') {
    importError.value = '请选择 PNG 格式的主页主题图片。';
    return;
  }
  importing.value = true;
  try {
    const importedThemes = await decodeProfileThemesFromPng(await readFileAsDataUrl(file), currentCharacter.id);
    const savedThemes = await store.importProfileThemes(currentCharacter.id, importedThemes);
    if (!savedThemes.length) {
      importError.value = 'PNG 中没有可用的主页主题。';
      return;
    }
    showCreator.value = false;
    store.showConfigAlert(`已导入 ${savedThemes.length} 个主页主题。`, '导入完成');
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'PNG 主页主题导入失败。';
  } finally {
    importing.value = false;
  }
}

async function submitCreator() {
  if (creatorTab.value === 'png') {
    await importThemesFromPng();
    return;
  }
  await saveThemeDraft({ closeCreator: true });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getExportFileName(items: ProfileTheme[]) {
  const firstName = items[0]?.name?.replace(/[^\u4e00-\u9fa5\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'profile-theme';
  return `link-profile-${firstName}-${Date.now()}.png`;
}

async function exportSelectedThemes() {
  if (exporting.value) return;
  const selectedIds = new Set(selectedExportThemeIds.value);
  const selectedThemes = exportableThemes.value.filter((theme) => selectedIds.has(theme.id));
  if (!selectedThemes.length) {
    exportError.value = '请先选择要导出的主页主题。';
    return;
  }
  exporting.value = true;
  try {
    const dataUrl = await encodeProfileThemesToPng(selectedThemes);
    downloadDataUrl(dataUrl, getExportFileName(selectedThemes));
    showExporter.value = false;
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '主页主题导出失败。';
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.profile-theme-page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: #f6f8f7;
  color: #111111;
}

.profile-theme-topbar {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: calc(8px + var(--safe-top)) calc(12px + var(--safe-right)) 8px calc(12px + var(--safe-left));
  background: rgba(246, 248, 247, 0.94);
  backdrop-filter: blur(18px);
}

.profile-theme-title-button,
.header-action-button,
.profile-theme-card,
.profile-theme-empty button,
.theme-editor-actions button,
.profile-theme-modal-footer button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.profile-theme-title-button {
  justify-self: start;
  min-width: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.profile-theme-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.header-action-button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  color: #202329;
}

.profile-theme-main {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px calc(12px + var(--safe-right)) 18px calc(12px + var(--safe-left));
}

.profile-theme-panel,
.profile-theme-section {
  display: grid;
  gap: 10px;
  max-width: 680px;
  margin: 0 auto;
}

.profile-theme-section {
  width: 100%;
}

.profile-theme-section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 6px;
}

.section-kicker,
.profile-theme-section-head h2,
.profile-theme-card strong,
.profile-theme-card small,
.profile-theme-empty h2,
.profile-theme-empty p,
.composer-hero span,
.composer-hero strong,
.composer-hero p {
  margin: 0;
}

.section-kicker {
  color: #7b838c;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.profile-theme-section-head h2 {
  margin-top: 2px;
  font-size: 18px;
  font-weight: 900;
}

.section-count {
  display: inline-grid;
  place-items: center;
  min-width: 42px;
  height: 26px;
  border-radius: 999px;
  background: #ffffff;
  color: #4f5963;
  font-size: 12px;
  font-weight: 900;
}

.profile-theme-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 68px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 10px 26px rgba(27, 37, 32, 0.05);
}

.profile-theme-card.disabled {
  opacity: 0.58;
}

.homepage-record-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  min-height: 76px;
  padding: 11px 34px 11px 11px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 10px 26px rgba(27, 37, 32, 0.05);
}

.homepage-record-main,
.homepage-record-delete {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.homepage-record-main {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  width: 100%;
  min-height: 54px;
  min-width: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.homepage-record-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.homepage-record-copy strong,
.homepage-record-copy small,
.homepage-record-copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.homepage-record-copy strong {
  color: #151719;
  font-size: 14px;
  font-weight: 900;
}

.homepage-record-copy small {
  color: #8a928c;
  font-size: 11px;
  font-weight: 760;
}

.homepage-record-copy em {
  color: #5f676f;
  font-size: 12px;
  font-style: normal;
  line-height: 1.35;
}

.homepage-record-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: #8a928c;
}

.homepage-record-delete:active {
  background: rgba(17, 17, 17, 0.06);
  color: #202329;
}

.profile-theme-bottom-tabs {
  position: relative;
  z-index: 20;
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 8px calc(12px + var(--safe-right)) calc(10px + var(--safe-bottom)) calc(12px + var(--safe-left));
  border-top: 1px solid rgba(17, 17, 17, 0.05);
  background: rgba(255, 255, 255, 0.96);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
}

.profile-theme-bottom-tabs button {
  display: grid;
  justify-items: center;
  gap: 3px;
  min-width: 0;
  min-height: 48px;
  padding: 6px 4px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #69706a;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.profile-theme-bottom-tabs button.active {
  background: #eef8f1;
  color: #111111;
}

.profile-theme-bottom-tabs span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.homepage-preview-sheet {
  display: grid;
  color: #111111;
}

.homepage-preview-body {
  min-width: 0;
  overflow: hidden;
}

.homepage-cleanup-panel {
  display: grid;
  gap: 12px;
  color: #151719;
}

.cleanup-manual-card,
.cleanup-character-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 13px 0;
  border-top: 1px solid rgba(17, 17, 17, 0.06);
  background: transparent;
}

.cleanup-character-card.single-character {
  padding-top: 0;
  border-top: 0;
}

.cleanup-section-head,
.cleanup-character-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.cleanup-section-head span {
  color: #202329;
  font-size: 13px;
  font-weight: 900;
}

.cleanup-section-head small,
.cleanup-notice {
  color: #767b82;
  font-size: 12px;
}

.cleanup-character-head {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cleanup-character-head img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.cleanup-character-head span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.cleanup-character-head strong,
.cleanup-character-head small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cleanup-character-head strong {
  font-size: 13px;
  font-weight: 900;
}

.cleanup-character-head small {
  color: #767b82;
  font-size: 11px;
}

.cleanup-switch-card {
  position: relative;
  flex: 0 0 auto;
}

.cleanup-switch-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.cleanup-switch-track {
  display: block;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: #d8dde2;
  transition: background 0.18s ease;
}

.cleanup-switch-track::after {
  content: '';
  display: block;
  width: 20px;
  height: 20px;
  margin: 2px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 3px 8px rgba(42, 35, 31, 0.18);
  transition: transform 0.18s ease;
}

.cleanup-switch-card input:checked + .cleanup-switch-track {
  background: #c9ecd5;
}

.cleanup-switch-card input:checked + .cleanup-switch-track::after {
  transform: translateX(18px);
}

.cleanup-compact-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
}

.cleanup-compact-row.character-row {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.cleanup-select-field,
.cleanup-days-field {
  display: grid;
  gap: 5px;
  color: #5f6761;
  font-size: 11px;
  font-weight: 900;
}

.cleanup-select-field select,
.cleanup-days-field input {
  height: 38px;
  border: 1px solid rgba(20, 20, 20, 0.08);
  border-radius: 12px;
  background: #f6f7f8;
  color: #151719;
  font: inherit;
}

.cleanup-select-field select {
  min-width: 116px;
  padding: 0 10px;
}

.cleanup-days-field {
  grid-template-columns: 58px auto;
  align-items: end;
}

.cleanup-days-field span {
  padding-bottom: 10px;
  color: #767b82;
}

.cleanup-days-field input {
  width: 58px;
  padding: 0 8px;
}

.cleanup-text-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  height: 38px;
  border: 0;
  border-radius: 12px;
  background: #eef8f1;
  color: #24613a;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
}

.cleanup-text-action.danger {
  background: rgba(229, 72, 77, 0.1);
  color: #e5484d;
}

.cleanup-notice {
  margin: 0;
  line-height: 1.45;
}

.theme-switch {
  position: relative;
  width: 44px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  background: #d8dde2;
  padding: 3px;
}

.theme-switch span {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: #ffffff;
  transition: transform 0.18s ease;
}

.theme-switch.active {
  background: #06c755;
}

.theme-switch.active span {
  transform: translateX(18px);
}

.theme-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.theme-copy strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-copy small,
.theme-meta {
  color: #737b85;
  font-size: 11px;
  font-weight: 750;
}

.theme-meta {
  white-space: nowrap;
}

.profile-theme-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 38vh;
  padding: 28px 18px;
  color: #7a838c;
  text-align: center;
}

.profile-theme-empty h2,
.profile-theme-empty strong {
  color: #22262c;
  font-size: 17px;
  font-weight: 900;
}

.profile-theme-empty p {
  max-width: 280px;
  font-size: 12px;
  line-height: 1.5;
}

.profile-theme-empty button {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  background: #202329;
  color: #ffffff;
  font-size: 12px;
  font-weight: 900;
}

.profile-theme-editor,
.profile-theme-exporter {
  display: grid;
  gap: 12px;
  color: #202329;
}

.profile-theme-creator,
.profile-theme-exporter {
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.profile-theme-exporter {
  grid-template-rows: auto minmax(0, 1fr) auto auto;
}

.profile-theme-editor-fields,
.composer-section {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.profile-theme-editor label {
  display: grid;
  gap: 6px;
}

.profile-theme-editor label span {
  color: #4f565f;
  font-size: 12px;
  font-weight: 850;
}

.profile-theme-editor input,
.profile-theme-editor textarea {
  width: 100%;
  border: 1px solid rgba(20, 20, 20, 0.08);
  border-radius: 8px;
  padding: 10px;
  outline: 0;
  background: rgba(255, 255, 255, 0.86);
  color: #202329;
  font: inherit;
  line-height: 1.5;
}

.profile-theme-editor textarea {
  resize: vertical;
}

.theme-editor-switch {
  display: flex !important;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px !important;
}

.theme-editor-switch input {
  width: 18px;
  height: 18px;
  padding: 0;
}

.theme-editor-actions,
.profile-theme-modal-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.theme-editor-actions.editing {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.theme-editor-actions button,
.profile-theme-modal-footer button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 900;
}

.theme-editor-actions .secondary,
.footer-cancel {
  background: #eef0f2;
  color: #2b3036;
}

.theme-editor-actions .primary,
.footer-save {
  background: #202329;
  color: #ffffff;
}

.theme-editor-actions .danger {
  background: rgba(229, 72, 77, 0.1);
  color: #e5484d;
}

.composer-hero {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, rgba(255, 209, 224, 0.65), transparent 30%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 248, 252, 0.94));
}

.composer-avatar {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  border-radius: 20px;
  background: #eef8f1;
  color: #057a35;
}

.composer-avatar.composer-avatar {
  display: grid;
  color: #057a35;
  letter-spacing: 0;
  text-transform: none;
}

.composer-avatar svg {
  width: 26px;
  height: 26px;
}

.composer-hero > div {
  min-width: 0;
}

.composer-hero span,
.composer-hero strong {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-hero span {
  color: #9d7a86;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.composer-hero strong {
  font-size: 16px;
  font-weight: 900;
}

.composer-hero p {
  margin: 4px 0 0;
  color: #77808a;
  font-size: 12px;
  line-height: 1.5;
}

.composer-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.composer-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #6f7079;
  font-size: 12px;
  font-weight: 800;
}

.composer-tab.active {
  background: linear-gradient(180deg, #111111, #2c2f39);
  color: #ffffff;
}

.file-drop-card {
  position: relative;
  display: grid;
  place-items: center;
  gap: 7px;
  min-height: 138px;
  border: 1px dashed rgba(20, 20, 20, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.74);
  color: #4f565f;
  text-align: center;
}

.file-drop-card input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.file-drop-card strong {
  color: #202329;
  font-size: 14px;
}

.file-drop-card span,
.export-theme-item small {
  color: #727b85;
  font-size: 12px;
}

.export-theme-list {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: auto;
  overflow: auto;
}

.export-theme-item {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border-radius: 16px;
  background: rgba(246, 248, 251, 0.96);
}

.export-theme-item input {
  width: 18px;
  height: 18px;
  accent-color: #06c755;
}

.export-theme-item span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.export-theme-item strong,
.export-theme-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-theme-item strong {
  color: #111111;
  font-size: 14px;
  font-weight: 900;
}

.export-theme-item small {
  color: #77808a;
  font-size: 12px;
}

.sync-feedback {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.sync-feedback.error {
  color: #d33c41;
}

.compact-empty {
  min-height: 160px;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:global(.modal-panel .modal-body .profile-theme-creator.profile-theme-creator .profile-theme-modal-footer),
:global(.modal-panel .modal-body .style-export-composer.style-export-composer .profile-theme-modal-footer) {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 0 !important;
  width: 100% !important;
}

:global(.modal-panel .modal-body .profile-theme-creator.profile-theme-creator .footer-button),
:global(.modal-panel .modal-body .style-export-composer.style-export-composer .footer-button) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 42px !important;
  border-radius: 0 !important;
}

:global(.modal-panel .modal-body .profile-theme-creator.profile-theme-creator .footer-cancel),
:global(.modal-panel .modal-body .style-export-composer.style-export-composer .footer-cancel) {
  border-radius: 16px 0 0 16px !important;
}

:global(.modal-panel .modal-body .profile-theme-creator.profile-theme-creator .footer-save),
:global(.modal-panel .modal-body .style-export-composer.style-export-composer .footer-save) {
  border-radius: 0 16px 16px 0 !important;
}

:global(.modal-panel .modal-body .profile-theme-editor:not(.profile-theme-creator) .theme-editor-actions) {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 8px !important;
  width: 100% !important;
}

:global(.modal-panel .modal-body .profile-theme-editor:not(.profile-theme-creator) .theme-editor-actions.editing) {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}

:global(.modal-panel .modal-body .profile-theme-editor:not(.profile-theme-creator) .theme-editor-actions button) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-width: 0 !important;
}

:global(.modal-panel .modal-body .profile-theme-creator.profile-theme-creator .composer-avatar),
:global(.modal-panel .modal-body .style-export-composer.style-export-composer .composer-avatar) {
  display: grid !important;
  place-items: center !important;
  width: 56px !important;
  height: 56px !important;
}

:global(.modal-panel .modal-body .profile-theme-creator.profile-theme-creator .composer-avatar svg),
:global(.modal-panel .modal-body .style-export-composer.style-export-composer .composer-avatar svg) {
  width: 26px !important;
  height: 26px !important;
}
</style>
