<template>
  <section class="data-management-page">
    <article class="data-showcase">
      <div class="data-stage">
        <div class="stage-topline">
          <span class="stage-badge">Local</span>
          <button class="stage-refresh" type="button" :disabled="storageRefreshing || Boolean(dataBusy)" aria-label="刷新缓存统计" @click="refreshDataSnapshot">
            <RefreshCw :size="15" :class="{ spinning: storageRefreshing }" />
          </button>
        </div>

        <div class="data-core">
          <span>Browser Cache</span>
          <strong>{{ browserUsageLabel }}</strong>
        </div>

        <div class="storage-meter" role="meter" aria-label="浏览器缓存占用" :aria-valuenow="Math.round(storagePercent)" aria-valuemin="0" aria-valuemax="100">
          <span class="storage-meter-fill" :style="meterStyle"></span>
        </div>

        <div class="stage-breakdown" aria-label="缓存数据关系">
          <article>
            <span>可管理数据</span>
            <strong>{{ managedDataLabel }}</strong>
          </article>
          <article>
            <span>浏览器上限</span>
            <strong>{{ storageQuotaValueLabel }}</strong>
          </article>
          <article>
            <span>占浏览器</span>
            <strong>{{ managedStoragePercentLabel }}</strong>
          </article>
        </div>
      </div>

      <div class="showcase-copy">
        <div class="showcase-topline">
          <div>
            <p class="module-kicker">Data Storage</p>
            <h2>本地缓存管理</h2>
          </div>
        </div>

        <div class="inline-cleanup" aria-label="精准清理">
          <div class="inline-cleanup-top">
            <strong>精准清理</strong>
            <small>保留核心资料</small>
          </div>

          <div class="cleanup-list">
            <button
              v-for="action in cleanupActionStats"
              :key="action.id"
              class="cleanup-action"
              type="button"
              :disabled="Boolean(dataBusy)"
              :aria-label="`${action.label}：${action.description}，预计释放 ${action.freedLabel}`"
              @click="runCleanupAction(action.id)"
            >
              <span class="cleanup-icon" :class="action.tone">
                <span v-if="dataBusy === action.id" class="button-spinner" aria-hidden="true"></span>
                <component v-else :is="action.icon" :size="16" />
              </span>
              <span class="cleanup-copy">
                <strong>{{ action.label }}</strong>
              </span>
              <span class="cleanup-size">{{ action.freedLabel }}</span>
            </button>
          </div>
        </div>
      </div>
    </article>

    <section class="module-card protection-card" :class="`tone-${protectionTone}`" aria-label="设备存储保护">
      <header class="module-copy-top protection-head">
        <div>
          <p class="module-kicker">Device Guard</p>
          <strong>设备存储保护</strong>
        </div>
        <span class="risk-badge" :class="protectionTone">{{ protectionRiskLabel }}</span>
      </header>

      <p class="protection-summary">{{ protectionSummary }}</p>

      <div class="protection-grid" aria-label="存储保护状态">
        <article>
          <span>运行模式</span>
          <strong>{{ pwaModeLabel }}</strong>
        </article>
        <article>
          <span>持久化</span>
          <strong>{{ persistenceStatusLabel }}</strong>
        </article>
        <article>
          <span>浏览器环境</span>
          <strong>{{ browserContextLabel }}</strong>
        </article>
      </div>

      <div class="protection-actions">
        <button class="protection-action primary" type="button" :disabled="protectionBusy === 'persist'" @click="enableStorageProtection">
          <span v-if="protectionBusy === 'persist'" class="button-spinner" aria-hidden="true"></span>
          <ShieldCheck v-else :size="16" />
          <span>开启存储保护</span>
        </button>
        <button class="protection-action" type="button" :disabled="browserContext.installed || protectionBusy === 'install'" @click="runPwaInstallAction">
          <span v-if="protectionBusy === 'install'" class="button-spinner" aria-hidden="true"></span>
          <Smartphone v-else :size="16" />
          <span>{{ installActionLabel }}</span>
        </button>
        <button class="protection-action icon-only" type="button" :disabled="storageRefreshing" aria-label="刷新存储保护检测" @click="refreshDataSnapshot">
          <RefreshCw :size="16" :class="{ spinning: storageRefreshing }" />
        </button>
      </div>

      <div v-if="installGuideOpen" class="install-guide">
        <p><strong>建议使用：</strong>系统浏览器，或添加到主屏幕后从图标打开。</p>
        <p><strong>避免使用：</strong>无痕/隐私模式，以及微信、QQ、微博、抖音等内置浏览器。</p>
        <p><strong>空间不足时：</strong>优先清理生成图候选、贴纸缓存和用户发送图片。</p>
      </div>
    </section>

    <p v-if="dataBusy" class="busy-notice" role="status" aria-live="polite">
      <span class="busy-spinner" aria-hidden="true"></span>
      <span>{{ dataBusyLabel }}</span>
    </p>

    <section class="module-card composition-card" aria-label="数据组成">
      <header class="module-copy-top">
        <div>
          <p class="module-kicker">Data Map</p>
          <strong>数据组成</strong>
        </div>
        <small>{{ hasDataSnapshot ? `${dataSections.length} 组` : '未刷新' }}</small>
      </header>

      <div class="composition-list">
        <p v-if="!hasDataSnapshot" class="composition-empty">点击右上角刷新按钮后计算数据组成。</p>
        <article v-for="section in rankedSections" :key="section.id" class="composition-row" :class="{ protected: section.protected }">
          <span class="section-index">{{ section.rank }}</span>
          <div class="composition-main">
            <div class="composition-copy">
              <strong>{{ section.label }}</strong>
              <span>{{ section.description }}</span>
            </div>
            <div class="composition-track" aria-hidden="true">
              <span :style="{ width: `${section.share}%` }"></span>
            </div>
          </div>
          <small>{{ section.count }} 项 · {{ formatBytes(section.bytes) }}</small>
        </article>
      </div>
    </section>

    <p v-if="dataFeedback" class="feedback" :class="dataFeedbackKind">{{ dataFeedback }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import { Camera, ImageOff, Images, RefreshCw, ShieldCheck, Smartphone } from 'lucide-vue-next';
import { useAppStore, type DataCleanupAction } from '@/stores/appStore';
import { getBrowserStorageContext, promptPwaInstall, pwaInstallPromptChangeEvent, queryPersistentStorage, requestPersistentStorage, type BrowserStorageContext, type StoragePersistenceResult } from '@/utils/storageProtection';

interface BrowserStorageSnapshot {
  usage: number;
  quota: number;
}

type CleanupTone = 'photo' | 'candidate' | 'sticker';
type ProtectionTone = 'safe' | 'warn' | 'danger';

interface CleanupActionConfig {
  id: DataCleanupAction;
  label: string;
  description: string;
  icon: Component;
  tone: CleanupTone;
}

const store = useAppStore();
type DataInventorySnapshot = ReturnType<typeof store.getDataInventory>;
type CleanupEstimateMap = Partial<Record<DataCleanupAction, number>>;

const dataBusy = ref<DataCleanupAction | ''>('');
const dataFeedback = ref('');
const dataFeedbackKind = ref<'success' | 'error'>('success');
const storageRefreshing = ref(false);
const storageSnapshotReady = ref(false);
const browserStorage = ref<BrowserStorageSnapshot>({ usage: 0, quota: 0 });
const browserContext = ref<BrowserStorageContext>(getBrowserStorageContext());
const persistence = ref<StoragePersistenceResult>({ status: 'unknown', persisted: false, supported: false });
const protectionBusy = ref<'persist' | 'install' | ''>('');
const installGuideOpen = ref(false);
const dataInventory = ref<DataInventorySnapshot | null>(null);
const cleanupEstimates = ref<CleanupEstimateMap>({});

const cleanupActions: CleanupActionConfig[] = [
  {
    id: 'user-sent-images',
    label: '用户发送图片',
    description: '清理拍照和照片按钮发出的图片数据',
    icon: Camera,
    tone: 'photo'
  },
  {
    id: 'image-candidates',
    label: '生成图候选记录',
    description: '清理历史候选，保留当前正在使用的图片',
    icon: Images,
    tone: 'candidate'
  },
  {
    id: 'sticker-local-cache',
    label: '贴纸本地缓存',
    description: '清理贴纸的本地副本和内联缓存',
    icon: ImageOff,
    tone: 'sticker'
  }
];

const hasDataSnapshot = computed(() => Boolean(dataInventory.value));
const dataSections = computed(() => dataInventory.value?.sections ?? []);
const managedBytes = computed(() => dataInventory.value?.totalBytes ?? 0);
const managedDataLabel = computed(() => hasDataSnapshot.value ? formatBytes(managedBytes.value) : '未刷新');
const browserUsageBytes = computed(() => browserStorage.value.usage || managedBytes.value);
const browserUsageLabel = computed(() => storageSnapshotReady.value ? formatBytes(browserUsageBytes.value) : '未刷新');
const storageQuotaValueLabel = computed(() => storageSnapshotReady.value ? (browserStorage.value.quota > 0 ? formatBytes(browserStorage.value.quota) : '未知') : '未刷新');
const storagePercent = computed(() => storageSnapshotReady.value && browserStorage.value.quota > 0 ? Math.min(100, browserUsageBytes.value / browserStorage.value.quota * 100) : 0);
const meterStyle = computed(() => ({ width: storageSnapshotReady.value ? `${Math.max(1.5, storagePercent.value)}%` : '0%' }));
const managedStoragePercent = computed(() => storageSnapshotReady.value && browserStorage.value.quota > 0 ? Math.min(100, managedBytes.value / browserStorage.value.quota * 100) : 0);
const managedStoragePercentLabel = computed(() => storageSnapshotReady.value ? (browserStorage.value.quota > 0 ? `${managedStoragePercent.value.toFixed(managedStoragePercent.value >= 10 ? 0 : 1)}%` : '未知') : '未刷新');
const persistenceStatusLabel = computed(() => {
  if (persistence.value.status === 'granted') return '已开启';
  if (persistence.value.status === 'denied') return '未开启';
  if (persistence.value.status === 'unsupported') return '不支持';
  return '检测中';
});
const pwaModeLabel = computed(() => browserContext.value.installed ? 'PWA 已安装' : '浏览器打开');
const browserContextLabel = computed(() => browserContext.value.embeddedBrowser ? browserContext.value.embeddedBrowserLabel : '常规浏览器');
const storageUsageHighRisk = computed(() => storageSnapshotReady.value && storagePercent.value >= 85);
const protectionTone = computed<ProtectionTone>(() => {
  if (browserContext.value.embeddedBrowser || storagePercent.value >= 95) return 'danger';
  if (!browserContext.value.installed || persistence.value.status !== 'granted' || storageUsageHighRisk.value) return 'warn';
  return 'safe';
});
const protectionRiskLabel = computed(() => {
  if (protectionTone.value === 'safe') return '较稳';
  if (protectionTone.value === 'danger') return '高风险';
  return '需加固';
});
const protectionSummary = computed(() => {
  if (browserContext.value.embeddedBrowser) return `${browserContext.value.embeddedBrowserLabel} 更容易清理站点数据，建议换系统浏览器或 PWA。`;
  if (storageSnapshotReady.value && storagePercent.value >= 95) return '浏览器缓存接近上限，手机系统清理站点数据的概率会升高。';
  if (persistence.value.status === 'unsupported') return '当前浏览器不支持持久化存储保护，建议安装 PWA 或换用系统浏览器。';
  if (persistence.value.status !== 'granted') return '浏览器尚未授予持久化存储保护，开启后可降低本地数据被清理的概率。';
  if (!browserContext.value.installed) return '持久化保护已开启，安装到主屏幕后使用会更稳定。';
  return '已安装运行且持久化保护可用，本地数据被系统清理的概率较低。';
});
const installActionLabel = computed(() => {
  if (browserContext.value.installed) return '已安装';
  return browserContext.value.installPromptAvailable ? '安装到主屏幕' : '安装指引';
});
const rankedSections = computed(() => {
  const totalBytes = Math.max(1, managedBytes.value);
  return [...dataSections.value]
    .sort((left, right) => right.bytes - left.bytes)
    .map((section, index) => ({
      ...section,
      rank: String(index + 1).padStart(2, '0'),
      share: Math.max(section.bytes > 0 ? 4 : 0, Math.min(100, section.bytes / totalBytes * 100))
    }));
});
const cleanupActionStats = computed(() => cleanupActions.map((action) => {
  const freedBytes = cleanupEstimates.value[action.id];
  return {
    ...action,
    freedBytes,
    freedLabel: typeof freedBytes === 'number' ? (freedBytes > 0 ? formatBytes(freedBytes) : '0 B') : '未统计'
  };
}));
const dataBusyLabel = computed(() => {
  const action = cleanupActions.find((item) => item.id === dataBusy.value);
  return action ? `正在清理${action.label}，请稍候。` : '正在处理本地数据，请稍候。';
});

const installPromptChangeListener = () => {
  browserContext.value = getBrowserStorageContext();
};

onMounted(() => {
  window.addEventListener(pwaInstallPromptChangeEvent, installPromptChangeListener);
  void refreshDataSnapshot();
});

onBeforeUnmount(() => {
  window.removeEventListener(pwaInstallPromptChangeEvent, installPromptChangeListener);
});

function setDataFeedback(message: string, kind: 'success' | 'error' = 'success') {
  dataFeedback.value = message;
  dataFeedbackKind.value = kind;
}

async function waitForBusyPaint() {
  await nextTick();
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

async function refreshDataSnapshot() {
  storageRefreshing.value = true;
  dataFeedback.value = '';
  await waitForBusyPaint();
  try {
    const nextInventory = store.getDataInventory();
    const nextCleanupEstimates = cleanupActions.reduce<CleanupEstimateMap>((estimates, action) => {
      estimates[action.id] = store.estimateCleanupFreedBytes(action.id);
      return estimates;
    }, {});
    const [estimate, nextPersistence] = await Promise.all([
      navigator.storage?.estimate?.(),
      queryPersistentStorage()
    ]);
    dataInventory.value = nextInventory;
    cleanupEstimates.value = nextCleanupEstimates;
    browserContext.value = getBrowserStorageContext();
    persistence.value = nextPersistence;
    browserStorage.value = {
      usage: Number(estimate?.usage ?? 0),
      quota: Number(estimate?.quota ?? 0)
    };
    storageSnapshotReady.value = true;
  } catch {
    dataInventory.value = null;
    cleanupEstimates.value = {};
    browserStorage.value = { usage: 0, quota: 0 };
    storageSnapshotReady.value = false;
    setDataFeedback('刷新缓存统计失败，请稍后重试。', 'error');
  } finally {
    storageRefreshing.value = false;
  }
}

async function enableStorageProtection() {
  protectionBusy.value = 'persist';
  dataFeedback.value = '';
  await waitForBusyPaint();

  try {
    const result = await requestPersistentStorage();
    persistence.value = result;
    browserContext.value = getBrowserStorageContext();
    if (result.status === 'granted') setDataFeedback('已开启浏览器持久化存储保护。');
    else if (result.status === 'unsupported') setDataFeedback('当前浏览器不支持持久化存储保护，请优先使用系统浏览器或 PWA。', 'error');
    else setDataFeedback('浏览器暂未授予持久化存储保护，请安装 PWA 或换用系统浏览器后再试。', 'error');
  } finally {
    protectionBusy.value = '';
  }
}

async function runPwaInstallAction() {
  if (browserContext.value.installed) return;
  protectionBusy.value = 'install';
  dataFeedback.value = '';
  await waitForBusyPaint();

  try {
    if (!browserContext.value.installPromptAvailable) {
      installGuideOpen.value = true;
      setDataFeedback('当前浏览器没有提供安装弹窗，请按安装指引操作。');
      return;
    }

    const outcome = await promptPwaInstall();
    browserContext.value = getBrowserStorageContext();
    if (outcome === 'accepted') setDataFeedback('安装请求已提交，请从主屏幕图标打开 LINK。');
    else if (outcome === 'dismissed') setDataFeedback('已关闭安装弹窗，可稍后再安装。');
    else {
      installGuideOpen.value = true;
      setDataFeedback('当前浏览器无法直接弹出安装窗口，请按安装指引操作。', 'error');
    }
  } finally {
    protectionBusy.value = '';
  }
}

async function runCleanupAction(action: DataCleanupAction) {
  const cleanup = cleanupActionStats.value.find((item) => item.id === action);
  const actionLabel = cleanup?.label ?? '缓存';
  const freedLabel = cleanup?.freedLabel ?? '0 B';
  const confirmMessage = typeof cleanup?.freedBytes !== 'number'
    ? `即将清理「${actionLabel}」。当前未计算预计释放量，继续吗？`
    : cleanup.freedBytes
    ? `即将清理「${actionLabel}」，预计释放 ${freedLabel}。继续吗？`
    : `「${actionLabel}」当前预计可释放 0 B。仍要执行清理吗？`;
  if (!window.confirm(confirmMessage)) return;

  dataBusy.value = action;
  dataFeedback.value = '';
  await waitForBusyPaint();

  try {
    const changed = await store.cleanupData(action);
    dataInventory.value = null;
    cleanupEstimates.value = {};
    browserStorage.value = { usage: 0, quota: 0 };
    storageSnapshotReady.value = false;
    setDataFeedback(changed ? `已清理 ${changed} 项，点击刷新查看最新统计。` : '没有需要清理的缓存。');
  } catch (error) {
    setDataFeedback(error instanceof Error ? error.message : '清理失败。', 'error');
  } finally {
    dataBusy.value = '';
  }
}
</script>

<style scoped>
.data-management-page {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding-bottom: calc(10px + var(--safe-bottom));
  container-type: inline-size;
}

.data-showcase,
.module-card {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 249, 252, 0.96));
  box-shadow: 0 16px 34px rgba(26, 30, 38, 0.06);
  overflow: hidden;
}

.data-stage {
  display: grid;
  grid-template-rows: auto auto auto auto;
  gap: 14px;
  min-width: 0;
  min-height: 210px;
  padding: 14px;
  border-radius: 20px;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(255, 221, 232, 0.88), transparent 28%),
    radial-gradient(circle at left bottom, rgba(201, 235, 218, 0.78), transparent 34%),
    linear-gradient(135deg, #fff8fb, #f1f6fb 56%, #eef8f1);
}

.stage-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.stage-badge,
.stage-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  border-radius: 999px;
  backdrop-filter: blur(12px);
}

.stage-badge {
  padding: 0 10px;
  background: rgba(231, 248, 236, 0.96);
  color: #138046;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.stage-refresh {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.74);
  color: rgba(35, 31, 37, 0.72);
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.04);
}

.stage-refresh:disabled,
.cleanup-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.spinning {
  animation: dataSpin 0.72s linear infinite;
}

.data-core {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.data-core span {
  color: rgba(35, 31, 37, 0.62);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
  line-height: 1;
  text-transform: uppercase;
}

.data-core strong {
  color: rgba(35, 31, 37, 0.9);
  font-family: var(--app-current-font-family);
  font-size: 38px;
  font-weight: 650;
  line-height: 1;
}

.storage-meter {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.1);
}

.storage-meter-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(17, 17, 17, 0.62), rgba(39, 118, 91, 0.78));
}

.stage-breakdown {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}

.stage-breakdown article {
  display: grid;
  justify-items: center;
  gap: 4px;
  min-width: 0;
  padding: 9px 6px;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.035);
  text-align: center;
}

.stage-breakdown article span {
  color: rgba(35, 31, 37, 0.56);
  font-size: 10px;
  font-weight: 900;
  line-height: 1.2;
}

.stage-breakdown article strong {
  color: #231f25;
  font-size: 14px;
  font-weight: 950;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

@keyframes dataSpin {
  to {
    transform: rotate(360deg);
  }
}

.showcase-copy,
.cleanup-list,
.composition-list {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.showcase-topline,
.module-copy-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.showcase-topline > div,
.module-copy-top > div {
  min-width: 0;
}

.module-kicker {
  margin: 0;
  color: #9d7a86;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  line-height: 1;
  text-transform: uppercase;
}

.showcase-topline h2,
.module-copy-top strong {
  display: block;
  margin: 4px 0 0;
  color: #231f25;
  font-family: var(--app-current-font-family);
  font-size: 24px;
  font-weight: 650;
  line-height: 1.12;
  overflow-wrap: anywhere;
}

.showcase-topline small,
.module-copy-top small {
  flex: 0 1 auto;
  min-width: 0;
  color: #76737b;
  font-size: 11px;
  font-weight: 800;
  text-align: right;
  overflow-wrap: anywhere;
}

.inline-cleanup {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding-top: 2px;
}

.inline-cleanup .cleanup-list {
  gap: 6px;
}

.inline-cleanup-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.inline-cleanup-top strong {
  color: #231f25;
  font-size: 13px;
  font-weight: 950;
  line-height: 1.2;
}

.inline-cleanup-top small {
  color: #76737b;
  font-size: 11px;
  font-weight: 850;
  white-space: nowrap;
}

.protection-card {
  gap: 12px;
}

.protection-card.tone-safe {
  background: linear-gradient(180deg, rgba(247, 253, 249, 0.96), rgba(240, 249, 244, 0.96));
}

.protection-card.tone-warn {
  background: linear-gradient(180deg, rgba(255, 252, 245, 0.97), rgba(251, 247, 236, 0.97));
}

.protection-card.tone-danger {
  background: linear-gradient(180deg, rgba(255, 248, 248, 0.97), rgba(251, 240, 240, 0.97));
}

.protection-head {
  align-items: center;
}

.risk-badge {
  flex: 0 0 auto;
  padding: 6px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  line-height: 1;
  white-space: nowrap;
}

.risk-badge.safe {
  background: #e5f7eb;
  color: #14723d;
}

.risk-badge.warn {
  background: #fff2d8;
  color: #94610f;
}

.risk-badge.danger {
  background: #ffe7e7;
  color: #aa2727;
}

.protection-summary {
  margin: 0;
  color: #4f5754;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.protection-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.protection-grid article {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 10px 8px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.035);
}

.protection-grid span {
  color: #747a78;
  font-size: 10px;
  font-weight: 900;
  line-height: 1.15;
}

.protection-grid strong {
  min-width: 0;
  color: #1d2420;
  font-size: 12px;
  font-weight: 950;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.protection-actions {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
  gap: 8px;
  min-width: 0;
}

.protection-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
  min-height: 40px;
  padding: 0 11px;
  border-radius: 14px;
  background: #ffffff;
  color: #24302a;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.05);
  font-size: 12px;
  font-weight: 950;
  line-height: 1.15;
}

.protection-action.primary {
  background: #161d19;
  color: #ffffff;
  box-shadow: none;
}

.protection-action.icon-only {
  width: 40px;
  padding: 0;
}

.protection-action:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.protection-action span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.install-guide {
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 11px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.035);
}

.install-guide p {
  margin: 0;
  color: #59605d;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.install-guide strong {
  color: #242a27;
  font-weight: 950;
}

.composition-copy span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
}

.busy-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 16px;
  background: #eef8f1;
  color: #116237;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.busy-spinner,
.button-spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(17, 98, 55, 0.22);
  border-top-color: #116237;
  border-radius: 999px;
  animation: dataSpin 0.72s linear infinite;
}

.composition-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border-radius: 18px;
  background: #f6f8f8;
}

.composition-empty {
  margin: 0;
  padding: 14px 12px;
  border-radius: 16px;
  background: #f6f8f8;
  color: #76737b;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.45;
  text-align: center;
}

.composition-row.protected {
  background: #f1f4f5;
}

.section-index {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 12px;
  background: #ffffff;
  color: #9d7a86;
  font-size: 11px;
  font-weight: 950;
}

.composition-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.composition-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.composition-copy strong {
  min-width: 0;
  color: #171d1b;
  font-size: 13px;
  font-weight: 950;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composition-copy span {
  overflow-wrap: anywhere;
}

.composition-track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #e5ebee;
}

.composition-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2c2f39, #7fbaa0);
}

.composition-row small,
.cleanup-size {
  color: #6d7478;
  font-size: 11px;
  font-weight: 950;
  white-space: nowrap;
}

.cleanup-action {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 42px;
  padding: 6px 8px;
  border-radius: 14px;
  background: #f5f6f8;
  color: #151a18;
  text-align: left;
}

.cleanup-icon {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 11px;
}

.cleanup-icon.photo {
  background: #e9f4ff;
  color: #1b67a7;
}

.cleanup-icon.candidate {
  background: #f1edf9;
  color: #6944a1;
}

.cleanup-icon.sticker {
  background: #eef7ed;
  color: #267147;
}

.cleanup-copy {
  min-width: 0;
}

.cleanup-copy strong {
  display: block;
  min-width: 0;
  color: #171d1b;
  font-size: 13px;
  font-weight: 950;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cleanup-size {
  justify-self: end;
  padding: 4px 7px;
  border-radius: 999px;
  background: #ffffff;
}

.feedback {
  margin: 0;
  color: #136c36;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.feedback.error {
  color: #a82424;
}

@container (max-width: 360px) {
  .data-management-page {
    gap: 12px;
  }

  .data-showcase,
  .module-card {
    padding: 11px;
  }

  .data-stage {
    min-height: 186px;
  }

  .data-core strong {
    font-size: 32px;
  }

  .showcase-topline,
  .module-copy-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .showcase-topline small,
  .module-copy-top small {
    text-align: left;
  }

  .composition-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .protection-grid,
  .protection-actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .protection-action.icon-only {
    width: auto;
  }

  .composition-row small {
    grid-column: 2;
  }

  .inline-cleanup-top {
    align-items: flex-start;
  }
}
</style>