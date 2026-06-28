<template>
  <section class="offline-memory-page">
    <header class="offline-memory-topbar">
      <button class="offline-memory-icon" type="button" aria-label="返回线下章节" @click="$emit('back')">
        <ArrowLeft :size="21" />
      </button>
      <div class="offline-memory-title">
        <span>memory chapter</span>
        <strong>{{ displayName }} 的总结</strong>
      </div>
      <button class="offline-memory-text-button" type="button" @click="showManualSummary = !showManualSummary">{{ showManualSummary ? '收起' : '总结' }}</button>
    </header>

    <main class="offline-memory-scroll">
      <section class="memory-hero-card">
        <div>
          <span>Hippocampus Memory</span>
          <strong>{{ totalMemoryTokens }} tokens</strong>
          <p>{{ hiddenFloorStatus }} 线下剧情也会同步使用原子记忆、分段总结和大总结。</p>
        </div>
        <button class="primary-pill" type="button" :disabled="summarizing" @click="showManualSummary = !showManualSummary">
          {{ summarizing ? '总结中' : '手动总结' }}
        </button>
      </section>

      <form v-if="showManualSummary" class="offline-memory-card manual-card" @submit.prevent="manualSummarize">
        <header class="card-heading">
          <div>
            <span>Manual range</span>
            <strong>手动总结范围</strong>
          </div>
        </header>
        <div class="range-grid">
          <label class="offline-field">
            <span>总结开始楼层</span>
            <input v-model.number="manualSummary.startFloor" min="1" type="number" />
          </label>
          <label class="offline-field">
            <span>总结结束楼层</span>
            <input v-model.number="manualSummary.endFloor" :max="messageCount" min="1" type="number" />
          </label>
          <label class="offline-field">
            <span>隐藏开始楼层</span>
            <input v-model.number="manualSummary.hiddenStartFloor" min="0" type="number" />
          </label>
          <label class="offline-field">
            <span>隐藏结束楼层</span>
            <input v-model.number="manualSummary.hiddenEndFloor" :max="messageCount" min="0" type="number" />
          </label>
        </div>
        <p class="range-note">适合在一段线下剧情结束后立刻固化细节。隐藏范围填 0 表示不隐藏，隐藏范围必须在总结范围内。</p>
        <div class="action-grid">
          <button class="primary-pill" type="submit" :disabled="summarizing || !canManualSummarize">生成总结</button>
          <button class="soft-pill" type="button" @click="fillLatestRange">填入未总结楼层</button>
        </div>
      </form>

      <section class="offline-memory-card strategy-card">
        <header class="card-heading">
          <div>
            <span>Automation</span>
            <strong>记忆策略</strong>
            <small>默认 50 楼总结、每次回复写入、8 条摘要触发合并；剧情很密时可把总结楼层调低。</small>
          </div>
        </header>
        <div class="strategy-stack">
          <div class="strategy-group">
            <div class="strategy-copy">
              <span>基础归档</span>
              <strong>把长剧情按段收进记忆</strong>
              <small>适合默认开启。它会把旧楼层整理成分段总结，并减少旧内容占用。</small>
            </div>
            <div class="strategy-grid">
              <label class="toggle-tile">
                <input v-model="draft.memory.autoSummarize" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>自动总结</strong><small>按楼层归档长剧情。</small></span>
              </label>
              <label class="offline-field compact">
                <span>每多少楼总结</span>
                <input v-model.number="draft.memory.summarizeEvery" min="10" step="10" type="number" @change="saveDraft" />
                <small>默认 50，剧情密集可 30-40。</small>
              </label>
              <label class="toggle-tile strategy-wide-control">
                <input v-model="draft.memory.hideSummarizedMessages" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>自动隐藏楼层</strong><small>减少旧楼层占上下文。</small></span>
              </label>
            </div>
          </div>

          <div class="strategy-group">
            <div class="strategy-copy">
              <span>原子召回</span>
              <strong>记住承诺、冲突和关系变化</strong>
              <small>线下 RP 也会写入小颗粒记忆，再挑出与下一轮最相关的内容。</small>
            </div>
            <div class="strategy-grid">
              <label class="toggle-tile">
                <input v-model="draft.memory.vectorMemoryEnabled" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>向量化记忆</strong><small>提高相关记忆召回率。</small></span>
              </label>
              <label class="toggle-tile">
                <input v-model="draft.memory.atomWriterEnabled" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>每轮原子写入</strong><small>提炼承诺、冲突和关系变化。</small></span>
              </label>
              <label class="offline-field compact strategy-wide-control">
                <span>每几次回复写入</span>
                <input v-model.number="draft.memory.atomWriterEvery" min="1" max="10" type="number" @change="saveDraft" />
                <small>1 最稳，2 更省调用。</small>
              </label>
            </div>
          </div>

          <div class="strategy-group">
            <div class="strategy-copy">
              <span>分层整理</span>
              <strong>摘要变多后自动压缩</strong>
              <small>长期线下剧情会被压成大总结，减少上下文越来越满的问题。</small>
            </div>
            <div class="strategy-grid">
              <label class="toggle-tile strategy-wide-control">
                <input v-model="draft.memory.autoMergeEnabled" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>自动合并大总结</strong><small>摘要变多后分层压缩。</small></span>
              </label>
              <label class="offline-field compact">
                <span>达到几条触发</span>
                <input v-model.number="draft.memory.autoMergeThreshold" min="3" max="30" type="number" @change="saveDraft" />
                <small>默认 8。</small>
              </label>
              <label class="offline-field compact">
                <span>每批合并条数</span>
                <input v-model.number="draft.memory.autoMergeBatchSize" min="2" max="20" type="number" @change="saveDraft" />
                <small>默认 6，保留回滚层级。</small>
              </label>
              <button class="soft-pill memory-text-action strategy-wide-control" type="button" :disabled="summarizing || mergeDisabled" @click="runAutoMergeNow">立即整理记忆</button>
            </div>
          </div>

          <div class="strategy-group strategy-model-group">
            <div class="strategy-copy">
              <span>模型</span>
              <strong>自动总结模型</strong>
              <small>可以跟随全局，也可以单独指定一个更适合整理记忆的模型。</small>
            </div>
            <label class="offline-field model-field">
              <span>自动总结模型</span>
              <select :value="summaryModelValue" @change="updateSummaryModel">
                <option value="">跟随全局总结模型</option>
                <optgroup v-for="vendor in groupedModels" :key="vendor.id" :label="vendor.name">
                  <option v-for="model in vendor.models" :key="model.value" :value="model.value">{{ model.label }}</option>
                </optgroup>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section class="offline-memory-card recall-card">
        <header class="records-heading">
          <div>
            <span>Recall trace</span>
            <strong>本轮召回</strong>
            <small>下一次回复前，系统会从原子记忆里挑最相关的内容交给 AI；预算 tokens 是记忆上下文上限。</small>
          </div>
          <em>{{ memoryAtoms.length }} 原子</em>
        </header>
        <div class="memory-dashboard">
          <span><strong>{{ openMemoryAtomCount }}</strong><small>开放事项</small></span>
          <span><strong>{{ memoryDebugTrace?.selectedAtoms.length ?? 0 }}</strong><small>命中条目</small></span>
          <span><strong>{{ memoryDebugTrace ? `${memoryDebugTrace.selectedTokenCount}/${memoryDebugTrace.tokenBudget}` : '0/0' }}</strong><small>预算 tokens</small></span>
        </div>
        <div v-if="memoryDebugTrace?.selectedAtoms.length" class="atom-list">
          <article v-for="atom in memoryDebugPreview" :key="atom.id" class="atom-row compact-atom-row">
            <span>{{ memoryAtomTypeLabel(atom.type) }} · {{ memoryAtomStatusLabel(atom.status) }} · {{ atom.tokenCount }} tokens · {{ atom.score }}</span>
            <strong>{{ atom.subject }}</strong>
            <p>{{ atom.content }}</p>
          </article>
        </div>
        <div v-else class="memory-empty-card compact-empty">还没有召回记录。生成一次回复后，这里会显示命中的记忆。</div>
        <section v-if="memoryAtoms.length" class="atom-manager">
          <header class="picker-head">
            <div>
              <strong>原子记忆管理</strong>
              <span>修正错误记忆后会自动固定，防止被后续总结覆盖。</span>
            </div>
          </header>
          <article v-for="atom in memoryAtomPreview" :key="atom.id" class="atom-row">
            <div class="atom-row-head">
              <span>{{ memoryAtomTypeLabel(atom.type) }} · {{ atom.subject }}</span>
              <button class="tiny-pill" type="button" @click="toggleAtomPinned(atom.id)">{{ atom.pinned ? '已固定' : '固定' }}</button>
            </div>
            <textarea :value="atom.content" rows="2" @change="updateAtomContent(atom, $event)"></textarea>
            <div class="atom-controls">
              <label><span>状态</span><select :value="atom.status" @change="updateAtomStatus(atom, $event)"><option v-for="status in memoryAtomStatusOptions" :key="status.value" :value="status.value">{{ status.label }}</option></select></label>
              <label><span>重要度</span><input :value="atom.importance" min="1" max="5" type="number" @change="updateAtomImportance(atom, $event)" /></label>
              <button class="danger-pill" type="button" @click="requestDeleteAtom(atom.id)">删除</button>
            </div>
          </article>
        </section>
      </section>

      <section class="offline-memory-card records-card">
        <header class="records-heading">
          <div>
            <span>Memory space</span>
            <strong>记忆空间</strong>
            <small>分段总结保留细节，大总结负责长期压缩；取消合并可以回到上一层。</small>
          </div>
          <em>{{ memories.length }} 条</em>
        </header>

        <div v-if="memories.length" class="memory-dashboard">
          <span><strong>{{ mergeableMemories.length }}</strong><small>可合并</small></span>
          <span><strong>{{ mergedMemories.length }}</strong><small>大总结</small></span>
          <span><strong>{{ mergeDepthPeak }}</strong><small>最高层级</small></span>
        </div>

        <div class="memory-tools">
          <button class="soft-pill" type="button" :disabled="summarizing || mergeDisabled" @click="toggleMergePicker">{{ showMergePicker ? '收起合并' : '合并大总结' }}</button>
          <button class="soft-pill" type="button" :disabled="summarizing || !hasMergedSummary" @click="toggleUnmergePicker">{{ showUnmergePicker ? '收起取消' : '取消合并大总结' }}</button>
        </div>

        <section v-if="showMergePicker" class="picker-card">
          <header class="picker-head">
            <div>
              <strong>合并队列</strong>
              <span>{{ mergeSelectionHint }}</span>
            </div>
            <button class="tiny-pill" type="button" :disabled="!mergeableMemories.length" @click="toggleAllMergeMemories">
              {{ allMergeIdsSelected ? '清空' : '全选' }}
            </button>
          </header>
          <label v-for="memory in mergeableMemories" :key="memory.id" class="picker-row" :class="{ selected: selectedMergeIds.includes(memory.id) }">
            <input v-model="selectedMergeIds" :value="memory.id" type="checkbox" />
            <span>
              <strong>{{ memoryRangeLabel(memory) }}</strong>
              <small>{{ memory.isMergedSummary ? `第 ${memoryMergeDepth(memory)} 层大总结` : '片段记忆' }}</small>
            </span>
          </label>
          <button class="primary-pill" type="button" :disabled="summarizing || selectedMergeIds.length <= 1" @click="requestMergeMemories">确认合并</button>
        </section>

        <section v-if="showUnmergePicker" class="picker-card">
          <header class="picker-head">
            <div>
              <strong>可撤回的大总结</strong>
              <span>每次撤回一层，保留继续回退的空间。</span>
            </div>
          </header>
          <button v-for="memory in mergedMemories" :key="memory.id" class="picker-row picker-button" type="button" @click="requestUnmergeMemories(memory)">
            <span>
              <strong>{{ memoryRangeLabel(memory) }}</strong>
              <small>恢复 {{ directMergeChildCount(memory) }} 条上一层记忆</small>
            </span>
          </button>
        </section>

        <article v-for="memory in memories" :key="memory.id" class="memory-page-card">
          <header>
            <div>
              <span>{{ memory.isMergedSummary ? 'Long memory page' : 'Memory page' }}</span>
              <strong>{{ memoryRangeLabel(memory) }}</strong>
            </div>
            <em>{{ memory.isMergedSummary ? '合并大总结' : '片段记忆' }}</em>
          </header>
          <textarea :value="memory.summary" @change="updateMemorySummary(memory, $event)"></textarea>
          <div class="action-grid">
            <button class="soft-pill" type="button" :disabled="summarizing" @click="requestResummarizeMemory(memory.id)">重新总结</button>
            <button class="danger-pill" type="button" @click="requestDeleteMemory(memory.id)">删除总结</button>
          </div>
        </article>

        <div v-if="!memories.length" class="memory-empty-card">
          <BookOpenText :size="28" />
          <strong>记忆空间暂时空着</strong>
          <span>达到楼层或点击手动总结后，新的书页会收进这里。</span>
        </div>
      </section>
    </main>

    <div v-if="confirmDialog.open" class="memory-confirm-backdrop" role="dialog" aria-modal="true" @click.self="closeConfirmDialog">
      <section class="memory-confirm-sheet">
        <span>{{ confirmDialog.eyebrow }}</span>
        <h2>{{ confirmDialog.title }}</h2>
        <p>{{ confirmDialog.message }}</p>
        <ul v-if="confirmDialog.details.length">
          <li v-for="detail in confirmDialog.details" :key="detail">{{ detail }}</li>
        </ul>
        <div class="action-grid">
          <button class="soft-pill" type="button" :disabled="confirmDialog.running" @click="closeConfirmDialog">取消</button>
          <button class="primary-pill" :class="{ danger: confirmDialog.tone === 'danger' }" type="button" :disabled="confirmDialog.running" @click="confirmPendingAction">
            {{ confirmDialog.running ? confirmDialog.runningText : confirmDialog.confirmText }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft, BookOpenText } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfile, ConversationMemoryAtom, ConversationMemoryEntryStatus, ConversationMemoryRecord, ConversationSettings } from '@/types/domain';
import { getCharacterDisplayName } from '@/utils/character';
import { estimateTokenCount, getConversationFloorCount, getEffectiveHiddenFloorRanges, getMemoryHiddenEndFloor, normalizeConversationSettings } from '@/utils/memory';
import { normalizeChatModelOverrides } from '@/utils/settings';

type ConfirmTone = 'primary' | 'danger';
type ConfirmAction = () => Promise<void> | void;
const memoryAtomStatusOptions: Array<{ value: ConversationMemoryEntryStatus; label: string }> = [
  { value: 'active', label: '有效' },
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已解决' },
  { value: 'superseded', label: '已取代' },
  { value: 'cancelled', label: '已取消' }
];

interface ConfirmDialogState {
  open: boolean;
  eyebrow: string;
  title: string;
  message: string;
  details: string[];
  confirmText: string;
  runningText: string;
  tone: ConfirmTone;
  running: boolean;
  action: ConfirmAction | null;
}

const props = defineProps<{
  conversationId: string;
  character: CharacterProfile;
}>();

defineEmits<{
  back: [];
}>();

const store = useAppStore();
const summarizing = ref(false);
const showManualSummary = ref(false);
const showMergePicker = ref(false);
const showUnmergePicker = ref(false);
const selectedMergeIds = ref<string[]>([]);
const draft = reactive<ConversationSettings>(normalizeConversationSettings(null, props.conversationId));
const confirmDialog = reactive<ConfirmDialogState>({
  open: false,
  eyebrow: '',
  title: '',
  message: '',
  details: [],
  confirmText: '确认',
  runningText: '处理中',
  tone: 'primary',
  running: false,
  action: null
});
const manualSummary = reactive({
  startFloor: 1,
  endFloor: 1,
  hiddenStartFloor: 0,
  hiddenEndFloor: 0
});

const displayName = computed(() => getCharacterDisplayName(props.character));
const memories = computed(() => store.memoriesForConversation(props.conversationId));
const memoryAtoms = computed(() => store.memoryAtomsForConversation(props.conversationId));
const memoryDebugTrace = computed(() => store.memoryDebugTraceForConversation(props.conversationId));
const currentConversationSettings = computed(() => store.settingsForConversation(props.conversationId));
const localModelOverrides = computed(() => store.modelOverridesForConversation(props.conversationId));
const summaryModelValue = computed(() => localModelOverrides.value.summary.trim() || store.settings?.modelOverrides.summary?.trim() || '');
const totalMemoryTokens = computed(() => store.nextReplyTokenCountForConversation(props.conversationId));
const openMemoryAtomCount = computed(() => memoryAtoms.value.filter((atom) => atom.status === 'open' && !atom.archivedAt).length);
const memoryDebugPreview = computed(() => memoryDebugTrace.value?.selectedAtoms.slice(0, 8) ?? []);
const memoryAtomPreview = computed(() => [...memoryAtoms.value]
  .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.importance - left.importance || right.updatedAt - left.updatedAt)
  .slice(0, 12));
const messageCount = computed(() => getConversationFloorCount(store.messagesForConversation(props.conversationId)));
const hiddenFloorStatus = computed(() => {
  const hiddenRanges = getEffectiveHiddenFloorRanges(memories.value).map((range) => `${range.start}-${range.end}楼`);
  if (!hiddenRanges.length) return `当前对话共 ${messageCount.value} 楼，暂无隐藏楼层。`;
  return `当前对话共 ${messageCount.value} 楼，已隐藏 ${hiddenRanges.join('、')}。`;
});
const hasMergedSummary = computed(() => memories.value.some((memory) => memory.isMergedSummary));
const mergeableMemories = computed(() => [...memories.value].sort(compareMemoryRecordsByRange));
const mergedMemories = computed(() => memories.value.filter((memory) => memory.isMergedSummary).sort(compareMemoryRecordsByRange));
const mergeDisabled = computed(() => mergeableMemories.value.length <= 1);
const selectedMergeMemories = computed(() => {
  const selectedIds = new Set(selectedMergeIds.value);
  return mergeableMemories.value.filter((memory) => selectedIds.has(memory.id));
});
const selectedMergeStats = computed(() => {
  const selectedMemories = selectedMergeMemories.value;
  return {
    count: selectedMemories.length,
    mergedCount: selectedMemories.filter((memory) => memory.isMergedSummary).length,
    sourceCount: selectedMemories.reduce((total, memory) => total + leafMemoryCount(memory), 0),
    tokenCount: selectedMemories.reduce((total, memory) => total + memory.tokenCount, 0),
    startFloor: selectedMemories.reduce((min, memory) => Math.min(min, memory.startFloor), Number.POSITIVE_INFINITY),
    endFloor: selectedMemories.reduce((max, memory) => Math.max(max, memory.endFloor), 0)
  };
});
const mergeSelectionHint = computed(() => {
  const stats = selectedMergeStats.value;
  if (stats.count <= 1) return '至少选择 2 条记忆，可包含已有大总结。';
  const rangeText = `${stats.startFloor}-${stats.endFloor}楼`;
  const mergedText = stats.mergedCount ? `，其中 ${stats.mergedCount} 条是大总结` : '';
  return `将 ${stats.count} 条记忆${mergedText}合并为 ${rangeText} 的新大总结。`;
});
const allMergeIdsSelected = computed(() => mergeableMemories.value.length > 0 && mergeableMemories.value.every((memory) => selectedMergeIds.value.includes(memory.id)));
const mergeDepthPeak = computed(() => memories.value.reduce((max, memory) => Math.max(max, memoryMergeDepth(memory)), 0));
const canManualSummarize = computed(() => {
  const start = Number(manualSummary.startFloor);
  const end = Number(manualSummary.endFloor);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start || end > messageCount.value) return false;
  const hiddenStart = Number(manualSummary.hiddenStartFloor);
  const hiddenEnd = Number(manualSummary.hiddenEndFloor);
  if (!hiddenStart && !hiddenEnd) return true;
  return hiddenStart >= start && hiddenEnd >= hiddenStart && hiddenEnd <= end;
});
const groupedModels = computed(() => {
  return (store.settings?.apiVendors ?? [])
    .map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      models: vendor.models
        .filter((model) => model.selected)
        .map((model) => ({
          value: `${vendor.id}::${model.id}`,
          label: model.nickname || model.id
        }))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'))
    }))
    .filter((vendor) => vendor.models.length)
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
});

watch(
  () => [props.conversationId, currentConversationSettings.value] as const,
  () => {
    Object.assign(draft, normalizeConversationSettings(currentConversationSettings.value, props.conversationId));
    showMergePicker.value = false;
    showUnmergePicker.value = false;
    selectedMergeIds.value = [];
    fillLatestRange();
  },
  { immediate: true }
);

watch(mergeableMemories, (nextMemories) => {
  const availableIds = new Set(nextMemories.map((memory) => memory.id));
  selectedMergeIds.value = selectedMergeIds.value.filter((memoryId) => availableIds.has(memoryId));
});

function saveDraft() {
  void store.saveConversationSettings({ ...draft, conversationId: props.conversationId });
}

function updateSummaryModel(event: Event) {
  const nextOverrides = normalizeChatModelOverrides({
    ...localModelOverrides.value,
    summary: (event.target as HTMLSelectElement).value
  });
  void store.saveCharacterModelOverridesForConversation(props.conversationId, nextOverrides);
}

async function manualSummarize() {
  if (!canManualSummarize.value) return;
  summarizing.value = true;
  try {
    const result = await store.summarizeConversationWindow(props.conversationId, {
      forceStartFloor: Math.max(1, Math.floor(Number(manualSummary.startFloor))),
      forceEndFloor: Math.max(1, Math.floor(Number(manualSummary.endFloor))),
      hiddenStartFloor: Math.max(0, Math.floor(Number(manualSummary.hiddenStartFloor) || 0)),
      hiddenEndFloor: Math.max(0, Math.floor(Number(manualSummary.hiddenEndFloor) || 0))
    });
    if (result?.status === 'existing') {
      store.showConfigAlert(`该楼层范围 ${result.record.startFloor}-${result.record.endFloor} 楼已存在总结，可直接编辑或先删除后重建。`, '总结已存在');
    } else if (result?.status === 'busy') {
      store.showConfigAlert(`该楼层范围 ${result.record.startFloor}-${result.record.endFloor} 楼正在总结中，请稍后刷新记忆空间。`, '总结进行中');
    }
    fillLatestRange();
  } finally {
    summarizing.value = false;
  }
}

function fillLatestRange() {
  const lastEndFloor = memories.value.reduce((max, memory) => Math.max(max, memory.endFloor), 0);
  const startFloor = Math.min(Math.max(1, lastEndFloor + 1), Math.max(1, messageCount.value));
  const endFloor = Math.max(startFloor, messageCount.value);
  manualSummary.startFloor = startFloor;
  manualSummary.endFloor = endFloor;
  const hiddenEndFloor = getMemoryHiddenEndFloor(startFloor, endFloor);
  manualSummary.hiddenStartFloor = hiddenEndFloor >= startFloor ? startFloor : 0;
  manualSummary.hiddenEndFloor = hiddenEndFloor >= startFloor ? hiddenEndFloor : 0;
}

function compareMemoryRecordsByRange(leftMemory: ConversationMemoryRecord, rightMemory: ConversationMemoryRecord) {
  if (leftMemory.startFloor !== rightMemory.startFloor) return leftMemory.startFloor - rightMemory.startFloor;
  if (leftMemory.endFloor !== rightMemory.endFloor) return leftMemory.endFloor - rightMemory.endFloor;
  if (leftMemory.createdAt !== rightMemory.createdAt) return leftMemory.createdAt - rightMemory.createdAt;
  return leftMemory.id.localeCompare(rightMemory.id);
}

function memoryRangeLabel(memory: ConversationMemoryRecord) {
  return `${memory.startFloor}-${memory.endFloor}楼`;
}

function directMergeChildCount(memory: ConversationMemoryRecord) {
  return memory.mergedFrom?.length ?? 0;
}

function leafMemoryCount(memory: ConversationMemoryRecord): number {
  if (!memory.mergedFrom?.length) return 1;
  return memory.mergedFrom.reduce((total, childMemory) => total + leafMemoryCount(childMemory), 0);
}

function memoryMergeDepth(memory: ConversationMemoryRecord): number {
  if (!memory.isMergedSummary) return 0;
  const childDepth = memory.mergedFrom?.reduce((max, childMemory) => Math.max(max, memoryMergeDepth(childMemory)), 0) ?? 0;
  return childDepth + 1;
}

function toggleMergePicker() {
  const nextOpen = !showMergePicker.value;
  showMergePicker.value = nextOpen;
  if (!nextOpen) return;
  showUnmergePicker.value = false;
  const availableIds = mergeableMemories.value.map((memory) => memory.id);
  selectedMergeIds.value = selectedMergeIds.value.filter((memoryId) => availableIds.includes(memoryId));
  if (selectedMergeIds.value.length <= 1) selectedMergeIds.value = availableIds;
}

function toggleUnmergePicker() {
  showUnmergePicker.value = !showUnmergePicker.value;
  if (showUnmergePicker.value) showMergePicker.value = false;
}

function toggleAllMergeMemories() {
  selectedMergeIds.value = allMergeIdsSelected.value ? [] : mergeableMemories.value.map((memory) => memory.id);
}

function resetConfirmDialog() {
  Object.assign(confirmDialog, {
    open: false,
    eyebrow: '',
    title: '',
    message: '',
    details: [],
    confirmText: '确认',
    runningText: '处理中',
    tone: 'primary',
    running: false,
    action: null
  } satisfies ConfirmDialogState);
}

function openConfirmDialog(options: {
  eyebrow: string;
  title: string;
  message: string;
  details?: string[];
  confirmText: string;
  runningText: string;
  tone?: ConfirmTone;
  action: ConfirmAction;
}) {
  Object.assign(confirmDialog, {
    open: true,
    eyebrow: options.eyebrow,
    title: options.title,
    message: options.message,
    details: options.details ?? [],
    confirmText: options.confirmText,
    runningText: options.runningText,
    tone: options.tone ?? 'primary',
    running: false,
    action: options.action
  } satisfies ConfirmDialogState);
}

function closeConfirmDialog() {
  if (confirmDialog.running) return;
  resetConfirmDialog();
}

async function confirmPendingAction() {
  const pendingAction = confirmDialog.action;
  if (!pendingAction || confirmDialog.running) return;
  confirmDialog.running = true;
  try {
    await pendingAction();
    resetConfirmDialog();
  } catch (error) {
    resetConfirmDialog();
    store.showConfigAlert(error instanceof Error ? error.message : '操作失败，请稍后再试。', '操作失败');
  }
}

async function resummarize(memoryId: string) {
  summarizing.value = true;
  try {
    const result = await store.resummarizeMemory(memoryId);
    if (result?.status === 'updated') {
      store.showConfigAlert(`已更新 ${result.record.startFloor}-${result.record.endFloor} 楼的总结。`, '重总结完成');
    } else if (result?.status === 'busy') {
      store.showConfigAlert(`该楼层范围 ${result.record.startFloor}-${result.record.endFloor} 楼正在总结中，请稍后再试。`, '总结进行中');
    }
  } finally {
    summarizing.value = false;
  }
}

function requestResummarizeMemory(memoryId: string) {
  const memory = memories.value.find((entry) => entry.id === memoryId);
  if (!memory) return;
  openConfirmDialog({
    eyebrow: 'Regenerate memory',
    title: '重新总结这条记忆？',
    message: `会重新调用总结模型，覆盖 ${memoryRangeLabel(memory)} 的当前文本。`,
    details: [memory.isMergedSummary ? `当前类型：第 ${memoryMergeDepth(memory)} 层大总结` : '当前类型：片段记忆'],
    confirmText: '重新总结',
    runningText: '总结中',
    action: () => resummarize(memoryId)
  });
}

function requestMergeMemories() {
  const memoryIds = [...selectedMergeIds.value];
  const stats = selectedMergeStats.value;
  if (memoryIds.length <= 1 || stats.count <= 1) return;
  const rangeText = `${stats.startFloor}-${stats.endFloor}楼`;
  openConfirmDialog({
    eyebrow: 'Merge memory',
    title: '合并这些记忆？',
    message: `会调用总结模型，把选中的 ${stats.count} 条记忆压缩成 ${rangeText} 的新大总结。`,
    details: [
      `包含来源：${stats.sourceCount} 个片段${stats.mergedCount ? `，其中 ${stats.mergedCount} 条已经是大总结` : ''}`,
      `原始 token 合计：${stats.tokenCount}`
    ],
    confirmText: '开始合并',
    runningText: '合并中',
    action: () => mergeMemories(memoryIds)
  });
}

async function mergeMemories(memoryIds: string[]) {
  if (memoryIds.length <= 1) return;
  summarizing.value = true;
  try {
    const result = await store.mergeConversationMemories(props.conversationId, memoryIds);
    if (!result) {
      store.showConfigAlert('至少需要选择两条仍存在的记忆，才能生成新的大总结。', '无法合并');
      return;
    }
    selectedMergeIds.value = [];
    showMergePicker.value = false;
    showUnmergePicker.value = false;
  } finally {
    summarizing.value = false;
  }
}

async function runAutoMergeNow() {
  summarizing.value = true;
  try {
    const result = await store.maybeAutoMergeConversationMemories(props.conversationId);
    if (!result) store.showConfigAlert('当前记忆数量或设置还未达到自动合并条件。', '无需整理');
  } finally {
    summarizing.value = false;
  }
}

function requestUnmergeMemories(memory: ConversationMemoryRecord) {
  openConfirmDialog({
    eyebrow: 'Restore layer',
    title: '取消这一层大总结？',
    message: `会撤回 ${memoryRangeLabel(memory)} 的当前大总结，恢复它保存的 ${directMergeChildCount(memory)} 条上一层记忆。`,
    details: ['如果恢复出的条目里还有大总结，可以继续取消合并。'],
    confirmText: '取消合并',
    runningText: '恢复中',
    action: () => unmergeMemories(memory.id)
  });
}

async function unmergeMemories(memoryId: string) {
  summarizing.value = true;
  try {
    await store.unmergeConversationMemories(props.conversationId, memoryId);
    showUnmergePicker.value = false;
  } finally {
    summarizing.value = false;
  }
}

function requestDeleteMemory(memoryId: string) {
  const memory = memories.value.find((entry) => entry.id === memoryId);
  if (!memory) return;
  openConfirmDialog({
    eyebrow: 'Delete memory',
    title: '删除这条总结？',
    message: `会永久删除 ${memoryRangeLabel(memory)} 的${memory.isMergedSummary ? '大总结' : '总结'}。`,
    details: memory.isMergedSummary ? ['删除不会恢复被合并的来源；需要恢复来源时请先取消合并。'] : ['删除后不会保留这条片段记忆。'],
    confirmText: '确认删除',
    runningText: '删除中',
    tone: 'danger',
    action: () => store.deleteMemoryRecord(memoryId)
  });
}

function memoryAtomTypeLabel(type: string) {
  return {
    fact: '事实',
    preference: '偏好',
    promise: '承诺',
    conflict: '冲突',
    plot: '剧情',
    relationship: '关系',
    boundary: '边界',
    emotion: '情绪',
    world: '世界'
  }[type] ?? '记忆';
}

function memoryAtomStatusLabel(status: string) {
  return {
    active: '有效',
    open: '待处理',
    resolved: '已解决',
    superseded: '已取代',
    cancelled: '已取消'
  }[status] ?? '有效';
}

function toggleAtomPinned(atomId: string) {
  void store.toggleMemoryAtomPinned(atomId);
}

function updateAtomStatus(atom: ConversationMemoryAtom, event: Event) {
  const status = (event.target as HTMLSelectElement).value as ConversationMemoryEntryStatus;
  void store.updateMemoryAtom(atom.id, { status, pinned: true });
}

function updateAtomImportance(atom: ConversationMemoryAtom, event: Event) {
  const importance = Math.min(5, Math.max(1, Math.round(Number((event.target as HTMLInputElement).value) || atom.importance)));
  void store.updateMemoryAtom(atom.id, { importance, pinned: true });
}

function updateAtomContent(atom: ConversationMemoryAtom, event: Event) {
  const content = (event.target as HTMLTextAreaElement).value.trim();
  if (!content || content === atom.content) return;
  void store.updateMemoryAtom(atom.id, { content, pinned: true });
}

function requestDeleteAtom(atomId: string) {
  const atom = memoryAtoms.value.find((entry) => entry.id === atomId);
  if (!atom) return;
  openConfirmDialog({
    eyebrow: 'Delete atom',
    title: '删除这条原子记忆？',
    message: `${memoryAtomTypeLabel(atom.type)} · ${atom.subject}`,
    details: [atom.content, '删除后不会参与后续召回。'],
    confirmText: '确认删除',
    runningText: '删除中',
    tone: 'danger',
    action: async () => {
      await store.deleteMemoryAtom(atomId);
    }
  });
}

function updateMemorySummary(memory: ConversationMemoryRecord, event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  void store.updateMemoryRecord({
    ...memory,
    summary: textarea.value,
    tokenCount: estimateTokenCount(textarea.value)
  });
}
</script>

<style scoped>
.offline-memory-page {
  --memory-ink: #252226;
  --memory-muted: #93868e;
  --memory-accent: #b28b99;
  box-sizing: border-box;
  position: absolute;
  inset: 0;
  z-index: 35;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--memory-ink);
  background:
    linear-gradient(135deg, rgba(255, 229, 237, 0.78) 0%, rgba(247, 242, 255, 0.62) 42%, rgba(237, 250, 244, 0.72) 100%),
    #fbf8fa;
}

.offline-memory-page *,
.offline-memory-page *::before,
.offline-memory-page *::after {
  box-sizing: border-box;
}

.offline-memory-topbar {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 38px;
  align-items: center;
  gap: 8px;
  padding: calc(10px + var(--safe-top)) calc(14px + var(--safe-right)) 10px calc(14px + var(--safe-left));
  border-bottom: 1px solid rgba(255, 255, 255, 0.58);
  background: rgba(255, 255, 255, 0.62);
  -webkit-backdrop-filter: blur(22px);
  backdrop-filter: blur(22px);
}

.offline-memory-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: #2d282d;
  box-shadow: 0 10px 24px rgba(77, 58, 71, 0.08);
}

.offline-memory-text-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  height: 38px;
  padding: 0 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  color: #2d282d;
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 10px 24px rgba(77, 58, 71, 0.08);
}

.offline-memory-title {
  display: grid;
  justify-items: center;
  gap: 2px;
  min-width: 0;
}

.offline-memory-title span,
.card-heading span,
.records-heading span,
.memory-page-card header span,
.memory-hero-card span {
  color: var(--memory-accent);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.offline-memory-title strong,
.card-heading strong,
.records-heading strong,
.memory-page-card header strong {
  max-width: 100%;
  overflow: hidden;
  color: #211d21;
  font-size: 16px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-memory-title strong {
  width: 100%;
  text-align: center;
}

.offline-memory-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 14px calc(14px + var(--safe-right)) calc(18px + var(--safe-bottom)) calc(14px + var(--safe-left));
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.memory-hero-card,
.offline-memory-card,
.memory-page-card,
.picker-card,
.memory-empty-card,
.memory-confirm-sheet {
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 14px 34px rgba(96, 74, 88, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.memory-hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  min-height: 132px;
  padding: 18px;
  background:
    radial-gradient(circle at 94% 8%, rgba(178, 139, 153, 0.22), transparent 34%),
    rgba(255, 255, 255, 0.68);
}

.memory-hero-card div,
.card-heading > div,
.records-heading div,
.memory-page-card header div,
.picker-head div {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.memory-hero-card strong {
  color: #161316;
  font-size: 32px;
  font-weight: 950;
  letter-spacing: 0;
  line-height: 1;
}

.memory-hero-card p,
.range-note,
.memory-empty-card span,
.picker-head span,
.picker-row small,
.card-heading small,
.records-heading small,
.offline-field small,
.toggle-copy small,
.memory-confirm-sheet p,
.memory-confirm-sheet li {
  margin: 0;
  color: var(--memory-muted);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.card-heading small,
.records-heading small {
  display: block;
  margin-top: 2px;
}

.offline-memory-card,
.memory-page-card {
  display: grid;
  gap: 14px;
  padding: 14px;
}

.card-heading,
.records-heading,
.memory-page-card header,
.picker-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
}

.records-heading em,
.memory-page-card em {
  align-self: center;
  min-width: 0;
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #8d8188;
  font-style: normal;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.range-grid,
.strategy-grid,
.action-grid,
.memory-tools,
.memory-dashboard {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.strategy-card .strategy-grid {
  grid-template-columns: 1fr;
}

.strategy-stack {
  display: grid;
  gap: 12px;
}

.strategy-group {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: inset 0 0 0 1px rgba(77, 58, 71, 0.04);
}

.strategy-copy {
  display: grid;
  gap: 4px;
}

.strategy-copy span {
  color: var(--memory-accent);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.strategy-copy strong {
  color: #211d21;
  font-size: 15px;
  font-weight: 950;
}

.strategy-copy small {
  color: var(--memory-muted);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.55;
}

.strategy-wide-control,
.strategy-model-group .model-field {
  grid-column: 1 / -1;
}

.strategy-model-group {
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  align-items: center;
}

.memory-dashboard {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.memory-dashboard span {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.memory-dashboard strong {
  color: #211d21;
  font-size: 18px;
  font-weight: 950;
  line-height: 1;
}

.memory-dashboard small {
  overflow: hidden;
  color: var(--memory-muted);
  font-size: 11px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-field {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: inset 0 0 0 1px rgba(77, 58, 71, 0.04);
}

.offline-field span {
  overflow: hidden;
  color: #746a72;
  font-size: 11px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-field input,
.offline-field select,
.memory-page-card textarea {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(77, 58, 71, 0.06);
  border-radius: 16px;
  outline: 0;
  background: rgba(255, 255, 255, 0.76);
  color: #211d21;
  font-size: 13px;
  font-weight: 800;
}

.offline-field input,
.offline-field select {
  padding: 9px 12px;
}

.model-field {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.toggle-tile {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 74px;
  padding: 13px;
  overflow: hidden;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: inset 0 0 0 1px rgba(77, 58, 71, 0.04);
}

.toggle-tile input {
  position: absolute;
  opacity: 0;
}

.toggle-track {
  position: relative;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: rgba(201, 193, 199, 0.62);
  box-shadow: inset 0 0 0 1px rgba(77, 58, 71, 0.05);
}

.toggle-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 5px 12px rgba(77, 58, 71, 0.16);
  transition: transform 0.18s ease;
}

.toggle-tile input:checked + .toggle-track {
  background: linear-gradient(135deg, #63dc91, #33c76b);
}

.toggle-tile input:checked + .toggle-track::after {
  transform: translateX(18px);
}

.toggle-tile strong {
  overflow: hidden;
  color: #211d21;
  font-size: 14px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.toggle-copy small,
.offline-field small {
  font-size: 11px;
  font-weight: 750;
}

.primary-pill,
.soft-pill,
.danger-pill,
.tiny-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 42px;
  padding: 0 12px;
  overflow: hidden;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.1;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.primary-pill {
  background: linear-gradient(135deg, #2d282d, #64545e);
  color: #fff8fb;
  box-shadow: 0 12px 24px rgba(77, 58, 71, 0.16);
}

.soft-pill {
  background: rgba(255, 255, 255, 0.66);
  color: #423940;
  box-shadow: inset 0 0 0 1px rgba(77, 58, 71, 0.05);
}

.danger-pill,
.primary-pill.danger {
  background: rgba(239, 68, 90, 0.1);
  color: #d73850;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.08);
}

.primary-pill:disabled,
.soft-pill:disabled,
.danger-pill:disabled,
.tiny-pill:disabled {
  background: rgba(235, 230, 233, 0.8);
  color: #aaa1a7;
  box-shadow: none;
}

.icon-pill {
  gap: 6px;
}

.icon-pill svg {
  flex: 0 0 auto;
}

.memory-text-action {
  min-height: 54px;
  white-space: normal;
}

.atom-list,
.atom-manager {
  display: grid;
  gap: 9px;
}

.atom-row {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: inset 0 0 0 1px rgba(77, 58, 71, 0.04);
}

.compact-atom-row span,
.compact-atom-row p {
  margin: 0;
  color: var(--memory-muted);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.45;
}

.compact-atom-row strong,
.atom-row-head span {
  overflow: hidden;
  color: #211d21;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.atom-row-head,
.atom-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.atom-row textarea {
  width: 100%;
  min-height: 52px;
  padding: 10px;
  border: 1px solid rgba(77, 58, 71, 0.06);
  border-radius: 14px;
  outline: 0;
  background: rgba(255, 255, 255, 0.76);
  color: #211d21;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.45;
  resize: vertical;
}

.atom-controls {
  grid-template-columns: minmax(0, 1fr) 82px auto;
}

.atom-controls label {
  display: grid;
  gap: 4px;
}

.atom-controls label span {
  color: #746a72;
  font-size: 11px;
  font-weight: 850;
}

.atom-controls select,
.atom-controls input {
  width: 100%;
  min-height: 34px;
  border: 1px solid rgba(77, 58, 71, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.76);
  color: #211d21;
  font-size: 12px;
  font-weight: 800;
}

.atom-controls .danger-pill {
  min-height: 34px;
  padding-inline: 12px;
}

.compact-empty {
  min-height: 96px;
  color: var(--memory-muted);
  font-size: 12px;
  font-weight: 800;
}

.picker-card {
  display: grid;
  gap: 9px;
  padding: 10px;
}

.tiny-pill {
  min-height: 30px;
  padding-inline: 10px;
  border-radius: 999px;
  background: rgba(178, 139, 153, 0.12);
  color: #8d5f70;
}

.picker-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
  text-align: left;
}

.picker-row.selected {
  background: rgba(255, 235, 244, 0.78);
  box-shadow: inset 0 0 0 1px rgba(178, 139, 153, 0.18);
}

.picker-row span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.picker-row strong {
  overflow: hidden;
  color: #211d21;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-button {
  width: 100%;
}

.memory-page-card textarea {
  min-height: 128px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}

.memory-empty-card {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 152px;
  padding: 18px;
  text-align: center;
}

.memory-empty-card svg {
  color: #aa9da6;
}

.memory-empty-card strong {
  color: #211d21;
  font-size: 15px;
  font-weight: 900;
}

.memory-confirm-backdrop {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: end center;
  padding: calc(14px + var(--safe-top)) calc(12px + var(--safe-right)) calc(12px + var(--safe-bottom)) calc(12px + var(--safe-left));
  background: rgba(41, 34, 40, 0.24);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.memory-confirm-sheet {
  display: grid;
  gap: 12px;
  width: 100%;
  padding: 16px;
}

.memory-confirm-sheet > span {
  color: var(--memory-accent);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
}

.memory-confirm-sheet h2,
.memory-confirm-sheet p {
  margin: 0;
}

.memory-confirm-sheet h2 {
  color: #211d21;
  font-size: 18px;
  font-weight: 950;
}

.memory-confirm-sheet ul {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 10px 12px 10px 26px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
}

.offline-memory-page .toggle-tile strong,
.offline-memory-page .toggle-copy small,
.offline-memory-page .offline-field > span,
.offline-memory-page .offline-field small,
.offline-memory-page .atom-row-head span,
.offline-memory-page .primary-pill,
.offline-memory-page .soft-pill,
.offline-memory-page .danger-pill,
.offline-memory-page .tiny-pill {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.offline-memory-page button,
.offline-memory-page .primary-pill,
.offline-memory-page .soft-pill,
.offline-memory-page .danger-pill,
.offline-memory-page .tiny-pill {
  min-height: 40px;
  height: auto;
  padding-block: 9px;
  line-height: 1.25;
}

@media (max-width: 340px) {
  .offline-memory-scroll {
    padding-inline: 10px;
  }

  .memory-hero-card {
    grid-template-columns: 1fr;
  }

  .range-grid,
  .strategy-grid,
  .action-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .strategy-model-group {
    grid-template-columns: 1fr;
  }

  .memory-tools {
    gap: 6px;
  }

  .memory-tools .soft-pill {
    min-height: 38px;
    padding-inline: 6px;
    font-size: 11px;
  }
}
</style>
