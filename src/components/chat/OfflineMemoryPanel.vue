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
      <button class="offline-memory-text-button" type="button" @click="showManualSummary = !showManualSummary">{{ showManualSummary ? '收起' : '大总结' }}</button>
    </header>

    <main class="offline-memory-scroll">
      <section class="memory-hero-card">
        <div>
          <span>Hippocampus Memory</span>
          <strong>{{ totalMemoryTokenLabel }}</strong>
          <p>{{ hiddenFloorStatus }}</p>
        </div>
        <button class="primary-pill" type="button" :disabled="summarizing" @click="showManualSummary = !showManualSummary">
          {{ summarizing ? '生成中' : '新增大总结' }}
        </button>
      </section>

      <form v-if="showManualSummary" class="offline-memory-card manual-card" @submit.prevent="requestManualSummarize">
        <header class="card-heading">
          <div>
            <span>Manual range</span>
            <strong>手动新增大总结</strong>
          </div>
        </header>
        <div class="range-grid">
          <label class="offline-field">
            <span>新增开始楼层</span>
            <input v-model.number="manualSummary.startFloor" min="1" type="number" />
          </label>
          <label class="offline-field">
            <span>新增结束楼层</span>
            <input v-model.number="manualSummary.endFloor" :max="messageCount" min="1" type="number" />
          </label>
        </div>
        <div class="range-grid">
          <label class="offline-field">
            <span>隐藏开始楼层</span>
            <input v-model.number="manualSummary.hiddenStartFloor" min="0" type="number" />
          </label>
          <label class="offline-field">
            <span>保留最新楼层</span>
            <input v-model.number="manualSummary.visibleTailFloors" min="0" type="number" />
          </label>
        </div>
        <p class="range-note">选择本轮要并入新增大总结的楼层；生成时只会读取所选楼层正文和该区间回忆录。</p>
        <div class="action-grid">
          <button class="primary-pill" type="submit" :disabled="summarizing || !canManualSummarize">新增大总结</button>
          <button class="soft-pill" type="button" @click="fillLatestRange">填入未大总结楼层</button>
        </div>
      </form>

      <section class="offline-memory-card strategy-card">
        <header class="card-heading">
          <div>
            <span>Automation</span>
            <strong>记忆策略</strong>
          </div>
        </header>
        <div class="strategy-stack">
          <div class="strategy-group">
            <div class="strategy-copy">
              <span>基础归档</span>
              <strong>按楼层生成回忆录</strong>
            </div>
            <div class="strategy-grid">
              <label class="toggle-tile">
                <input v-model="draft.memory.autoSummarize" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>自动总结</strong><small>按楼层把长聊天归档成回忆录。</small></span>
              </label>
              <label class="offline-field compact">
                <span>每多少楼生成回忆录</span>
                <input :value="memoryNumberDraft.summarizeEvery" inputmode="numeric" min="1" step="1" type="number" @input="updateMemoryNumberDraft('summarizeEvery', $event)" @change="commitMemoryNumberDraft('summarizeEvery', $event)" @blur="commitMemoryNumberDraft('summarizeEvery', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('summarizeEvery', $event)" />
                <small>默认 50，会按此楼数生成一份回忆录。</small>
              </label>
            </div>
          </div>

          <div class="strategy-group">
            <div class="strategy-copy">
              <span>新增大总结</span>
              <strong>按累计楼层生成新增大总结</strong>
            </div>
            <div class="strategy-grid">
              <label class="toggle-tile strategy-wide-control">
                <input v-model="draft.memory.autoGrandSummaryEnabled" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>自动生成新增大总结</strong><small>楼层达到 250、500、750... 时，读取累计楼层正文和本轮回忆录。</small></span>
              </label>
              <label class="offline-field compact">
                <span>每多少楼触发新增大总结</span>
                <input :value="memoryNumberDraft.grandSummaryEvery" inputmode="numeric" min="20" max="300" type="number" @input="updateMemoryNumberDraft('grandSummaryEvery', $event)" @change="commitMemoryNumberDraft('grandSummaryEvery', $event)" @blur="commitMemoryNumberDraft('grandSummaryEvery', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('grandSummaryEvery', $event)" />
                <small>默认 250；第 250/500 楼触发，成功后删除本轮回忆录。</small>
              </label>
              <label class="toggle-tile strategy-wide-control">
                <input v-model="draft.memory.hideSummarizedMessages" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>新增大总结后隐藏楼层</strong><small>按下面的隐藏起点和保留楼层生成默认隐藏范围。</small></span>
              </label>
              <label class="offline-field compact">
                <span>隐藏从第几楼开始</span>
                <input :value="memoryNumberDraft.grandSummaryHiddenStartFloor" inputmode="numeric" min="0" step="1" type="number" @input="updateMemoryNumberDraft('grandSummaryHiddenStartFloor', $event)" @change="commitMemoryNumberDraft('grandSummaryHiddenStartFloor', $event)" @blur="commitMemoryNumberDraft('grandSummaryHiddenStartFloor', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('grandSummaryHiddenStartFloor', $event)" />
                <small>默认 1；设为 0 时新增大总结不预设隐藏范围。</small>
              </label>
              <label class="offline-field compact">
                <span>保留最新多少楼不隐藏</span>
                <input :value="memoryNumberDraft.grandSummaryVisibleTailFloors" inputmode="numeric" min="0" step="1" type="number" @input="updateMemoryNumberDraft('grandSummaryVisibleTailFloors', $event)" @change="commitMemoryNumberDraft('grandSummaryVisibleTailFloors', $event)" @blur="commitMemoryNumberDraft('grandSummaryVisibleTailFloors', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('grandSummaryVisibleTailFloors', $event)" />
                <small>默认 20；设为 0 时可隐藏到大总结结束楼层。</small>
              </label>
            </div>
          </div>

          <div class="strategy-group">
            <div class="strategy-copy">
              <span>全文大总结</span>
              <strong>新增大总结合成全文大总结</strong>
            </div>
            <div class="strategy-grid">
              <label class="toggle-tile strategy-wide-control">
                <input v-model="draft.memory.autoMergeEnabled" type="checkbox" @change="saveDraft" />
                <span class="toggle-track"></span>
                <span class="toggle-copy"><strong>自动生成全文大总结</strong><small>新增大总结数量达标后，继续合成为全文大总结。</small></span>
              </label>
              <label class="offline-field compact">
                <span>每多少条新增大总结触发全文大总结</span>
                <input :value="memoryNumberDraft.autoMergeThreshold" inputmode="numeric" min="3" max="30" type="number" @input="updateMemoryNumberDraft('autoMergeThreshold', $event)" @change="commitMemoryNumberDraft('autoMergeThreshold', $event)" @blur="commitMemoryNumberDraft('autoMergeThreshold', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('autoMergeThreshold', $event)" />
                <small>默认 8，达到后进入全文大总结。</small>
              </label>
              <label class="offline-field compact">
                <span>每批合并几条新增大总结</span>
                <input :value="memoryNumberDraft.autoMergeBatchSize" inputmode="numeric" min="2" max="20" type="number" @input="updateMemoryNumberDraft('autoMergeBatchSize', $event)" @change="commitMemoryNumberDraft('autoMergeBatchSize', $event)" @blur="commitMemoryNumberDraft('autoMergeBatchSize', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('autoMergeBatchSize', $event)" />
                <small>默认 6，每批合并 6 个新增大总结。</small>
              </label>
              <button class="soft-pill memory-text-action strategy-wide-control" type="button" :disabled="summarizing || mergeDisabled" @click="requestRunAutoMergeNow">立即整理记忆层级</button>
            </div>
          </div>

        </div>
      </section>

      <section class="offline-memory-card timeline-card">
        <header class="records-heading">
          <div>
            <span>Chronology</span>
            <strong>记忆时间线</strong>
          </div>
          <em>{{ memoryTimelineItems.length }} 条</em>
        </header>
        <div v-if="memoryTimelineItems.length" class="memory-dashboard timeline-dashboard">
          <span><strong>{{ memoirMemoryCount }}</strong><small>回忆录</small></span>
          <span><strong>{{ grandSummaryCount }}</strong><small>大总结</small></span>
          <span><strong>{{ memoryTimelineSpanLabel }}</strong><small>跨度</small></span>
        </div>
        <div v-if="memoryTimelineItems.length" class="memory-timeline-list" role="list">
          <article v-for="item in visibleMemoryTimelineItems" :key="item.id" class="memory-timeline-row" :class="[`timeline-${item.kind}`, `timeline-${item.tone}`, { 'is-archived': item.archived }]" role="listitem">
            <div class="timeline-copy">
              <button class="timeline-card-heading" type="button" :aria-expanded="isTimelineDetailExpanded(timelineCardId(item))" @click="toggleTimelineDetail(timelineCardId(item))">
                <em>{{ item.eyebrow }}</em>
                <span>
                  <strong>{{ item.title }}</strong>
                  <ChevronDown :size="14" aria-hidden="true" />
                </span>
              </button>
              <section v-if="isTimelineDetailExpanded(timelineCardId(item))" class="timeline-summary-display" aria-label="完整记忆摘要">
                <template v-for="block in item.blocks" :key="block.id">
                  <template v-if="block.kind === 'heading'">
                    <h4 v-if="shouldShowTimelineHeading(block.content)" class="timeline-summary-heading">{{ block.content }}</h4>
                  </template>
                  <div v-else-if="block.kind === 'field'" class="timeline-summary-field">
                    <span>{{ block.label }}</span>
                    <p>{{ block.content }}</p>
                  </div>
                  <article v-else-if="block.kind === 'event'" class="timeline-summary-event">
                    <header>
                      <span>时间</span>
                      <strong>{{ block.time }}</strong>
                    </header>
                    <dl class="timeline-event-core">
                      <template v-for="field in eventPrimaryFields(block)" :key="`${block.id}-${field.label}`">
                        <dt>{{ field.label }}</dt>
                        <dd>{{ field.content || '未填写' }}</dd>
                      </template>
                    </dl>
                    <div v-if="eventFoldedFields(block).length" class="timeline-foldout timeline-event-details" :class="{ 'is-open': isTimelineDetailExpanded(timelineDetailId(item, block, 'event')) }">
                      <button type="button" @click="toggleTimelineDetail(timelineDetailId(item, block, 'event'))">
                        <span>更多细节</span>
                        <em>{{ eventFoldedFields(block).length }} 项</em>
                        <ChevronDown :size="14" aria-hidden="true" />
                      </button>
                      <dl v-if="isTimelineDetailExpanded(timelineDetailId(item, block, 'event'))">
                        <template v-for="field in eventFoldedFields(block)" :key="`${block.id}-${field.label}`">
                          <dt>{{ field.label }}</dt>
                          <dd>{{ field.content || '未填写' }}</dd>
                        </template>
                      </dl>
                    </div>
                  </article>
                  <ul v-else-if="block.kind === 'list'" class="timeline-summary-list">
                    <li v-for="listItem in listPrimaryItems(block)" :key="listItem">{{ listItem }}</li>
                    <li v-if="listFoldedItems(block).length" class="timeline-list-foldout">
                      <div class="timeline-foldout" :class="{ 'is-open': isTimelineDetailExpanded(timelineDetailId(item, block, 'list')) }">
                        <button type="button" @click="toggleTimelineDetail(timelineDetailId(item, block, 'list'))">
                          <span>继续展开</span>
                          <em>{{ listFoldedItems(block).length }} 条</em>
                          <ChevronDown :size="14" aria-hidden="true" />
                        </button>
                        <ul v-if="isTimelineDetailExpanded(timelineDetailId(item, block, 'list'))" class="timeline-summary-list nested-list">
                          <li v-for="listItem in listFoldedItems(block)" :key="listItem">{{ listItem }}</li>
                        </ul>
                      </div>
                    </li>
                  </ul>
                  <div v-else-if="block.kind === 'table'" class="timeline-profile-table-shell">
                    <table>
                      <thead>
                        <tr>
                          <th v-for="header in block.headers" :key="header">{{ header }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
                          <td v-for="(cell, cellIndex) in row" :key="`${rowIndex}-${cellIndex}`">{{ cell }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-else-if="block.kind === 'graph'" class="timeline-graph-card">
                    <svg viewBox="0 0 440 280" role="img" aria-label="角色关系图">
                      <defs>
                        <marker :id="`${block.id}-arrow`" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                          <path d="M0,0 L9,4.5 L0,9 Z" />
                        </marker>
                      </defs>
                      <g class="graph-edges">
                        <g v-for="edge in block.edges" :key="edge.id">
                          <line :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" :marker-end="`url(#${block.id}-arrow)`" />
                          <text :x="(edge.x1 + edge.x2) / 2" :y="(edge.y1 + edge.y2) / 2 - 6">{{ edge.label }}</text>
                        </g>
                      </g>
                      <g v-for="node in block.nodes" :key="node.id" class="graph-node">
                        <title>{{ node.label }}</title>
                        <rect :x="node.x - 54" :y="node.y - 18" width="108" height="36" rx="13" />
                        <text :x="node.x" :y="node.y + 4">{{ node.label }}</text>
                      </g>
                    </svg>
                  </div>
                  <div v-else-if="block.kind === 'code'" class="timeline-foldout timeline-block-foldout" :class="{ 'is-open': isTimelineDetailExpanded(timelineDetailId(item, block, 'code')) }">
                    <button type="button" @click="toggleTimelineDetail(timelineDetailId(item, block, 'code'))">
                      <span>{{ block.language || 'code' }}</span>
                      <em>代码块</em>
                      <ChevronDown :size="14" aria-hidden="true" />
                    </button>
                    <pre v-if="isTimelineDetailExpanded(timelineDetailId(item, block, 'code'))" class="timeline-summary-code"><span>{{ block.language || 'code' }}</span>{{ block.content }}</pre>
                  </div>
                  <p v-else class="timeline-summary-paragraph">{{ block.content }}</p>
                </template>
              </section>
              <div v-if="isTimelineDetailExpanded(timelineCardId(item)) && item.meta.length" class="timeline-meta">
                <em v-for="meta in item.meta" :key="meta">{{ meta }}</em>
              </div>
            </div>
          </article>
        </div>
        <button v-if="canShowMoreTimelineItems" class="list-more-action" type="button" @click="showMoreTimelineItems">显示更多时间线</button>
        <div v-if="!memoryTimelineItems.length" class="timeline-empty-card">还没有可展示的时间线。完成一次回忆录或大总结后，这里会按创建时间排列记忆。</div>
      </section>

      <section class="offline-memory-card records-card">
        <header class="records-heading">
          <div>
            <span>Memory space</span>
            <strong>记忆空间</strong>
          </div>
          <em>{{ memories.length }} 条</em>
        </header>

        <div v-if="memories.length" class="memory-dashboard">
          <span><strong>{{ mergeableMemories.length }}</strong><small>可整理</small></span>
          <span><strong>{{ mergedMemories.length }}</strong><small>大总结</small></span>
          <span><strong>{{ mergeDepthPeak }}</strong><small>全文层级</small></span>
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
              <small>{{ memoryMergeBadge(memory) }} · {{ memory.tokenCount }} tokens</small>
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
              <small>恢复 {{ directMergeChildCount(memory) }} 条上一层记忆 · {{ memoryMergeBadge(memory) }}</small>
            </span>
          </button>
        </section>

        <article v-for="memory in visibleMemories" :key="memory.id" class="memory-page-card">
          <header>
            <div>
              <span>{{ memory.isMergedSummary ? 'Grand summary' : 'Memoir page' }}</span>
              <strong>{{ memoryRangeLabel(memory) }}</strong>
            </div>
            <em>{{ memory.isMergedSummary ? '大总结' : '回忆录' }}</em>
          </header>
          <textarea :value="memory.summary" @change="updateMemorySummary(memory, $event)"></textarea>
          <div v-if="canEditMemoryHiddenRange(memory)" class="memory-hidden-editor">
            <label>
              <span>隐藏开始</span>
              <input :value="memory.hiddenStartFloor || 0" inputmode="numeric" min="0" type="number" @change="updateMemoryHiddenRange(memory, 'start', $event)" />
            </label>
            <label>
              <span>隐藏结束</span>
              <input :value="memory.hiddenEndFloor || 0" inputmode="numeric" min="0" type="number" @change="updateMemoryHiddenRange(memory, 'end', $event)" />
            </label>
            <button class="soft-pill" type="button" @click="requestToggleHidden(memory, !hasHiddenRange(memory))">{{ hasHiddenRange(memory) ? '取消隐藏' : '推荐隐藏' }}</button>
          </div>
          <div class="action-grid">
            <button class="soft-pill" type="button" :disabled="summarizing" @click="requestResummarizeMemory(memory.id)">重新总结</button>
            <button class="danger-pill" type="button" @click="requestDeleteMemory(memory.id)">删除总结</button>
          </div>
        </article>

        <button v-if="canShowMoreMemories" class="list-more-action" type="button" @click="showMoreMemories">显示更多总结</button>

        <div v-if="!memories.length" class="memory-empty-card">
          <BookOpenText :size="28" />
          <strong>记忆空间暂时空着</strong>
          <span>达到 6 楼后会自动归档回忆录，也可以手动新增大总结。</span>
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
        <div class="action-grid" :class="{ 'confirm-only': confirmDialog.confirmOnly }">
          <button v-if="!confirmDialog.confirmOnly" class="soft-pill" type="button" :disabled="confirmDialog.running" @click="closeConfirmDialog">取消</button>
          <button class="primary-pill" :class="{ danger: confirmDialog.tone === 'danger' }" type="button" :disabled="confirmDialog.running" @click="confirmPendingAction">
            {{ confirmDialog.running ? confirmDialog.runningText : confirmDialog.confirmText }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft, BookOpenText, ChevronDown } from 'lucide-vue-next';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfile, ConversationMemoryRecord, ConversationSettings } from '@/types/domain';
import { getCharacterDisplayName } from '@/utils/character';
import { collectIncrementalGrandSummaries, estimateTokenCount, getConversationActiveMessages, getConversationFloorCount, getEffectiveHiddenFloorRanges, getGrandSummaryHiddenRange, isIncrementalGrandSummary, normalizeConversationSettings } from '@/utils/memory';
import { parseMemorySummaryBlocks, type MemorySummaryBlock } from '@/utils/memorySummary';

type ConfirmTone = 'primary' | 'danger';
type ConfirmAction = () => Promise<void> | void;
type MemoryNumberField = 'summarizeEvery' | 'grandSummaryEvery' | 'grandSummaryHiddenStartFloor' | 'grandSummaryVisibleTailFloors' | 'autoMergeThreshold' | 'autoMergeBatchSize';
type MemoryEventField = Extract<MemorySummaryBlock, { kind: 'event' }>['fields'][number];
type MemoryEventBlock = Extract<MemorySummaryBlock, { kind: 'event' }>;
type MemoryListBlock = Extract<MemorySummaryBlock, { kind: 'list' }>;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface MemoryTimelineItem {
  id: string;
  kind: 'summary';
  tone: 'memoir' | 'grand' | 'merged';
  time: number;
  timeEnd?: number;
  timeLabel: string;
  eyebrow: string;
  title: string;
  blocks: MemorySummaryBlock[];
  meta: string[];
  archived?: boolean;
}

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
  confirmOnly: boolean;
  errorTitle: string;
  errorMessage: string;
  errorDetails: string[];
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
const expandedTimelineDetailIds = ref<Set<string>>(new Set());
const timelineDisplayLimit = ref(80);
const memoryDisplayLimit = ref(40);
const totalMemoryTokens = ref<number | null>(null);
const totalMemoryTokenPending = ref(false);
let tokenEstimateTimer: number | undefined;
let tokenEstimateIdleId: number | undefined;
let tokenEstimateRun = 0;
const draft = reactive<ConversationSettings>(normalizeConversationSettings(null, props.conversationId, 'offline'));
const memoryNumberDraft = reactive<Record<MemoryNumberField, string>>({
  summarizeEvery: String(draft.memory.summarizeEvery),
  grandSummaryEvery: String(draft.memory.grandSummaryEvery),
  grandSummaryHiddenStartFloor: String(draft.memory.grandSummaryHiddenStartFloor),
  grandSummaryVisibleTailFloors: String(draft.memory.grandSummaryVisibleTailFloors),
  autoMergeThreshold: String(draft.memory.autoMergeThreshold),
  autoMergeBatchSize: String(draft.memory.autoMergeBatchSize)
});
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
  action: null,
  confirmOnly: false,
  errorTitle: '',
  errorMessage: '',
  errorDetails: []
});
const manualSummary = reactive({
  startFloor: 1,
  endFloor: 1,
  hiddenStartFloor: draft.memory.grandSummaryHiddenStartFloor,
  visibleTailFloors: draft.memory.grandSummaryVisibleTailFloors
});

const displayName = computed(() => getCharacterDisplayName(props.character));
const boundUser = computed(() => store.userById(props.character.boundUserId) ?? store.user ?? null);
const conversationMessages = computed(() => getConversationActiveMessages(store.messagesForConversation(props.conversationId)));
const memories = computed(() => store.memoriesForConversation(props.conversationId));
const memoirMemoryCount = computed(() => memories.value.filter((memory) => !memory.isMergedSummary).length);
const grandSummaryCount = computed(() => memories.value.filter((memory) => memory.isMergedSummary).length);
const currentConversationSettings = computed(() => store.settingsForConversation(props.conversationId));
const totalMemoryTokenLabel = computed(() => {
  if (totalMemoryTokens.value !== null) return `${totalMemoryTokens.value} tokens`;
  return totalMemoryTokenPending.value ? '计算中' : '待计算';
});
const memoryTimelineItems = computed<MemoryTimelineItem[]>(() => {
  const summaryItems = memories.value.map((memory): MemoryTimelineItem => ({
    id: `memory:${memory.id}`,
    kind: 'summary',
    tone: memoryTimelineTone(memory),
    time: memory.createdAt,
    timeEnd: memory.updatedAt > memory.createdAt ? memory.updatedAt : undefined,
    timeLabel: formatTimelineRange(memory.createdAt, memory.updatedAt > memory.createdAt ? memory.updatedAt : undefined),
    eyebrow: memoryRangeLabel(memory),
    title: memoryTimelineTitle(memory),
    blocks: parseMemorySummaryBlocks(memory.summary),
    meta: [`${memory.tokenCount} tokens`, hiddenRangeLabel(memory)]
  }));
  return summaryItems.sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
});
const visibleMemoryTimelineItems = computed(() => memoryTimelineItems.value.slice(0, timelineDisplayLimit.value));
const visibleMemories = computed(() => memories.value.slice(0, memoryDisplayLimit.value));
const canShowMoreTimelineItems = computed(() => visibleMemoryTimelineItems.value.length < memoryTimelineItems.value.length);
const canShowMoreMemories = computed(() => visibleMemories.value.length < memories.value.length);
const memoryTimelineSpanLabel = computed(() => {
  const items = memoryTimelineItems.value;
  if (!items.length) return '0';
  const start = items[0].time;
  const end = items.reduce((max, item) => Math.max(max, item.timeEnd ?? item.time), start);
  const days = Math.max(1, Math.ceil((end - start + 1) / (24 * 60 * 60 * 1000)));
  return days > 99 ? '99+' : String(days);
});
const messageCount = computed(() => getConversationFloorCount(conversationMessages.value));
const hiddenFloorStatus = computed(() => {
  const hiddenRanges = getEffectiveHiddenFloorRanges(memories.value.flatMap((memory) => collectIncrementalGrandSummaries(memory))).map((range) => `${range.start}-${range.end}楼`);
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
  return Number.isFinite(start) && Number.isFinite(end) && start >= 1 && end >= start && end <= messageCount.value;
});
const tokenEstimateKey = computed(() => JSON.stringify({
  conversationId: props.conversationId,
  conversation: (() => {
    const conversation = store.conversationById(props.conversationId);
    return conversation ? { activeMode: conversation.activeMode, summary: conversation.summary, charId: conversation.charId, userId: conversation.userId } : null;
  })(),
  character: {
    id: props.character.id,
    nickname: props.character.nickname,
    name: props.character.name,
    signature: props.character.signature,
    description: props.character.description,
    boundUserId: props.character.boundUserId,
    localWorldBookIds: props.character.localWorldBookIds
  },
  boundUser: boundUser.value ? {
    id: boundUser.value.id,
    nickname: boundUser.value.nickname,
    name: boundUser.value.name,
    signature: boundUser.value.signature,
    description: boundUser.value.description
  } : null,
  settings: currentConversationSettings.value,
  messages: conversationMessages.value.map((message) => ({
    id: message.id,
    sender: message.sender,
    mode: message.mode,
    content: message.content,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    displayStyle: message.displayStyle,
    replyBatchId: message.replyBatchId,
    replyVariantState: message.replyVariantState,
    voomPostId: message.voomPostId,
    voomCommentId: message.voomCommentId,
    voomEventType: message.voomEventType,
    quote: message.quote ? {
      sender: message.quote.sender,
      content: message.quote.content,
      sticker: message.quote.sticker ? { description: message.quote.sticker.description, hasImage: Boolean(message.quote.sticker.imageUrl) } : undefined,
      image: message.quote.image ? { kind: message.quote.image.kind, description: message.quote.image.description, aiHint: message.quote.image.aiHint, hasUrl: Boolean(message.quote.image.url) } : undefined,
      voice: message.quote.voice ? { transcript: message.quote.voice.transcript } : undefined,
      location: message.quote.location,
      transfer: message.quote.transfer,
      offlineInvitation: message.quote.offlineInvitation
    } : undefined,
    sticker: message.sticker ? { description: message.sticker.description, hasImage: Boolean(message.sticker.imageUrl) } : undefined,
    image: message.image ? { kind: message.image.kind, description: message.image.description, aiHint: message.image.aiHint, hasUrl: Boolean(message.image.url) } : undefined,
    voice: message.voice ? { transcript: message.voice.transcript } : undefined,
    location: message.location,
    transfer: message.transfer,
    offlineInvitation: message.offlineInvitation
  })),
  memories: memories.value.map((memory) => ({
    id: memory.id,
    mode: memory.mode,
    kind: memory.kind,
    startFloor: memory.startFloor,
    endFloor: memory.endFloor,
    hiddenStartFloor: memory.hiddenStartFloor,
    hiddenEndFloor: memory.hiddenEndFloor,
    summary: memory.summary,
    tokenCount: memory.tokenCount,
    entries: memory.entries,
    sourceMessageIds: memory.sourceMessageIds,
    summaryRole: memory.summaryRole,
    isMergedSummary: memory.isMergedSummary,
    mergedFrom: memory.mergedFrom?.map((child) => ({ id: child.id, startFloor: child.startFloor, endFloor: child.endFloor, hiddenStartFloor: child.hiddenStartFloor, hiddenEndFloor: child.hiddenEndFloor, summary: child.summary, entries: child.entries, sourceMessageIds: child.sourceMessageIds, summaryRole: child.summaryRole, isMergedSummary: child.isMergedSummary })),
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt
  })),
  worldBooks: store.worldBooks.map((book) => ({
    id: book.id,
    title: book.title,
    content: book.content,
    scope: book.scope,
    enabled: book.enabled,
    entries: book.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      enabled: entry.enabled,
      activation: entry.activation,
      keys: entry.keys,
      secondaryKeys: entry.secondaryKeys,
      position: entry.position,
      order: entry.order,
      depth: entry.depth,
      probability: entry.probability,
      caseSensitive: entry.caseSensitive
    }))
  })),
  stickerGroups: store.stickerGroups.map((group) => ({ id: group.id, name: group.name, sortOrder: group.sortOrder, updatedAt: group.updatedAt })),
  stickers: store.stickers.map((sticker) => ({ id: sticker.id, description: sticker.description, groupIds: sticker.groupIds, hasImage: Boolean(sticker.imageUrl), updatedAt: sticker.updatedAt }))
}));

function cancelScheduledTokenEstimate() {
  const idleWindow = typeof window !== 'undefined' ? window as IdleWindow : null;
  if (tokenEstimateTimer !== undefined) {
    window.clearTimeout(tokenEstimateTimer);
    tokenEstimateTimer = undefined;
  }
  if (tokenEstimateIdleId !== undefined && idleWindow?.cancelIdleCallback) {
    idleWindow.cancelIdleCallback(tokenEstimateIdleId);
    tokenEstimateIdleId = undefined;
  }
}

function scheduleTokenEstimate() {
  tokenEstimateRun += 1;
  cancelScheduledTokenEstimate();
  totalMemoryTokens.value = null;
  totalMemoryTokenPending.value = true;
  const runId = tokenEstimateRun;
  const runEstimate = async () => {
    tokenEstimateTimer = undefined;
    tokenEstimateIdleId = undefined;
    if (runId !== tokenEstimateRun) return;
    try {
      const tokenCount = await store.nextReplyTokenCountForConversationAsync(props.conversationId);
      if (runId !== tokenEstimateRun) return;
      totalMemoryTokens.value = tokenCount;
    } catch {
      if (runId !== tokenEstimateRun) return;
      totalMemoryTokens.value = null;
    } finally {
      if (runId === tokenEstimateRun) totalMemoryTokenPending.value = false;
    }
  };
  const idleWindow = typeof window !== 'undefined' ? window as IdleWindow : null;
  if (!idleWindow) {
    runEstimate();
    return;
  }
  if (idleWindow.requestIdleCallback) {
    tokenEstimateIdleId = idleWindow.requestIdleCallback(runEstimate, { timeout: 1200 });
    return;
  }
  tokenEstimateTimer = window.setTimeout(runEstimate, 160);
}

function showMoreTimelineItems() {
  timelineDisplayLimit.value += 80;
}

function timelineDetailId(item: MemoryTimelineItem, block: MemorySummaryBlock, suffix: string) {
  return `${item.id}:${block.id}:${suffix}`;
}

function timelineCardId(item: MemoryTimelineItem) {
  return `${item.id}:card`;
}

function isTimelineDetailExpanded(detailId: string) {
  return expandedTimelineDetailIds.value.has(detailId);
}

function toggleTimelineDetail(detailId: string) {
  const nextIds = new Set(expandedTimelineDetailIds.value);
  if (nextIds.has(detailId)) nextIds.delete(detailId);
  else nextIds.add(detailId);
  expandedTimelineDetailIds.value = nextIds;
}

function isPrimaryEventField(field: MemoryEventField) {
  return /关键事件|主要事件|事件概要/.test(field.label);
}

function eventPrimaryFields(block: MemoryEventBlock) {
  const primaryFields = block.fields.filter(isPrimaryEventField);
  return primaryFields.length ? primaryFields : block.fields.slice(0, 1);
}

function eventFoldedFields(block: MemoryEventBlock) {
  const primaryFields = new Set(eventPrimaryFields(block));
  return block.fields.filter((field) => !primaryFields.has(field));
}

function listPrimaryItems(block: MemoryListBlock) {
  return block.items.slice(0, 3);
}

function listFoldedItems(block: MemoryListBlock) {
  return block.items.slice(3);
}

function showMoreMemories() {
  memoryDisplayLimit.value += 40;
}

watch(
  () => [props.conversationId, currentConversationSettings.value] as const,
  () => {
    Object.assign(draft, normalizeConversationSettings(currentConversationSettings.value, props.conversationId, 'offline'));
    syncMemoryNumberDraft();
    showMergePicker.value = false;
    showUnmergePicker.value = false;
    selectedMergeIds.value = [];
    fillLatestRange();
  },
  { immediate: true }
);

watch(
  () => tokenEstimateKey.value,
  scheduleTokenEstimate,
  { immediate: true }
);

watch(
  () => props.conversationId,
  () => {
    timelineDisplayLimit.value = 80;
    memoryDisplayLimit.value = 40;
    expandedTimelineDetailIds.value = new Set();
  }
);

onBeforeUnmount(cancelScheduledTokenEstimate);

watch(mergeableMemories, (nextMemories) => {
  const availableIds = new Set(nextMemories.map((memory) => memory.id));
  selectedMergeIds.value = selectedMergeIds.value.filter((memoryId) => availableIds.has(memoryId));
});

function saveDraft() {
  void store.saveConversationSettings({ ...draft, conversationId: props.conversationId });
}

function syncMemoryNumberDraft() {
  memoryNumberDraft.summarizeEvery = String(draft.memory.summarizeEvery);
  memoryNumberDraft.grandSummaryEvery = String(draft.memory.grandSummaryEvery);
  memoryNumberDraft.grandSummaryHiddenStartFloor = String(draft.memory.grandSummaryHiddenStartFloor);
  memoryNumberDraft.grandSummaryVisibleTailFloors = String(draft.memory.grandSummaryVisibleTailFloors);
  memoryNumberDraft.autoMergeThreshold = String(draft.memory.autoMergeThreshold);
  memoryNumberDraft.autoMergeBatchSize = String(draft.memory.autoMergeBatchSize);
}

function updateMemoryNumberDraft(field: MemoryNumberField, event: Event) {
  memoryNumberDraft[field] = (event.target as HTMLInputElement).value;
}

function memoryNumberLimits(field: MemoryNumberField) {
  return {
    summarizeEvery: { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: draft.memory.summarizeEvery },
    grandSummaryEvery: { min: 20, max: 300, fallback: draft.memory.grandSummaryEvery },
    grandSummaryHiddenStartFloor: { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: draft.memory.grandSummaryHiddenStartFloor },
    grandSummaryVisibleTailFloors: { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: draft.memory.grandSummaryVisibleTailFloors },
    autoMergeThreshold: { min: 3, max: 30, fallback: draft.memory.autoMergeThreshold },
    autoMergeBatchSize: { min: 2, max: 20, fallback: draft.memory.autoMergeBatchSize }
  }[field];
}

function commitMemoryNumberDraft(field: MemoryNumberField, event?: Event) {
  if (event?.target instanceof HTMLInputElement) memoryNumberDraft[field] = event.target.value;
  const limits = memoryNumberLimits(field);
  const numericValue = Number(memoryNumberDraft[field]);
  const nextValue = Math.min(limits.max, Math.max(limits.min, Math.round(Number.isFinite(numericValue) ? numericValue : limits.fallback)));
  memoryNumberDraft[field] = String(nextValue);
  if (draft.memory[field] === nextValue) return;
  draft.memory[field] = nextValue;
  if (field === 'grandSummaryHiddenStartFloor') manualSummary.hiddenStartFloor = nextValue;
  if (field === 'grandSummaryVisibleTailFloors') manualSummary.visibleTailFloors = nextValue;
  saveDraft();
}

async function manualSummarize() {
  if (!canManualSummarize.value) return;
  summarizing.value = true;
  try {
    const segmentStartFloor = Math.max(1, Math.floor(Number(manualSummary.startFloor)));
    const endFloor = Math.max(segmentStartFloor, Math.floor(Number(manualSummary.endFloor)));
    const result = await store.createManualIncrementalGrandSummary(props.conversationId, {
      segmentStartFloor,
      endFloor,
      hiddenStartFloor: Math.max(0, Math.floor(Number(manualSummary.hiddenStartFloor) || 0)),
      visibleTailFloors: Math.max(0, Math.floor(Number(manualSummary.visibleTailFloors) || 0))
    });
    if (result?.status === 'existing') {
      store.showConfigAlert(`${result.record.startFloor}-${result.record.endFloor} 楼新增大总结已存在，可直接编辑或先删除后重建。`, '大总结已存在');
    } else if (result?.status === 'busy') {
      const busyStartFloor = result.record?.startFloor ?? segmentStartFloor;
      const busyEndFloor = result.record?.endFloor ?? endFloor;
      store.showConfigAlert(`${busyStartFloor}-${busyEndFloor} 楼新增大总结正在生成中，请稍后刷新记忆空间。`, '大总结生成中');
    } else if (!result) {
      store.showConfigAlert(`该楼层范围暂时无法生成新增大总结，当前会话只有 ${messageCount.value} 楼，请检查结束楼层。`, '无法生成');
    }
    fillLatestRange();
  } finally {
    summarizing.value = false;
  }
}

function fillLatestRange() {
  const floorCount = Math.max(1, messageCount.value);
  const coveredRanges = memories.value
    .flatMap((memory) => collectIncrementalGrandSummaries(memory))
    .map((memory) => ({
      startFloor: Math.max(1, Math.floor(memory.startFloor)),
      endFloor: Math.max(1, Math.floor(memory.endFloor))
    }))
    .filter((range) => range.endFloor >= range.startFloor)
    .sort((left, right) => left.startFloor - right.startFloor || left.endFloor - right.endFloor);
  let startFloor = 1;
  let endFloor = floorCount;
  for (const range of coveredRanges) {
    if (range.endFloor < startFloor) continue;
    if (range.startFloor > startFloor) {
      endFloor = Math.min(floorCount, range.startFloor - 1);
      break;
    }
    startFloor = Math.max(startFloor, range.endFloor + 1);
  }
  if (startFloor > floorCount) startFloor = floorCount;
  manualSummary.startFloor = startFloor;
  manualSummary.endFloor = endFloor;
  manualSummary.hiddenStartFloor = draft.memory.grandSummaryHiddenStartFloor;
  manualSummary.visibleTailFloors = draft.memory.grandSummaryVisibleTailFloors;
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

function memoryMergeBadge(memory: ConversationMemoryRecord) {
  if (!memory.isMergedSummary) return '片段记忆';
  return `第 ${memoryMergeDepth(memory)} 层大总结 · ${leafMemoryCount(memory)} 个来源`;
}

function memoryTimelineTone(memory: ConversationMemoryRecord): MemoryTimelineItem['tone'] {
  if (!memory.isMergedSummary) return 'memoir';
  return memoryMergeDepth(memory) > 1 ? 'merged' : 'grand';
}

function memoryTimelineTitle(memory: ConversationMemoryRecord) {
  if (!memory.isMergedSummary) return '回忆录';
  return memoryMergeDepth(memory) > 1 ? '合并大总结' : '新增大总结';
}

function shouldShowTimelineHeading(content: string) {
  return !/^大总结[（(]/.test(content.trim());
}

const timelineTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function formatTimelineTime(timestamp: number | undefined) {
  if (!timestamp || !Number.isFinite(timestamp)) return '时间未知';
  return timelineTimeFormatter.format(timestamp);
}

function formatTimelineRange(start: number | undefined, end?: number) {
  const startText = formatTimelineTime(start);
  const endText = end && end !== start ? formatTimelineTime(end) : '';
  return endText && endText !== startText ? `${startText} 至 ${endText}` : startText;
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
    action: null,
    confirmOnly: false,
    errorTitle: '',
    errorMessage: '',
    errorDetails: []
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
  action?: ConfirmAction | null;
  confirmOnly?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  errorDetails?: string[];
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
    action: options.action ?? null,
    confirmOnly: options.confirmOnly ?? false,
    errorTitle: options.errorTitle ?? '',
    errorMessage: options.errorMessage ?? '',
    errorDetails: options.errorDetails ?? []
  } satisfies ConfirmDialogState);
}

function openMemoryErrorDialog(title: string, message: string, details: string[]) {
  openConfirmDialog({
    eyebrow: 'Memory error',
    title,
    message,
    details,
    confirmText: '知道了',
    runningText: '关闭中',
    tone: 'danger',
    action: null,
    confirmOnly: true
  });
}

function formatErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const details = [`错误类型：${error.name || 'Error'}`, `错误信息：${error.message || '无错误信息'}`];
    if (error.stack) details.push(`调用栈：${error.stack.slice(0, 1200)}`);
    return details;
  }
  return [`错误内容：${String(error)}`];
}

function manualSummaryDetailLines() {
  const startFloor = Math.max(1, Math.floor(Number(manualSummary.startFloor)));
  const endFloor = Math.max(startFloor, Math.floor(Number(manualSummary.endFloor)));
  const visibleTailFloors = Math.max(0, Math.floor(Number(manualSummary.visibleTailFloors) || 0));
  const hiddenStartFloor = Math.max(0, Math.floor(Number(manualSummary.hiddenStartFloor) || 0));
  const effectiveHiddenStartFloor = hiddenStartFloor > 0 ? Math.max(startFloor, hiddenStartFloor) : 0;
  const hiddenRange = getGrandSummaryHiddenRange(endFloor, effectiveHiddenStartFloor, visibleTailFloors);
  return [
    `新增区间：${startFloor}-${endFloor}楼`,
    `大总结范围：${startFloor}-${endFloor}楼`,
    draft.memory.hideSummarizedMessages && hiddenRange.hiddenStartFloor > 0 ? `隐藏范围：成功后隐藏 ${hiddenRange.hiddenStartFloor}-${hiddenRange.hiddenEndFloor}楼，保留最新 ${visibleTailFloors} 楼` : '隐藏范围：当前不会隐藏楼层',
    `当前对话总楼层：${messageCount.value}`
  ];
}

function closeConfirmDialog() {
  if (confirmDialog.running) return;
  resetConfirmDialog();
}

async function confirmPendingAction() {
  const pendingAction = confirmDialog.action;
  if (confirmDialog.confirmOnly && !pendingAction) {
    resetConfirmDialog();
    return;
  }
  if (!pendingAction || confirmDialog.running) return;
  const errorTitle = confirmDialog.errorTitle || '操作失败';
  const errorMessage = confirmDialog.errorMessage || '操作没有完成，请检查下面的错误详情。';
  const errorDetails = [...confirmDialog.errorDetails];
  confirmDialog.running = true;
  try {
    await pendingAction();
    resetConfirmDialog();
  } catch (error) {
    resetConfirmDialog();
    openMemoryErrorDialog(errorTitle, errorMessage, [...errorDetails, ...formatErrorDetails(error)]);
  }
}

function requestManualSummarize() {
  if (!canManualSummarize.value) return;
  openConfirmDialog({
    eyebrow: 'Manual grand memory',
    title: '新增这段大总结？',
    message: '会读取所选楼层正文和该区间回忆录，生成新增大总结；成功后会删除该区间回忆录。',
    details: manualSummaryDetailLines(),
    confirmText: '新增大总结',
    runningText: '生成中',
    action: manualSummarize,
    errorTitle: '新增大总结失败',
    errorMessage: '新增大总结没有完成，下面是本次范围和模型调用返回的详细错误。',
    errorDetails: manualSummaryDetailLines()
  });
}

async function resummarize(memoryId: string) {
  summarizing.value = true;
  try {
    const result = await store.resummarizeMemory(memoryId);
    if (result?.status === 'updated') {
      store.showConfigAlert(`已更新 ${result.record.startFloor}-${result.record.endFloor} 楼的总结。`, '重总结完成');
    } else if (result?.status === 'busy') {
      const rangeLabel = result.record ? `${result.record.startFloor}-${result.record.endFloor} 楼` : '该楼层范围';
      store.showConfigAlert(`${rangeLabel}正在总结中，请稍后再试。`, '总结进行中');
    } else if (!result) {
      store.showConfigAlert('这条记忆缺少可重新读取的原始楼层或上一层来源，无法重新总结。', '无法重新总结');
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
    details: [
      `当前类型：${memoryMergeBadge(memory)}`,
      `隐藏范围：${hiddenRangeLabel(memory)}`
    ],
    confirmText: '重新总结',
    runningText: '总结中',
    errorTitle: '重新总结失败',
    errorMessage: '重新总结没有完成，当前记忆仍保留原内容。',
    errorDetails: [`记忆范围：${memoryRangeLabel(memory)}`, `当前类型：${memoryMergeBadge(memory)}`],
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
    message: `会调用总结模型，把选中的 ${stats.count} 条记忆整合成 ${rangeText} 的全文大总结。`,
    details: [
      `包含来源：${stats.sourceCount} 个片段${stats.mergedCount ? `，其中 ${stats.mergedCount} 条已经是大总结` : ''}`,
      `原始 token 合计：${stats.tokenCount}`,
      '取消合并时会先恢复这一层的直接来源，可继续逐层取消。'
    ],
    confirmText: '开始合并',
    runningText: '合并中',
    errorTitle: '合并记忆失败',
    errorMessage: '合并大总结没有完成，选中的记忆仍保留原状态。',
    errorDetails: [`合并范围：${rangeText}`, `选中条数：${stats.count}`, `原始 token 合计：${stats.tokenCount}`],
    action: () => mergeMemories(memoryIds)
  });
}

async function mergeMemories(memoryIds: string[]) {
  if (memoryIds.length <= 1) return;
  summarizing.value = true;
  try {
    const result = await store.mergeConversationMemories(props.conversationId, memoryIds, { fullSummary: true });
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

function requestRunAutoMergeNow() {
  openConfirmDialog({
    eyebrow: 'Auto merge',
    title: '立即整理这些记忆？',
    message: '会按当前楼层规则调用总结模型；新增大总结读取累计楼层正文和本轮回忆录，成功后删除本轮回忆录。',
    details: [
      `当前可整理：${mergeableMemories.value.length} 条`,
      `已有大总结：${mergedMemories.value.length} 条`,
      `新增大总结：每 ${draft.memory.grandSummaryEvery} 楼触发一次，隐藏从 ${draft.memory.grandSummaryHiddenStartFloor} 楼开始，保留最新 ${draft.memory.grandSummaryVisibleTailFloors} 楼`,
      `全文大总结：${draft.memory.autoMergeThreshold} 条新增大总结触发；每批 ${draft.memory.autoMergeBatchSize} 条`
    ],
    confirmText: '立即整理',
    runningText: '整理中',
    action: runAutoMergeNow,
    errorTitle: '自动整理失败',
    errorMessage: '自动整理记忆没有完成，下面是当前策略和模型调用返回的详细错误。',
    errorDetails: [`可整理记忆：${mergeableMemories.value.length} 条`, `新增大总结楼层间隔：${draft.memory.grandSummaryEvery}`, `全文阈值：${draft.memory.autoMergeThreshold}`]
  });
}

function requestUnmergeMemories(memory: ConversationMemoryRecord) {
  openConfirmDialog({
    eyebrow: 'Restore layer',
    title: '取消这一层大总结？',
    message: `会撤回 ${memoryRangeLabel(memory)} 的当前大总结，恢复它保存的 ${directMergeChildCount(memory)} 条上一层记忆。`,
    details: [
      `当前层级：${memoryMergeBadge(memory)}`,
      '如果恢复出的条目里还有大总结，可以继续取消合并。',
      '当前大总结文本会被移除，上一层来源会回到记忆空间。'
    ],
    confirmText: '取消合并',
    runningText: '恢复中',
    errorTitle: '取消合并失败',
    errorMessage: '取消合并没有完成，当前大总结仍保留原状态。',
    errorDetails: [`记忆范围：${memoryRangeLabel(memory)}`, `当前层级：${memoryMergeBadge(memory)}`],
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
    details: memory.isMergedSummary
      ? [
          `当前层级：${memoryMergeBadge(memory)}`,
          '删除不会恢复被合并的来源；需要恢复来源时请先取消合并。'
        ]
      : ['删除后不会保留这条片段记忆。'],
    confirmText: '确认删除',
    runningText: '删除中',
    tone: 'danger',
    errorTitle: '删除总结失败',
    errorMessage: '删除操作没有完成，当前记忆仍保留原状态。',
    errorDetails: [`记忆范围：${memoryRangeLabel(memory)}`, `当前类型：${memoryMergeBadge(memory)}`],
    action: () => store.deleteMemoryRecord(memoryId)
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

function requestToggleHidden(memory: ConversationMemoryRecord, hidden: boolean) {
  if (!canEditMemoryHiddenRange(memory)) return;
  const nextHiddenRange = getGrandSummaryHiddenRange(memory.endFloor, draft.memory.grandSummaryHiddenStartFloor, draft.memory.grandSummaryVisibleTailFloors);
  const hiddenDetails = nextHiddenRange.hiddenStartFloor > 0
    ? [`总结范围：${memoryRangeLabel(memory)}`, `将隐藏：${nextHiddenRange.hiddenStartFloor}-${nextHiddenRange.hiddenEndFloor}楼`, `保留最新 ${draft.memory.grandSummaryVisibleTailFloors} 楼不隐藏`]
    : [`总结范围：${memoryRangeLabel(memory)}`, '当前设置不会预设隐藏范围；可调整隐藏开始楼层或保留最新楼层。'];
  openConfirmDialog({
    eyebrow: 'Hidden floors',
    title: hidden ? '隐藏这段旧楼层？' : '取消隐藏这段楼层？',
    message: hidden ? '会按新增大总结规则折叠旧楼层，但总结文本仍会被读取。' : '会让这条新增大总结对应的楼层重新进入后续上下文读取。',
    details: hidden
      ? hiddenDetails
      : [`当前隐藏：${hiddenRangeLabel(memory)}`, `总结范围：${memoryRangeLabel(memory)}`],
    confirmText: hidden ? '确认隐藏' : '取消隐藏',
    runningText: '保存中',
    action: () => store.toggleMemoryHiddenRange(memory.id, hidden),
    errorTitle: hidden ? '隐藏楼层失败' : '取消隐藏失败',
    errorMessage: '隐藏范围没有保存成功，请查看错误详情。',
    errorDetails: [`记忆范围：${memoryRangeLabel(memory)}`]
  });
}

function updateMemoryHiddenRange(memory: ConversationMemoryRecord, edge: 'start' | 'end', event: Event) {
  if (!canEditMemoryHiddenRange(memory)) return;
  const value = Math.max(0, Math.floor(Number((event.target as HTMLInputElement).value) || 0));
  const hiddenStartFloor = edge === 'start' ? value : memory.hiddenStartFloor;
  const hiddenEndFloor = edge === 'end' ? value : memory.hiddenEndFloor;
  void store.updateMemoryHiddenRange(memory.id, hiddenStartFloor, hiddenEndFloor);
}

function hiddenRangeLabel(memory: ConversationMemoryRecord) {
  if (!hasHiddenRange(memory)) return '未隐藏';
  return `${memory.hiddenStartFloor}-${memory.hiddenEndFloor}楼`;
}

function memoryHiddenTip(memory: ConversationMemoryRecord) {
  if (hasHiddenRange(memory)) return `已隐藏 ${hiddenRangeLabel(memory)}；后续生成会读取这条总结，而不是重复塞入这些旧楼层。`;
  const hiddenRange = getGrandSummaryHiddenRange(memory.endFloor, draft.memory.grandSummaryHiddenStartFloor, draft.memory.grandSummaryVisibleTailFloors);
  if (hiddenRange.hiddenStartFloor < 1) return '这条新增大总结按当前设置不预设隐藏范围。';
  return `推荐隐藏会折叠 ${hiddenRange.hiddenStartFloor}-${hiddenRange.hiddenEndFloor}楼，并保留最新 ${draft.memory.grandSummaryVisibleTailFloors} 楼。`;
}

function canEditMemoryHiddenRange(memory: ConversationMemoryRecord) {
  return isIncrementalGrandSummary(memory);
}

function hasHiddenRange(memory: ConversationMemoryRecord) {
  return canEditMemoryHiddenRange(memory) && memory.hiddenStartFloor > 0 && memory.hiddenEndFloor >= memory.hiddenStartFloor;
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

.strategy-wide-control {
  grid-column: 1 / -1;
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

.timeline-card {
  gap: 12px;
}

.timeline-dashboard strong {
  font-size: 16px;
}

.memory-timeline-list {
  display: grid;
  gap: 14px;
  padding: 2px 0;
}

.memory-timeline-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}

.timeline-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(77, 58, 71, 0.05);
  border-radius: 11px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 249, 252, 0.7)),
    rgba(255, 255, 255, 0.68);
}

.timeline-grand .timeline-copy {
  border-color: rgba(178, 139, 153, 0.12);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 248, 251, 0.76)),
    rgba(255, 255, 255, 0.68);
}

.timeline-merged .timeline-copy {
  border-color: rgba(141, 95, 112, 0.16);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 246, 250, 0.82)),
    rgba(255, 255, 255, 0.72);
  box-shadow: inset 3px 0 0 rgba(178, 139, 153, 0.34);
}

.timeline-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.timeline-card-heading > span {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

.timeline-card-heading em {
  min-width: 0;
  color: var(--memory-accent);
  font-size: 8px;
  font-weight: 950;
  line-height: 1.2;
  font-style: normal;
  overflow-wrap: anywhere;
}

.timeline-card-heading strong {
  color: #211d21;
  font-size: 11px;
  font-weight: 950;
  line-height: 1.25;
  white-space: nowrap;
}

.timeline-card-heading svg {
  flex: 0 0 auto;
  color: var(--memory-accent);
  transition: transform 160ms ease;
}

.timeline-card-heading[aria-expanded='true'] svg {
  transform: rotate(180deg);
}

.timeline-summary-display {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.timeline-summary-heading {
  margin: 1px 0 0;
  color: #211d21;
  font-size: 10px;
  font-weight: 950;
  line-height: 1.3;
}

.timeline-summary-field {
  display: grid;
  gap: 3px;
  padding: 6px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.58);
}

.timeline-summary-event {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(178, 139, 153, 0.14);
  border-radius: 11px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 250, 252, 0.72)),
    rgba(255, 255, 255, 0.68);
  box-shadow: inset 3px 0 0 rgba(178, 139, 153, 0.34);
}

.timeline-summary-event header {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.timeline-summary-event header span {
  color: var(--memory-accent);
  font-size: 8px;
  font-weight: 950;
  line-height: 1;
}

.timeline-summary-event header strong {
  color: #211d21;
  font-size: 12px;
  font-weight: 950;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.timeline-summary-event dl {
  display: grid;
  gap: 5px;
  margin: 0;
}

.timeline-summary-event dt {
  margin: 0;
  color: #8d5f70;
  font-size: 9px;
  font-weight: 950;
  line-height: 1.2;
}

.timeline-summary-event dd {
  margin: -2px 0 0;
  color: #4a4148;
  font-size: 10px;
  font-weight: 720;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.timeline-event-core {
  padding-bottom: 2px;
}

.timeline-foldout {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.timeline-foldout > button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  min-height: 30px;
  padding: 0 8px 0 10px;
  border: 1px solid rgba(178, 139, 153, 0.14);
  border-radius: 9px;
  background: linear-gradient(90deg, rgba(178, 139, 153, 0.12), rgba(255, 255, 255, 0.58));
  color: #8d5f70;
  font-size: 9px;
  font-weight: 950;
  line-height: 1;
  text-align: left;
  cursor: pointer;
}

.memory-panel .timeline-foldout > button {
  min-height: 30px;
  padding-block: 0;
  line-height: 1;
}

.timeline-foldout > button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-foldout > button em {
  margin-left: auto;
  color: var(--memory-muted);
  font-style: normal;
  white-space: nowrap;
}

.timeline-foldout > button svg {
  flex: 0 0 auto;
  transition: transform 0.18s ease;
}

.timeline-foldout.is-open > button svg {
  transform: rotate(180deg);
}

.timeline-event-details dl {
  padding: 7px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.5);
}

.timeline-block-foldout {
  padding: 2px 0;
}

.timeline-list-foldout {
  list-style: none;
}

.timeline-summary-list.nested-list {
  margin-top: 2px;
}

.timeline-summary-field span {
  color: var(--memory-accent);
  font-size: 8px;
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
}

.timeline-summary-field p,
.timeline-summary-paragraph,
.timeline-summary-list,
.timeline-empty-card {
  margin: 0;
  color: var(--memory-muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.42;
  overflow-wrap: anywhere;
}

.timeline-summary-list {
  display: grid;
  gap: 3px;
  padding-left: 13px;
}

.timeline-profile-table-shell {
  overflow-x: auto;
  border: 1px solid rgba(77, 58, 71, 0.06);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.66);
}

.timeline-profile-table-shell table {
  width: 100%;
  min-width: 390px;
  border-collapse: collapse;
  font-size: 10px;
  line-height: 1.3;
}

.timeline-profile-table-shell th,
.timeline-profile-table-shell td {
  padding: 5px 6px;
  border-bottom: 1px solid rgba(77, 58, 71, 0.06);
  text-align: left;
  vertical-align: top;
}

.timeline-profile-table-shell th {
  color: #8d5f70;
  font-weight: 950;
  white-space: nowrap;
}

.timeline-profile-table-shell td {
  color: #2d282d;
  font-weight: 700;
}

.timeline-graph-card {
  overflow: hidden;
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 35%, rgba(178, 139, 153, 0.16), transparent 44%),
    rgba(255, 255, 255, 0.58);
}

.timeline-graph-card svg {
  display: block;
  width: 100%;
  height: 150px;
}

.timeline-graph-card marker path {
  fill: #8d5f70;
}

.graph-edges line {
  stroke: rgba(141, 95, 112, 0.42);
  stroke-width: 1.4;
}

.graph-edges text {
  fill: #806673;
  font-size: 8px;
  font-weight: 850;
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgba(255, 249, 252, 0.92);
  stroke-width: 4px;
}

.graph-node rect {
  fill: rgba(255, 255, 255, 0.94);
  stroke: rgba(178, 139, 153, 0.22);
  stroke-width: 1;
}

.graph-node text {
  fill: #211d21;
  font-size: 9px;
  font-weight: 950;
  text-anchor: middle;
}

.timeline-summary-code {
  display: grid;
  gap: 4px;
  max-height: 150px;
  margin: 0;
  padding: 6px;
  overflow: auto;
  border-radius: 9px;
  background: #29222a;
  color: #fff8fb;
  font-size: 9px;
  line-height: 1.38;
  white-space: pre;
}

.timeline-summary-code span {
  color: #e0c2cc;
  font-size: 8px;
  font-weight: 950;
  text-transform: uppercase;
}

.timeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.timeline-meta em {
  padding: 2px 5px;
  border-radius: 999px;
  background: rgba(178, 139, 153, 0.1);
  color: #8d5f70;
  font-style: normal;
  font-size: 8px;
  font-weight: 900;
  line-height: 1;
}

.memory-timeline-row.is-archived .timeline-copy {
  background: rgba(244, 239, 242, 0.72);
  opacity: 0.82;
}

.action-grid.confirm-only {
  grid-template-columns: 1fr;
}

.list-more-action {
  min-height: 42px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  color: #8d5f70;
  font-size: 12px;
  font-weight: 950;
  box-shadow: inset 0 0 0 1px rgba(178, 139, 153, 0.12);
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

.memory-hidden-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  gap: 8px;
  align-items: end;
}

.memory-hidden-editor label {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.memory-hidden-editor span {
  overflow: hidden;
  color: #746a72;
  font-size: 11px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-hidden-editor input {
  width: 100%;
  min-height: 34px;
  border: 1px solid rgba(77, 58, 71, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.76);
  color: #211d21;
  font-size: 12px;
  font-weight: 800;
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

.memory-scroll-panel {
  min-height: 0;
  max-height: min(38vh, 320px);
  overflow-y: auto;
  padding-right: 2px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
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
  max-height: min(32vh, 240px);
  overflow-y: auto;
  margin: 0;
  padding: 10px 12px 10px 26px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
  overscroll-behavior: contain;
}

.memory-confirm-sheet li {
  overflow-wrap: anywhere;
}

.offline-memory-page .toggle-tile strong,
.offline-memory-page .toggle-copy small,
.offline-memory-page .offline-field > span,
.offline-memory-page .offline-field small,
.offline-memory-page .atom-title strong,
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
