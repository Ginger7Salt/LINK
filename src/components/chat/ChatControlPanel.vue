<template>
  <section class="control-panel">
      <section v-if="activeTab === 'memory'" class="panel-section memory-panel">
        <section class="memory-hero">
          <div>
            <span>Hippocampus Memory</span>
            <strong>{{ totalMemoryTokenLabel }}</strong>
            <p>{{ hiddenFloorStatus }}</p>
          </div>
          <button class="manual-summary-button" type="button" :disabled="summarizing" @click="showManualSummary = !showManualSummary">
            {{ summarizing ? '生成中' : '新增大总结' }}
          </button>
        </section>

        <form v-if="showManualSummary" class="manual-summary-card settings-block" @submit.prevent="requestManualSummarize">
          <header class="section-header compact-header">
            <div>
              <span>Manual range</span>
              <strong>手动新增大总结</strong>
            </div>
          </header>
          <div class="range-grid">
            <label class="field">
              <span>新增开始楼层</span>
              <input v-model.number="manualSummary.startFloor" min="1" type="number" />
            </label>
            <label class="field">
              <span>新增结束楼层</span>
              <input v-model.number="manualSummary.endFloor" :max="messageCount" min="1" type="number" />
            </label>
          </div>
          <div class="range-grid">
            <label class="field">
              <span>隐藏开始楼层</span>
              <input v-model.number="manualSummary.hiddenStartFloor" min="0" type="number" />
            </label>
            <label class="field">
              <span>保留最新楼层</span>
              <input v-model.number="manualSummary.visibleTailFloors" min="0" type="number" />
            </label>
          </div>
          <p>选择本轮要并入新增大总结的楼层；生成时只会读取所选楼层正文和该区间回忆录。</p>
          <div class="manual-summary-actions">
            <button class="summary-submit" type="submit" :disabled="summarizing || !canManualSummarize">新增大总结</button>
            <button class="secondary-action" type="button" @click="fillLatestRange">填入未大总结楼层</button>
          </div>
        </form>

        <section class="settings-block memory-strategy-block">
          <header class="section-header">
            <div>
              <span>Automation</span>
              <strong>记忆策略</strong>
            </div>
          </header>
          <div class="memory-strategy-stack">
            <div class="strategy-group">
              <div class="strategy-copy">
                <span>基础归档</span>
                <strong>按楼层生成回忆录</strong>
              </div>
              <div class="strategy-control-grid">
                <label class="switch-card">
                  <input v-model="draft.memory.autoSummarize" type="checkbox" @change="saveDraft" />
                  <span class="switch-track"></span>
                  <div>
                    <strong>自动总结</strong>
                    <span>按楼层把长聊天归档成回忆录。</span>
                  </div>
                </label>
                <label class="field compact-field">
                  <span>每多少楼生成回忆录</span>
                  <input :value="memoryNumberDraft.summarizeEvery" inputmode="numeric" min="1" step="1" type="number" @input="updateMemoryNumberDraft('summarizeEvery', $event)" @change="commitMemoryNumberDraft('summarizeEvery', $event)" @blur="commitMemoryNumberDraft('summarizeEvery', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('summarizeEvery', $event)" />
                  <small>默认 50；会按此楼数生成一份回忆录。</small>
                </label>
              </div>
            </div>

            <div class="strategy-group">
              <div class="strategy-copy">
                <span>新增大总结</span>
                <strong>按累计楼层生成新增大总结</strong>
              </div>
              <div class="strategy-control-grid">
                <label class="switch-card strategy-wide-control">
                  <input v-model="draft.memory.autoGrandSummaryEnabled" type="checkbox" @change="saveDraft" />
                  <span class="switch-track"></span>
                  <div>
                    <strong>自动生成新增大总结</strong>
                    <span>楼层达到 250、500、750... 时，读取累计楼层正文和本轮回忆录。</span>
                  </div>
                </label>
                <label class="field compact-field">
                  <span>每多少楼触发新增大总结</span>
                  <input :value="memoryNumberDraft.grandSummaryEvery" inputmode="numeric" min="20" max="300" type="number" @input="updateMemoryNumberDraft('grandSummaryEvery', $event)" @change="commitMemoryNumberDraft('grandSummaryEvery', $event)" @blur="commitMemoryNumberDraft('grandSummaryEvery', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('grandSummaryEvery', $event)" />
                  <small>默认 250；第 250/500 楼触发，成功后删除本轮回忆录。</small>
                </label>
                <label class="switch-card strategy-wide-control">
                  <input v-model="draft.memory.hideSummarizedMessages" type="checkbox" @change="saveDraft" />
                  <span class="switch-track"></span>
                  <div>
                    <strong>新增大总结后隐藏楼层</strong>
                    <span>按下面的隐藏起点和保留楼层生成默认隐藏范围。</span>
                  </div>
                </label>
                <label class="field compact-field">
                  <span>隐藏从第几楼开始</span>
                  <input :value="memoryNumberDraft.grandSummaryHiddenStartFloor" inputmode="numeric" min="0" step="1" type="number" @input="updateMemoryNumberDraft('grandSummaryHiddenStartFloor', $event)" @change="commitMemoryNumberDraft('grandSummaryHiddenStartFloor', $event)" @blur="commitMemoryNumberDraft('grandSummaryHiddenStartFloor', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('grandSummaryHiddenStartFloor', $event)" />
                  <small>默认 1；设为 0 时新增大总结不预设隐藏范围。</small>
                </label>
                <label class="field compact-field">
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
              <div class="strategy-control-grid">
                <label class="switch-card strategy-wide-control">
                  <input v-model="draft.memory.autoMergeEnabled" type="checkbox" @change="saveDraft" />
                  <span class="switch-track"></span>
                  <div>
                    <strong>自动生成全文大总结</strong>
                    <span>新增大总结数量达标后，继续合成为全文大总结。</span>
                  </div>
                </label>
                <label class="field compact-field">
                  <span>每多少条新增大总结触发全文大总结</span>
                  <input :value="memoryNumberDraft.autoMergeThreshold" inputmode="numeric" min="3" max="30" type="number" @input="updateMemoryNumberDraft('autoMergeThreshold', $event)" @change="commitMemoryNumberDraft('autoMergeThreshold', $event)" @blur="commitMemoryNumberDraft('autoMergeThreshold', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('autoMergeThreshold', $event)" />
                  <small>默认 8，达到后进入全文大总结。</small>
                </label>
                <label class="field compact-field">
                  <span>每批合并几条新增大总结</span>
                  <input :value="memoryNumberDraft.autoMergeBatchSize" inputmode="numeric" min="2" max="20" type="number" @input="updateMemoryNumberDraft('autoMergeBatchSize', $event)" @change="commitMemoryNumberDraft('autoMergeBatchSize', $event)" @blur="commitMemoryNumberDraft('autoMergeBatchSize', $event)" @keydown.enter.prevent="commitMemoryNumberDraft('autoMergeBatchSize', $event)" />
                  <small>默认 6，每批合并 6 个新增大总结。</small>
                </label>
                <button class="secondary-action memory-run-action strategy-wide-control" type="button" :disabled="summarizing || mergeDisabled" @click="requestRunAutoMergeNow">立即整理记忆层级</button>
              </div>
            </div>

          </div>
        </section>

        <section class="settings-block memory-timeline-block">
          <header class="section-header record-header">
            <div>
              <span>Chronology</span>
              <strong>记忆时间线</strong>
            </div>
            <em>{{ memoryTimelineItems.length }} 条</em>
          </header>
          <div v-if="memoryTimelineItems.length" class="memory-merge-dashboard timeline-dashboard">
            <span>
              <strong>{{ memoirMemoryCount }}</strong>
              <small>回忆录</small>
            </span>
            <span>
              <strong>{{ grandSummaryCount }}</strong>
              <small>大总结</small>
            </span>
            <span>
              <strong>{{ memoryTimelineSpanLabel }}</strong>
              <small>跨度</small>
            </span>
          </div>
          <div v-if="memoryTimelineItems.length" class="memory-timeline-list" role="list">
            <article v-for="item in visibleMemoryTimelineItems" :key="item.id" class="memory-timeline-row" :class="[`timeline-${item.kind}`, { 'is-archived': item.archived }]" role="listitem">
              <time>{{ item.timeLabel }}</time>
              <div class="timeline-dot" aria-hidden="true"></div>
              <div class="timeline-copy">
                <span>{{ item.eyebrow }}</span>
                <strong>{{ item.title }}</strong>
                <section class="timeline-summary-display" aria-label="完整记忆摘要">
                  <template v-for="block in item.blocks" :key="block.id">
                    <h4 v-if="block.kind === 'heading'" class="timeline-summary-heading">{{ block.content }}</h4>
                    <div v-else-if="block.kind === 'field'" class="timeline-summary-field">
                      <span>{{ block.label }}</span>
                      <p>{{ block.content }}</p>
                    </div>
                    <article v-else-if="block.kind === 'event'" class="timeline-summary-event">
                      <header>
                        <span>时间</span>
                        <strong>{{ block.time }}</strong>
                      </header>
                      <dl>
                        <template v-for="field in block.fields" :key="`${block.id}-${field.label}`">
                          <dt>{{ field.label }}</dt>
                          <dd>{{ field.content || '未填写' }}</dd>
                        </template>
                      </dl>
                    </article>
                    <ul v-else-if="block.kind === 'list'" class="timeline-summary-list">
                      <li v-for="listItem in block.items" :key="listItem">{{ listItem }}</li>
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
                    <pre v-else-if="block.kind === 'code'" class="timeline-summary-code"><span>{{ block.language || 'code' }}</span>{{ block.content }}</pre>
                    <p v-else class="timeline-summary-paragraph">{{ block.content }}</p>
                  </template>
                </section>
                <div v-if="item.meta.length" class="timeline-meta">
                  <em v-for="meta in item.meta" :key="meta">{{ meta }}</em>
                </div>
              </div>
            </article>
          </div>
          <button v-if="canShowMoreTimelineItems" class="list-more-action" type="button" @click="showMoreTimelineItems">显示更多时间线</button>
          <div v-if="!memoryTimelineItems.length" class="empty-note memory-empty-note">还没有可展示的时间线。完成一次回忆录或大总结后，这里会按创建时间排列记忆。</div>
        </section>

        <section class="memory-records settings-block">
          <header class="section-header record-header">
            <div>
              <span>Memory space</span>
              <strong>记忆空间</strong>
            </div>
            <em>{{ memories.length }} 条</em>
          </header>
          <div v-if="memories.length" class="memory-merge-dashboard">
            <span>
              <strong>{{ mergeableMemories.length }}</strong>
              <small>可整理</small>
            </span>
            <span>
              <strong>{{ mergedMemories.length }}</strong>
              <small>大总结</small>
            </span>
            <span>
              <strong>{{ mergeDepthPeak }}</strong>
              <small>全文层级</small>
            </span>
          </div>
          <div class="merge-actions">
            <button class="secondary-action" type="button" :disabled="summarizing || mergeDisabled" @click="toggleMergePicker">{{ showMergePicker ? '收起合并' : '合并大总结' }}</button>
            <button class="secondary-action" type="button" :disabled="summarizing || !hasMergedSummary" @click="toggleUnmergePicker">{{ showUnmergePicker ? '收起取消' : '取消合并大总结' }}</button>
          </div>
          <section v-if="showMergePicker" class="merge-picker merge-picker-panel">
            <header class="merge-picker-head">
              <div>
                <strong>合并队列</strong>
                <span>{{ mergeSelectionHint }}</span>
              </div>
              <button class="tiny-action" type="button" :disabled="!mergeableMemories.length" @click="toggleAllMergeMemories">
                {{ allMergeIdsSelected ? '清空' : '全选' }}
              </button>
            </header>
            <label v-for="memory in mergeableMemories" :key="memory.id" class="merge-row switch-card compact-switch" :class="{ selected: selectedMergeIds.includes(memory.id) }">
              <input v-model="selectedMergeIds" :value="memory.id" type="checkbox" />
              <span class="switch-track"></span>
              <span class="merge-row-copy">
                <strong>{{ memoryRangeLabel(memory) }}</strong>
                <small>{{ memoryMergeBadge(memory) }} · {{ memory.tokenCount }} tokens</small>
              </span>
            </label>
            <button class="summary-submit" type="button" :disabled="summarizing || selectedMergeIds.length <= 1" @click="requestMergeMemories">确认合并</button>
          </section>
          <section v-if="showUnmergePicker" class="merge-picker merge-picker-panel">
            <header class="merge-picker-head">
              <div>
                <strong>可撤回的大总结</strong>
                <span>每次只撤回一层，保留继续逐层回退的空间。</span>
              </div>
            </header>
            <button v-for="memory in mergedMemories" :key="memory.id" class="merge-row button-row" type="button" @click="requestUnmergeMemories(memory)">
              <span class="merge-row-copy">
                <strong>{{ memoryRangeLabel(memory) }}</strong>
                <small>恢复 {{ directMergeChildCount(memory) }} 条上一层记忆 · {{ memoryMergeBadge(memory) }}</small>
              </span>
            </button>
          </section>
          <article v-for="memory in visibleMemories" :key="memory.id" class="memory-card">
            <div class="memory-card-head">
              <div>
                <span>{{ memory.isMergedSummary ? 'Grand summary' : 'Memoir page' }}</span>
                <strong>{{ memory.startFloor }}-{{ memory.endFloor }}楼</strong>
              </div>
              <em>{{ memory.isMergedSummary ? '大总结' : '回忆录' }}</em>
            </div>
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
              <button class="secondary-action" type="button" @click="requestToggleHidden(memory, !hasHiddenRange(memory))">{{ hasHiddenRange(memory) ? '取消隐藏' : '推荐隐藏' }}</button>
            </div>
            <div class="memory-actions">
              <button class="secondary-action" type="button" :disabled="summarizing" @click="requestResummarizeMemory(memory.id)">重新总结</button>
              <button class="danger-action" type="button" @click="requestDeleteMemory(memory.id)">删除总结</button>
            </div>
          </article>
          <button v-if="canShowMoreMemories" class="list-more-action" type="button" @click="showMoreMemories">显示更多总结</button>
          <div v-if="!memories.length" class="empty-note memory-empty-note">记忆空间暂时空着。达到 6 楼后会自动归档回忆录，也可以手动新增大总结。</div>
        </section>
      </section>

      <section v-else-if="activeTab === 'beauty'" class="panel-section beauty-panel">
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Canvas</span>
              <strong>聊天背景</strong>
            </div>
          </header>
          <div class="background-manager">
            <section class="background-tool-panel" aria-label="背景导入与颜色">
              <label class="field background-url-card">
                <div class="background-field-title">
                  <span>背景图 URL</span>
                  <button class="setting-action-button primary-setting-action" type="button" aria-label="添加背景图 URL" @click="addBackgroundImageFromUrl">
                    <Plus :size="16" stroke-width="2.5" aria-hidden="true" />
                  </button>
                </div>
                <input v-model="backgroundImageUrlDraft" placeholder="https://..." @keydown.enter.prevent="addBackgroundImageFromUrl" />
              </label>
              <div class="background-quick-actions">
                <label class="upload-card background-upload-card">
                  <strong>导入本地图片</strong>
                  <input type="file" accept="image/*" multiple @change="readAppearanceFiles" />
                </label>
                <label class="field background-color-card appearance-color-field">
                  <span>背景色</span>
                  <div class="background-color-select">
                    <input v-model="draft.appearance.backgroundColor" type="color" @change="saveDraft" />
                    <span>{{ draft.appearance.backgroundColor }}</span>
                  </div>
                </label>
              </div>
            </section>
            <section class="background-library" aria-label="背景图列表">
              <article
                v-for="(image, index) in backgroundImageOptions"
                :key="`${image}-${index}`"
                class="background-thumb-card"
                :class="{ active: draft.appearance.backgroundImage === image }"
              >
                <button class="background-thumb" type="button" :style="{ backgroundImage: `url(${image})` }" @click="applyBackgroundImage(image)">
                  <span>{{ draft.appearance.backgroundImage === image ? '使用中' : `背景 ${index + 1}` }}</span>
                </button>
                <div class="background-thumb-actions">
                  <button type="button" :disabled="draft.appearance.backgroundImage === image" @click="applyBackgroundImage(image)">应用</button>
                  <button type="button" @click="removeBackgroundImage(image)">删除</button>
                </div>
              </article>
              <div v-if="!backgroundImageOptions.length" class="empty-note compact-empty-note">还没有背景图，添加 URL 或导入本地图片即可保存多个方案。</div>
            </section>
          </div>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Bubble system</span>
              <strong>气泡配色</strong>
            </div>
          </header>
          <section class="bubble-preview" :style="bubblePreviewStyle" aria-label="气泡预览">
            <div class="preview-row character-preview-row">
              <img class="avatar mini" :src="characterDraft.avatar" :alt="characterDraftNickname" />
              <div class="preview-bubble" :style="characterBubblePreviewStyle">角色的聊天会像这样显示。</div>
            </div>
            <div class="preview-row user-preview-row">
              <div class="preview-bubble" :style="userBubblePreviewStyle">用户气泡颜色在这里预览。</div>
              <img v-if="draft.appearance.showUserAvatar" class="avatar mini" :src="userAvatarPreview" :alt="userAvatarAlt" />
            </div>
            <div class="preview-row narration-preview-row">
              <div class="preview-bubble narration-preview-bubble" :style="narrationBubblePreviewStyle">旁白会像这样显示。</div>
            </div>
          </section>
          <div class="color-grid bubble-color-grid">
            <label class="field color-card">
              <span>我方气泡</span>
              <input v-model="draft.appearance.userBubbleColor" type="color" @change="saveDraft" />
              <div class="rgb-input-row" aria-label="我方气泡 RGB">
                <input :value="rgbParts(draft.appearance.userBubbleColor).red" aria-label="我方气泡 R" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('userBubbleColor', 'red', $event)" />
                <input :value="rgbParts(draft.appearance.userBubbleColor).green" aria-label="我方气泡 G" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('userBubbleColor', 'green', $event)" />
                <input :value="rgbParts(draft.appearance.userBubbleColor).blue" aria-label="我方气泡 B" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('userBubbleColor', 'blue', $event)" />
              </div>
            </label>
            <label class="field color-card">
              <span>我方文字</span>
              <input v-model="draft.appearance.userTextColor" type="color" @change="saveDraft" />
              <div class="rgb-input-row" aria-label="我方文字 RGB">
                <input :value="rgbParts(draft.appearance.userTextColor).red" aria-label="我方文字 R" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('userTextColor', 'red', $event)" />
                <input :value="rgbParts(draft.appearance.userTextColor).green" aria-label="我方文字 G" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('userTextColor', 'green', $event)" />
                <input :value="rgbParts(draft.appearance.userTextColor).blue" aria-label="我方文字 B" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('userTextColor', 'blue', $event)" />
              </div>
            </label>
            <label class="field color-card">
              <span>对方气泡</span>
              <input v-model="draft.appearance.characterBubbleColor" type="color" @change="saveDraft" />
              <div class="rgb-input-row" aria-label="对方气泡 RGB">
                <input :value="rgbParts(draft.appearance.characterBubbleColor).red" aria-label="对方气泡 R" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('characterBubbleColor', 'red', $event)" />
                <input :value="rgbParts(draft.appearance.characterBubbleColor).green" aria-label="对方气泡 G" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('characterBubbleColor', 'green', $event)" />
                <input :value="rgbParts(draft.appearance.characterBubbleColor).blue" aria-label="对方气泡 B" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('characterBubbleColor', 'blue', $event)" />
              </div>
            </label>
            <label class="field color-card">
              <span>对方文字</span>
              <input v-model="draft.appearance.characterTextColor" type="color" @change="saveDraft" />
              <div class="rgb-input-row" aria-label="对方文字 RGB">
                <input :value="rgbParts(draft.appearance.characterTextColor).red" aria-label="对方文字 R" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('characterTextColor', 'red', $event)" />
                <input :value="rgbParts(draft.appearance.characterTextColor).green" aria-label="对方文字 G" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('characterTextColor', 'green', $event)" />
                <input :value="rgbParts(draft.appearance.characterTextColor).blue" aria-label="对方文字 B" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('characterTextColor', 'blue', $event)" />
              </div>
            </label>
            <label class="field color-card">
              <span>旁白背景</span>
              <input v-model="draft.appearance.narrationBubbleColor" type="color" @change="saveDraft" />
              <div class="rgb-input-row" aria-label="旁白背景 RGB">
                <input :value="rgbParts(draft.appearance.narrationBubbleColor).red" aria-label="旁白背景 R" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('narrationBubbleColor', 'red', $event)" />
                <input :value="rgbParts(draft.appearance.narrationBubbleColor).green" aria-label="旁白背景 G" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('narrationBubbleColor', 'green', $event)" />
                <input :value="rgbParts(draft.appearance.narrationBubbleColor).blue" aria-label="旁白背景 B" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('narrationBubbleColor', 'blue', $event)" />
              </div>
            </label>
            <label class="field color-card">
              <span>旁白文字</span>
              <input v-model="draft.appearance.narrationTextColor" type="color" @change="saveDraft" />
              <div class="rgb-input-row" aria-label="旁白文字 RGB">
                <input :value="rgbParts(draft.appearance.narrationTextColor).red" aria-label="旁白文字 R" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('narrationTextColor', 'red', $event)" />
                <input :value="rgbParts(draft.appearance.narrationTextColor).green" aria-label="旁白文字 G" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('narrationTextColor', 'green', $event)" />
                <input :value="rgbParts(draft.appearance.narrationTextColor).blue" aria-label="旁白文字 B" inputmode="numeric" max="255" min="0" type="number" @change="updateRgbColor('narrationTextColor', 'blue', $event)" />
              </div>
            </label>
          </div>
        </section>
        <section class="settings-block display-options-grid">
          <label class="switch-card wide">
            <input v-model="draft.appearance.showReadStatus" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>显示已读未读</strong>
            </div>
          </label>
          <label class="switch-card wide">
            <input v-model="draft.appearance.showMessageTime" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>显示气泡外时间</strong>
            </div>
          </label>
          <label class="switch-card wide">
            <input v-model="draft.appearance.showUserAvatar" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>显示用户头像</strong>
            </div>
          </label>
          <label class="switch-card wide">
            <input v-model="draft.appearance.showOnlyFirstAvatarInReply" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>角色与用户的消息仅首条头像</strong>
            </div>
          </label>
        </section>
      </section>

      <section v-else-if="activeTab === 'profile'" class="panel-section profile-panel">
        <section class="profile-section wide-field" aria-label="角色基础资料">
          <div class="avatar-card">
            <img class="avatar-preview" :src="characterDraft.avatar" :alt="characterDraftNickname" />
            <label class="avatar-upload">
              <input type="file" accept="image/*" @change="readAvatarFile" />
              <span>导入头像</span>
            </label>
          </div>
          <div class="profile-fields">
            <label class="field avatar-url-field">
              <span>头像 URL</span>
              <input v-model="characterDraft.avatar" @change="saveCharacterDraft" />
            </label>

            <section class="identity-row" aria-label="角色名称资料">
              <label class="field compact-field">
                <span>名字</span>
                <input v-model="characterDraft.name" @change="saveCharacterDraft" />
              </label>

              <label class="field compact-field">
                <span>网名</span>
                <input v-model="characterDraft.nickname" @change="saveCharacterDraft" />
              </label>

              <label class="field compact-field note-field">
                <span>备注</span>
                <input v-model="characterDraft.userNote" @change="saveCharacterDraft" />
              </label>
            </section>
          </div>
        </section>

        <label class="field wide-field">
          <span>个性签名</span>
          <input v-model="characterDraft.signature" @change="saveCharacterDraft" />
        </label>

        <label class="field wide-field">
          <span>角色资料</span>
          <textarea v-model="characterDraft.description" rows="7" @change="saveCharacterDraft"></textarea>
        </label>

        <section class="local-book-bind wide-field" aria-labelledby="profile-local-world-book-title">
          <div class="local-book-header">
            <strong id="profile-local-world-book-title">绑定局部世界书</strong>
            <span v-if="localWorldBooks.length">{{ characterDraft.localWorldBookIds.length }}/{{ localWorldBooks.length }}</span>
          </div>
          <div v-if="localWorldBooks.length" class="local-book-list">
            <label v-for="book in localWorldBooks" :key="book.id" class="local-book-row" :class="{ selected: characterDraft.localWorldBookIds.includes(book.id) }">
              <input :checked="characterDraft.localWorldBookIds.includes(book.id)" type="checkbox" @change="toggleLocalWorldBook(book.id, $event)" />
              <span>{{ book.title }}</span>
              <span class="book-check" aria-hidden="true"></span>
            </label>
          </div>
          <p v-else class="local-book-empty">暂无局部世界书</p>
        </section>
      </section>

      <section v-else class="panel-section other-panel">
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Narration</span>
              <strong>旁白模式</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input v-model="draft.narrationModeEnabled" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>开启旁白模式</strong>
              <span>线上聊天回复会加入角色动描等旁白。</span>
            </div>
          </label>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Stickers</span>
              <strong>贴纸读取</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input v-model="draft.stickerVisionEnabled" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>开启 Stickers 识图</strong>
              <span>关闭后角色只能读取 Sticker 的文字描述。</span>
            </div>
          </label>
          <label class="switch-card wide">
            <input v-model="draft.stickerSuggestionsEnabled" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>开启 Stickers 智能推荐</strong>
              <span>输入文字时基于描述、最近发送和当前会话习惯推荐贴纸。</span>
            </div>
          </label>
          <button class="sticker-bind-trigger" type="button" @click="toggleStickerGroupPicker">
            <span>
              <strong>角色绑定 Stickers分组</strong>
              <small>{{ characterStickerBindingSummary }}</small>
            </span>
            <ChevronDown :size="18" aria-hidden="true" />
          </button>
          <section v-if="showStickerGroupPicker" class="sticker-group-popover">
            <label v-for="group in stickerGroupPickerRows" :key="group.id" class="sticker-group-option switch-card compact-switch">
              <input :checked="draft.characterStickerGroupIds.includes(group.id)" type="checkbox" @change="updateCharacterStickerGroup(group.id, $event)" />
              <span class="switch-track"></span>
              <span class="sticker-group-name">{{ group.name }}</span>
            </label>
            <div v-if="!stickerGroupPickerRows.length" class="empty-note">暂无 Stickers 分组。</div>
          </section>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>VOOM</span>
              <strong>动态生成</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input :checked="draft.autoGenerateVoom" type="checkbox" @change="updateAutoGenerateVoom" />
            <span class="switch-track"></span>
            <div>
              <strong>允许 AI 回复时自动发布 VOOM</strong>
            </div>
          </label>
          <label class="field frequency-field">
            <span>发布动态频率</span>
            <select :value="draft.voomFrequency" @change="updateVoomFrequency">
              <option v-for="option in voomFrequencyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Theater</span>
              <strong>小剧场生成</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input :checked="draft.autoGenerateTheater" type="checkbox" @change="updateAutoGenerateTheater" />
            <span class="switch-track"></span>
            <div>
              <strong>允许角色主动生成小剧场</strong>
              <span>生成独立番外 HTML 页面，不写入聊天楼层，也不会作为后续 AI 记忆读取。</span>
            </div>
          </label>
          <label class="field frequency-field">
            <span>小剧场生成频率</span>
            <select :value="draft.theaterFrequency" :disabled="!draft.autoGenerateTheater" @change="updateTheaterFrequency">
              <option v-for="option in voomFrequencyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Initiative</span>
              <strong>主动消息</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input :checked="draft.proactiveReply.enabled" type="checkbox" @change="updateProactiveReplyEnabled" />
            <span class="switch-track"></span>
            <div>
              <strong>允许角色主动发送消息</strong>
              <span>开启后，该角色会按频率在聊天中主动调用 API 联系你。</span>
            </div>
          </label>
          <label class="switch-card wide">
            <input :checked="draft.offlineInvitationEnabled" type="checkbox" @change="updateOfflineInvitationEnabled" />
            <span class="switch-track"></span>
            <div>
              <strong>允许角色主动发起线下邀约</strong>
              <span>开启后，角色可在想见面时主动发送线下邀约卡。</span>
            </div>
          </label>
          <label class="field frequency-field">
            <span>该角色主动消息频率</span>
            <select :value="draft.proactiveReply.frequency" :disabled="!draft.proactiveReply.enabled" @change="updateProactiveReplyFrequency">
              <option v-for="option in voomFrequencyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </section>
        <section class="settings-block">
          <header class="section-header">
            <div>
              <span>Local time</span>
              <strong>时间感知</strong>
            </div>
          </header>
          <label class="switch-card wide">
            <input v-model="draft.timeAwareness.enabled" type="checkbox" @change="saveDraft" />
            <span class="switch-track"></span>
            <div>
              <strong>开启时间感知</strong>
              <span>覆盖聊天回复、VOOM 生成与评论区回复。</span>
            </div>
          </label>
          <section v-if="draft.timeAwareness.enabled" class="time-awareness-note">
            每次生成内容时都会重新读取本机实时信息，适合判断作息、日期和日常节奏。
          </section>
        </section>
      </section>

      <AvatarCropperModal v-model="showAvatarEditor" :src="avatarEditorSource" @confirm="applyEditedAvatar" />
      <AppModal :model-value="confirmDialog.open" :title="confirmDialog.title" :show-header="false" variant="ins" @update:model-value="updateConfirmDialogOpen">
        <section class="memory-confirm-card" :class="`memory-confirm-card-${confirmDialog.tone}`">
          <span>{{ confirmDialog.eyebrow }}</span>
          <h2>{{ confirmDialog.title }}</h2>
          <p>{{ confirmDialog.message }}</p>
          <ul v-if="confirmDialog.details.length">
            <li v-for="detail in confirmDialog.details" :key="detail">{{ detail }}</li>
          </ul>
          <div class="memory-confirm-actions" :class="{ 'confirm-only': confirmDialog.confirmOnly }">
            <button v-if="!confirmDialog.confirmOnly" class="secondary-action" type="button" :disabled="confirmDialog.running" @click="closeConfirmDialog">取消</button>
            <button class="summary-submit" :class="{ 'danger-confirm': confirmDialog.tone === 'danger' }" type="button" :disabled="confirmDialog.running" @click="confirmPendingAction">
              {{ confirmDialog.running ? confirmDialog.runningText : confirmDialog.confirmText }}
            </button>
          </div>
        </section>
      </AppModal>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown, Plus } from 'lucide-vue-next';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import AppModal from '@/components/common/AppModal.vue';
import AvatarCropperModal from '@/components/image/AvatarCropperModal.vue';
import { useAppStore } from '@/stores/appStore';
import type { CharacterProfile, ChatAppearanceSettings, ConversationMemoryRecord, ConversationSettings } from '@/types/domain';
import { readImageFileFromInput } from '@/utils/imageFile';
import { collectIncrementalGrandSummaries, estimateTokenCount, getConversationActiveMessages, getConversationFloorCount, getEffectiveHiddenFloorRanges, getGrandSummaryHiddenRange, isIncrementalGrandSummary, normalizeConversationSettings } from '@/utils/memory';
import { parseMemorySummaryBlocks, type MemorySummaryBlock } from '@/utils/memorySummary';
import { defaultProfileAvatar } from '@/utils/profile';
import { normalizeVoomFrequency, voomFrequencyOptions } from '@/utils/voom';

type ColorField = 'userBubbleColor' | 'userTextColor' | 'characterBubbleColor' | 'characterTextColor' | 'narrationBubbleColor' | 'narrationTextColor';
type RgbChannel = 'red' | 'green' | 'blue';
type RgbParts = Record<RgbChannel, number>;
type ConfirmTone = 'primary' | 'danger';
type ConfirmAction = () => Promise<void> | void;
type MemoryNumberField = 'summarizeEvery' | 'grandSummaryEvery' | 'grandSummaryHiddenStartFloor' | 'grandSummaryVisibleTailFloors' | 'autoMergeThreshold' | 'autoMergeBatchSize';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface MemoryTimelineItem {
  id: string;
  kind: 'summary';
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
  activeTab: PanelTab;
}>();

const store = useAppStore();
export type PanelTab = 'memory' | 'beauty' | 'profile' | 'other';

const activeTab = computed(() => props.activeTab);
const summarizing = ref(false);
const showManualSummary = ref(false);
const showMergePicker = ref(false);
const showUnmergePicker = ref(false);
const showStickerGroupPicker = ref(false);
const showAvatarEditor = ref(false);
const avatarEditorSource = ref('');
const backgroundImageUrlDraft = ref('');
const selectedMergeIds = ref<string[]>([]);
const draft = reactive<ConversationSettings>(normalizeConversationSettings(null, props.conversationId, 'online'));
const memoryNumberDraft = reactive<Record<MemoryNumberField, string>>({
  summarizeEvery: String(draft.memory.summarizeEvery),
  grandSummaryEvery: String(draft.memory.grandSummaryEvery),
  grandSummaryHiddenStartFloor: String(draft.memory.grandSummaryHiddenStartFloor),
  grandSummaryVisibleTailFloors: String(draft.memory.grandSummaryVisibleTailFloors),
  autoMergeThreshold: String(draft.memory.autoMergeThreshold),
  autoMergeBatchSize: String(draft.memory.autoMergeBatchSize)
});
const characterDraft = reactive<CharacterProfile>({ ...props.character, localWorldBookIds: [...props.character.localWorldBookIds] });
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
const timelineDisplayLimit = ref(80);
const memoryDisplayLimit = ref(40);
const totalMemoryTokens = ref<number | null>(null);
const totalMemoryTokenPending = ref(false);
let tokenEstimateTimer: number | undefined;
let tokenEstimateIdleId: number | undefined;
let tokenEstimateRun = 0;

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
    time: memory.createdAt,
    timeEnd: memory.updatedAt > memory.createdAt ? memory.updatedAt : undefined,
    timeLabel: formatTimelineRange(memory.createdAt, memory.updatedAt > memory.createdAt ? memory.updatedAt : undefined),
    eyebrow: `${memoryRangeLabel(memory)} · ${memoryMergeBadge(memory)}`,
    title: memory.isMergedSummary ? '合并大总结' : '分段总结',
    blocks: parseMemorySummaryBlocks(memory.summary),
    meta: [`${memory.tokenCount} tokens`, hiddenRangeLabel(memory)]
  }));
  return summaryItems
    .sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
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
  const hiddenRanges = getEffectiveHiddenFloorRanges(memories.value.flatMap((memory) => collectIncrementalGrandSummaries(memory)))
    .map((range) => `${range.start}-${range.end}楼`);
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
const characterDraftNickname = computed(() => characterDraft.nickname || 'new.friend');
const boundUser = computed(() => store.userById(props.character.boundUserId) ?? store.user ?? null);
const boundUserVisualProfile = computed(() => props.character.boundUserProfile);
const userAvatarPreview = computed(() => boundUserVisualProfile.value?.avatar || boundUser.value?.avatar || defaultProfileAvatar);
const userAvatarAlt = computed(() => boundUserVisualProfile.value?.nickname || boundUser.value?.nickname || boundUser.value?.name || '我');
const backgroundImageOptions = computed(() => draft.appearance.backgroundImages);
const localWorldBooks = computed(() => store.worldBooks.filter((book) => book.scope === 'local'));
const bubblePreviewStyle = computed(() => ({
  backgroundColor: draft.appearance.backgroundColor,
  backgroundImage: draft.appearance.backgroundImage ? `url(${draft.appearance.backgroundImage})` : 'none'
}));
const userBubblePreviewStyle = computed(() => ({
  background: draft.appearance.userBubbleColor,
  color: draft.appearance.userTextColor
}));
const characterBubblePreviewStyle = computed(() => ({
  background: draft.appearance.characterBubbleColor,
  color: draft.appearance.characterTextColor
}));
const narrationBubblePreviewStyle = computed(() => ({
  background: draft.appearance.narrationBubbleColor,
  color: draft.appearance.narrationTextColor
}));
const stickerGroupPickerRows = computed(() => store.sortedStickerGroups.map((group) => ({
  id: group.id,
  name: group.name
})));
const characterStickerBindingSummary = computed(() => {
  const groupIds = new Set(draft.characterStickerGroupIds);
  if (!groupIds.size) return '未选择';
  const names = stickerGroupPickerRows.value
    .filter((group) => groupIds.has(group.id))
    .map((group) => group.name);
  if (!names.length) return '未选择';
  return names.join('、');
});
const canManualSummarize = computed(() => {
  const start = Number(manualSummary.startFloor);
  const end = Number(manualSummary.endFloor);
  return Number.isFinite(start) && Number.isFinite(end) && start >= 1 && end >= start && end <= messageCount.value;
});
const tokenEstimateKey = computed(() => JSON.stringify({
  tab: activeTab.value,
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
  if (activeTab.value !== 'memory') {
    totalMemoryTokenPending.value = false;
    return;
  }
  totalMemoryTokenPending.value = true;
  const runId = tokenEstimateRun;
  const runEstimate = async () => {
    tokenEstimateTimer = undefined;
    tokenEstimateIdleId = undefined;
    if (runId !== tokenEstimateRun || activeTab.value !== 'memory') return;
    try {
      const tokenCount = await store.nextReplyTokenCountForConversationAsync(props.conversationId);
      if (runId !== tokenEstimateRun || activeTab.value !== 'memory') return;
      totalMemoryTokens.value = tokenCount;
    } catch {
      if (runId !== tokenEstimateRun || activeTab.value !== 'memory') return;
      totalMemoryTokens.value = null;
    } finally {
      if (runId === tokenEstimateRun && activeTab.value === 'memory') totalMemoryTokenPending.value = false;
    }
  };
  const idleWindow = typeof window !== 'undefined' ? window as IdleWindow : null;
  if (idleWindow?.requestIdleCallback) {
    tokenEstimateIdleId = idleWindow.requestIdleCallback(runEstimate, { timeout: 1200 });
    return;
  }
  tokenEstimateTimer = window.setTimeout(runEstimate, 160);
}

function showMoreTimelineItems() {
  timelineDisplayLimit.value += 80;
}

function showMoreMemories() {
  memoryDisplayLimit.value += 40;
}

watch(
  () => [props.conversationId, currentConversationSettings.value] as const,
  () => {
    Object.assign(draft, normalizeConversationSettings(currentConversationSettings.value, props.conversationId, 'online'));
    syncMemoryNumberDraft();
    showStickerGroupPicker.value = false;
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
  }
);

onBeforeUnmount(cancelScheduledTokenEstimate);

watch(
  mergeableMemories,
  (nextMemories) => {
    const availableIds = new Set(nextMemories.map((memory) => memory.id));
    selectedMergeIds.value = selectedMergeIds.value.filter((memoryId) => availableIds.has(memoryId));
  }
);

watch(
  () => props.character,
  (nextCharacter) => Object.assign(characterDraft, { ...nextCharacter, localWorldBookIds: [...nextCharacter.localWorldBookIds] }),
  { immediate: true, deep: true }
);

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

function clampRgbValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

function componentToHex(value: number) {
  return clampRgbValue(value).toString(16).padStart(2, '0');
}

function rgbToHex({ red, green, blue }: RgbParts) {
  return `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;
}

function rgbParts(color: string): RgbParts {
  const normalized = color.trim();
  const hexMatch = normalized.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (hexMatch) {
    return {
      red: Number.parseInt(hexMatch[1], 16),
      green: Number.parseInt(hexMatch[2], 16),
      blue: Number.parseInt(hexMatch[3], 16)
    };
  }

  const rgbMatch = normalized.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgbMatch) {
    return {
      red: clampRgbValue(Number(rgbMatch[1])),
      green: clampRgbValue(Number(rgbMatch[2])),
      blue: clampRgbValue(Number(rgbMatch[3]))
    };
  }

  return { red: 255, green: 255, blue: 255 };
}

function updateRgbColor(field: ColorField, channel: RgbChannel, event: Event) {
  const input = event.target as HTMLInputElement;
  const nextParts = {
    ...rgbParts(draft.appearance[field]),
    [channel]: clampRgbValue(Number(input.value))
  };
  draft.appearance[field] = rgbToHex(nextParts) as ChatAppearanceSettings[ColorField];
  saveDraft();
}

function updateAutoGenerateVoom(event: Event) {
  draft.autoGenerateVoom = (event.target as HTMLInputElement).checked;
  saveDraft();
}

function updateVoomFrequency(event: Event) {
  draft.voomFrequency = normalizeVoomFrequency((event.target as HTMLSelectElement).value, draft.voomFrequency);
  saveDraft();
}

function updateAutoGenerateTheater(event: Event) {
  draft.autoGenerateTheater = (event.target as HTMLInputElement).checked;
  saveDraft();
}

function updateTheaterFrequency(event: Event) {
  draft.theaterFrequency = normalizeVoomFrequency((event.target as HTMLSelectElement).value, draft.theaterFrequency);
  saveDraft();
}

function updateProactiveReplyEnabled(event: Event) {
  draft.proactiveReply.enabled = (event.target as HTMLInputElement).checked;
  saveDraft();
}

function updateProactiveReplyFrequency(event: Event) {
  draft.proactiveReply.frequency = normalizeVoomFrequency((event.target as HTMLSelectElement).value, draft.proactiveReply.frequency);
  saveDraft();
}

function updateOfflineInvitationEnabled(event: Event) {
  draft.offlineInvitationEnabled = (event.target as HTMLInputElement).checked;
  saveDraft();
}

function normalizeSelectedStickerGroupIds(groupIds: string[]) {
  const selectedIds = new Set(groupIds.map((groupId) => groupId.trim()).filter(Boolean));
  return store.sortedStickerGroups.map((group) => group.id).filter((groupId) => selectedIds.has(groupId));
}

function toggleStickerGroupPicker() {
  showStickerGroupPicker.value = !showStickerGroupPicker.value;
}

async function updateCharacterStickerGroup(groupId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const groupIds = new Set(draft.characterStickerGroupIds);
  if (checked) groupIds.add(groupId);
  else groupIds.delete(groupId);
  const nextSettings = normalizeConversationSettings({
    ...draft,
    conversationId: props.conversationId,
    characterStickerGroupIds: normalizeSelectedStickerGroupIds([...groupIds])
  }, props.conversationId, 'online');
  Object.assign(draft, nextSettings);
  await store.saveConversationSettings(nextSettings);
  Object.assign(draft, normalizeConversationSettings(store.settingsForConversation(props.conversationId), props.conversationId, 'online'));
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

function updateConfirmDialogOpen(open: boolean) {
  if (open) {
    confirmDialog.open = true;
    return;
  }
  closeConfirmDialog();
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
    message: `会调用总结模型，把选中的 ${stats.count} 条记忆整合成 ${rangeText} 的全文大总结。原条目会作为上一层来源保存在新大总结里。`,
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

function saveCharacterDraft() {
  void store.saveCharacter({ ...characterDraft, localWorldBookIds: [...characterDraft.localWorldBookIds] });
}

function toggleLocalWorldBook(bookId: string, event: Event) {
  const checked = event.target instanceof HTMLInputElement ? event.target.checked : false;
  const ids = new Set(characterDraft.localWorldBookIds);
  if (checked) ids.add(bookId);
  else ids.delete(bookId);
  characterDraft.localWorldBookIds = localWorldBooks.value.map((book) => book.id).filter((id) => ids.has(id));
  saveCharacterDraft();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function syncBackgroundImages(images: string[], activeImage = draft.appearance.backgroundImage) {
  const normalizedImages = [...new Set(images.map((image) => image.trim()).filter(Boolean))];
  draft.appearance.backgroundImages = normalizedImages;
  draft.appearance.backgroundImage = normalizedImages.includes(activeImage) ? activeImage : normalizedImages[0] ?? '';
  saveDraft();
}

function addBackgroundImages(images: string[]) {
  const nextImages = [...draft.appearance.backgroundImages, ...images];
  const activeImage = images[images.length - 1]?.trim() || draft.appearance.backgroundImage;
  syncBackgroundImages(nextImages, activeImage);
}

function addBackgroundImageFromUrl() {
  const image = backgroundImageUrlDraft.value.trim();
  if (!image) return;
  addBackgroundImages([image]);
  backgroundImageUrlDraft.value = '';
}

async function readAppearanceFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (!files.length) return;
  const images = (await Promise.all(files.map((file) => readFileAsDataUrl(file)))).filter(Boolean);
  if (images.length) addBackgroundImages(images);
  input.value = '';
}

function applyBackgroundImage(image: string) {
  if (!image.trim()) return;
  syncBackgroundImages(draft.appearance.backgroundImages, image.trim());
}

function removeBackgroundImage(image: string) {
  const nextImages = draft.appearance.backgroundImages.filter((item) => item !== image);
  syncBackgroundImages(nextImages, draft.appearance.backgroundImage === image ? nextImages[0] ?? '' : draft.appearance.backgroundImage);
}

async function readAvatarFile(event: Event) {
  const image = await readImageFileFromInput(event);
  if (!image) return;
  avatarEditorSource.value = image;
  showAvatarEditor.value = true;
}

function applyEditedAvatar(value: string) {
  characterDraft.avatar = value;
  saveCharacterDraft();
}
</script>

<style scoped>
.control-panel {
  position: relative;
  display: grid;
  gap: 14px;
}

.panel-section {
  display: grid;
  gap: 14px;
}

.memory-hero,
.profile-preview,
.upload-card,
.empty-note {
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.memory-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.memory-hero div {
  display: grid;
  gap: 4px;
}

.memory-hero span,
.memory-card p,
.empty-note,
.upload-card span,
.profile-preview span,
.switch-card span:not(.switch-track) {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.memory-hero strong {
  font-size: 22px;
}

.memory-hero p {
  margin: 0;
  color: #716d72;
  font-size: 12px;
  line-height: 1.5;
}

.memory-section-note,
.compact-field small,
.switch-card div span:not(.switch-track) {
  color: #777276;
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
}

.section-header .memory-section-note,
.record-header .memory-section-note {
  display: block;
  margin-top: 3px;
  max-width: 100%;
  text-transform: none;
}

.manual-summary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #181717, #4a443f);
  color: #fffaf4;
  font-size: 13px;
  font-weight: 900;
  box-shadow: 0 12px 28px rgba(34, 27, 23, 0.22);
}

.manual-summary-button:disabled {
  opacity: 0.55;
}

.manual-summary-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(255, 235, 203, 0.9), transparent 38%),
    rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 46px rgba(73, 57, 43, 0.12);
}

.range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.manual-summary-card p {
  margin: 0;
  color: #7a7473;
  font-size: 12px;
  line-height: 1.5;
}

.manual-summary-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background: #22201e;
  color: #ffffff;
  font-weight: 900;
}

.summary-submit:disabled {
  background: #c9c2bb;
  color: #fffaf4;
}

.memory-strategy-stack {
  display: grid;
  gap: 12px;
}

.strategy-group {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.52);
  box-shadow: inset 0 0 0 1px rgba(36, 32, 29, 0.03);
}

.strategy-copy {
  display: grid;
  gap: 4px;
}

.strategy-copy span {
  color: #a7774f;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.strategy-copy strong {
  color: #24201e;
  font-size: 15px;
  font-weight: 950;
}

.strategy-copy small {
  color: #777276;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.55;
}

.memory-toggle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.strategy-control-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.strategy-wide-control {
  grid-column: 1 / -1;
}

.memory-run-action {
  min-height: 54px;
  border-radius: 18px;
  white-space: normal;
}

.memory-timeline-block {
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

.list-more-action {
  min-height: 42px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  color: #326743;
  font-size: 12px;
  font-weight: 950;
  box-shadow: inset 0 0 0 1px rgba(31, 107, 58, 0.08);
}

.memory-timeline-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  min-width: 0;
}

.memory-timeline-row time {
  justify-self: start;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(6, 199, 85, 0.08);
  color: #326743;
  font-size: 8px;
  font-weight: 900;
  line-height: 1.25;
  text-align: left;
}

.timeline-dot {
  display: none;
}

.timeline-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  border-radius: 11px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(249, 252, 250, 0.86)),
    rgba(255, 255, 255, 0.82);
}

.timeline-copy > span {
  color: #6d8a73;
  font-size: 8px;
  font-weight: 950;
  line-height: 1.2;
}

.timeline-copy strong {
  color: #171717;
  font-size: 11px;
  font-weight: 950;
  line-height: 1.25;
}

.timeline-summary-display {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.timeline-summary-heading {
  margin: 1px 0 0;
  color: #171717;
  font-size: 10px;
  font-weight: 950;
  line-height: 1.3;
}

.timeline-summary-field {
  display: grid;
  gap: 3px;
  padding: 6px;
  border-radius: 9px;
  background: rgba(237, 242, 239, 0.82);
}

.timeline-summary-event {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(6, 199, 85, 0.14);
  border-radius: 11px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(247, 252, 249, 0.78)),
    rgba(255, 255, 255, 0.82);
  box-shadow: inset 3px 0 0 rgba(6, 199, 85, 0.34);
}

.timeline-summary-event header {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.timeline-summary-event header span {
  color: #4f785d;
  font-size: 8px;
  font-weight: 950;
  line-height: 1;
}

.timeline-summary-event header strong {
  color: #171717;
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
  color: #326743;
  font-size: 9px;
  font-weight: 950;
  line-height: 1.2;
}

.timeline-summary-event dd {
  margin: -2px 0 0;
  color: #303636;
  font-size: 10px;
  font-weight: 720;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.timeline-summary-field span {
  color: #4f785d;
  font-size: 8px;
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
}

.timeline-summary-field p,
.timeline-summary-paragraph,
.timeline-summary-list {
  margin: 0;
  color: #5f666b;
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
  border: 1px solid rgba(20, 24, 22, 0.06);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.82);
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
  border-bottom: 1px solid rgba(20, 24, 22, 0.06);
  text-align: left;
  vertical-align: top;
}

.timeline-profile-table-shell th {
  color: #326743;
  font-weight: 950;
  white-space: nowrap;
}

.timeline-profile-table-shell td {
  color: #303636;
  font-weight: 700;
}

.timeline-graph-card {
  overflow: hidden;
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 35%, rgba(6, 199, 85, 0.11), transparent 44%),
    #f7faf8;
}

.timeline-graph-card svg {
  display: block;
  width: 100%;
  height: 150px;
}

.timeline-graph-card marker path {
  fill: #6d8a73;
}

.graph-edges line {
  stroke: rgba(66, 99, 77, 0.42);
  stroke-width: 1.4;
}

.graph-edges text {
  fill: #5f7366;
  font-size: 8px;
  font-weight: 850;
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgba(247, 250, 248, 0.92);
  stroke-width: 4px;
}

.graph-node rect {
  fill: rgba(255, 255, 255, 0.94);
  stroke: rgba(6, 199, 85, 0.18);
  stroke-width: 1;
}

.graph-node text {
  fill: #171717;
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
  background: #202421;
  color: #f7fff9;
  font-size: 9px;
  line-height: 1.38;
  white-space: pre;
}

.timeline-summary-code span {
  color: #b9d8c2;
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
  background: rgba(6, 199, 85, 0.08);
  color: #277044;
  font-style: normal;
  font-size: 8px;
  font-weight: 900;
  line-height: 1;
}

.memory-timeline-row.is-archived .timeline-copy {
  background: rgba(244, 246, 245, 0.72);
  opacity: 0.82;
}

.compact-field {
  justify-content: center;
  min-height: 74px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.compact-field input {
  min-height: 32px;
  border-radius: 12px;
}

.switch-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.memory-strategy-block .switch-card,
.memory-strategy-block .compact-field,
.memory-strategy-block .memory-run-action {
  min-height: 62px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
}

.memory-strategy-block .switch-card {
  align-items: start;
}

.switch-card.wide {
  grid-template-columns: auto minmax(0, 1fr);
}

.switch-card.compact-switch {
  min-height: 34px;
  padding: 8px 10px;
  border-radius: 12px;
}

.compact-switch .switch-track {
  width: 38px;
  height: 22px;
}

.compact-switch .switch-track::after {
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
}

.compact-switch input:checked + .switch-track::after {
  transform: translateX(16px);
}

.switch-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: #d8d2cf;
  transition: background 0.18s ease;
}

.switch-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 3px 8px rgba(42, 35, 31, 0.2);
  transition: transform 0.18s ease;
}

.switch-card input:checked + .switch-track {
  background: #24211f;
}

.switch-card input:checked + .switch-track::after {
  transform: translateX(18px);
}

.switch-card div {
  display: grid;
  gap: 3px;
}

.switch-card strong {
  font-size: 13px;
}

.sticker-bind-trigger {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  color: #24201e;
  text-align: left;
}

.sticker-bind-trigger span {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.sticker-bind-trigger strong,
.sticker-bind-trigger small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticker-bind-trigger strong {
  font-size: 13px;
  font-weight: 900;
}

.sticker-bind-trigger small {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.sticker-bind-trigger svg {
  flex: 0 0 auto;
  color: #4f4844;
}

.sticker-group-popover {
  display: grid;
  gap: 4px;
  padding: 6px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: inset 0 0 0 1px rgba(36, 32, 29, 0.06);
}

.sticker-group-option {
  grid-template-columns: auto minmax(0, 1fr);
  color: #28231f;
  font-weight: 800;
}

.sticker-group-option:active {
  background: rgba(36, 32, 29, 0.06);
}

.sticker-group-name {
  min-width: 0;
  overflow: hidden;
  color: #28231f;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-awareness-note {
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}

.model-picker-field {
  display: grid;
  gap: 9px;
}

.model-picker-field > span {
  color: #686b70;
  font-size: 12px;
  font-weight: 800;
}

.model-select-field select {
  width: 100%;
  min-height: 42px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
  color: #24201e;
  font-weight: 800;
}

.model-select-shell {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 5px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
}

.model-select-shell img {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--soft);
}

.model-select-vendor {
  max-width: 86px;
  overflow: hidden;
  color: #5f5a56;
  font-size: 12px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-select-shell select:not(.with-provider) {
  grid-column: 1 / -1;
}

.model-default,
.model-choice {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid rgba(36, 32, 29, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.68);
  color: #34302d;
  font-size: 12px;
  font-weight: 800;
}

.model-default.active,
.model-choice.active {
  border-color: rgba(28, 26, 24, 0.82);
  background: #1e1c1a;
  color: #ffffff;
}

.provider-model-list {
  display: grid;
  gap: 10px;
}

.provider-model-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.68);
}

.provider-model-card header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-model-card img {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--soft);
}

.provider-model-card strong {
  font-size: 13px;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.appearance-tools-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.appearance-tool-card {
  min-width: 0;
  min-height: 82px;
  justify-content: start;
  padding: 10px;
}

.appearance-tool-card input {
  min-width: 0;
}

.appearance-upload-card {
  position: relative;
  cursor: pointer;
}

.appearance-upload-card input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.appearance-color-field input[type='color'] {
  width: 100%;
  min-height: 32px;
  padding: 3px;
}

.profile-avatar-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.profile-avatar-grid .field,
.profile-avatar-grid .upload-card {
  min-width: 0;
}

.profile-avatar-grid .upload-card {
  padding: 10px;
}

.profile-avatar-grid input {
  min-width: 0;
}

.memory-records {
  display: grid;
  gap: 10px;
}

.memory-records > header,
.memory-card-head,
.memory-actions,
.profile-preview {
  display: flex;
  align-items: center;
}

.memory-records > header,
.memory-card-head {
  justify-content: space-between;
  gap: 10px;
}

.memory-records > header span,
.memory-card-head span {
  color: var(--muted);
  font-size: 12px;
}

.merge-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.merge-picker {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.68);
}

.merge-row {
  grid-template-columns: auto minmax(0, 1fr);
  background: rgba(244, 242, 242, 0.82);
  color: #302c29;
  font-size: 12px;
  font-weight: 800;
}

.merge-row span:not(.switch-track) {
  color: #302c29;
}

.button-row {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 10px;
}

.memory-card {
  display: grid;
  gap: 9px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.8);
}

.memory-card p {
  margin: 0;
}

.memory-card textarea {
  min-height: 96px;
  padding: 10px;
  border: 0;
  border-radius: 12px;
  outline: 0;
  background: #f4f2f2;
  resize: vertical;
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
  color: #746f70;
  font-size: 11px;
  font-weight: 850;
}

.memory-hidden-editor input {
  width: 100%;
  min-height: 34px;
  border-radius: 10px;
}

.memory-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  flex-wrap: wrap;
  gap: 8px;
}

.danger-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  background: rgba(239, 68, 90, 0.12);
  color: var(--danger);
  font-weight: 800;
}

.upload-card {
  display: grid;
  gap: 5px;
  padding: 12px;
}

.upload-card input {
  min-height: 34px;
}

.profile-preview {
  gap: 10px;
  padding: 12px;
}

.profile-preview div {
  display: grid;
  gap: 3px;
}

.empty-note {
  padding: 12px;
}

.control-panel {
  gap: 16px;
  color: #171717;
}

.panel-section {
  gap: 12px;
}

.settings-block {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(19, 24, 22, 0.06);
  border-radius: 20px;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 248, 0.9)),
    radial-gradient(circle at top right, rgba(6, 199, 85, 0.09), transparent 34%);
  box-shadow: 0 14px 34px rgba(16, 24, 20, 0.07);
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-header div {
  display: grid;
  gap: 2px;
}

.section-header span {
  color: #8a8f94;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-header strong {
  color: #161616;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0;
}

.compact-header strong {
  font-size: 14px;
}

.memory-hero,
.profile-preview {
  padding: 18px;
  border: 1px solid rgba(19, 24, 22, 0.05);
  border-radius: 24px;
  background:
    radial-gradient(circle at 92% 4%, rgba(6, 199, 85, 0.16), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 248, 0.92));
  box-shadow: 0 18px 42px rgba(18, 25, 22, 0.08);
}

.memory-hero {
  align-items: flex-start;
  min-height: 118px;
}

.memory-hero span,
.profile-preview span {
  color: #8a8f94;
  font-size: 12px;
  font-weight: 700;
}

.memory-hero strong {
  color: #0f1111;
  font-size: 28px;
  line-height: 1;
  letter-spacing: 0;
}

.memory-hero p {
  max-width: 210px;
  color: #74797d;
  font-size: 12px;
}

.manual-summary-button,
.summary-submit {
  min-height: 40px;
  border-radius: 14px;
  background: #171717;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(17, 17, 17, 0.18);
}

.manual-summary-button {
  flex: 0 0 auto;
  padding: 0 16px;
}

.manual-summary-button:active,
.summary-submit:active {
  transform: translateY(1px);
}

.manual-summary-card {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(251, 248, 245, 0.92)),
    radial-gradient(circle at top right, rgba(240, 168, 123, 0.16), transparent 34%);
}

.manual-summary-card p {
  color: #797d82;
}

.memory-toggle-grid,
.display-options-grid {
  gap: 9px;
}

.switch-card,
.compact-field,
.sticker-bind-trigger,
.field input,
.field textarea,
.field select,
.upload-card,
.time-awareness-note,
.empty-note,
.memory-card,
.merge-picker {
  border: 1px solid rgba(20, 24, 22, 0.05);
  border-radius: 16px;
  background: #f6f7f7;
  box-shadow: none;
}

.switch-card {
  min-height: 58px;
  padding: 12px;
}

.switch-card strong,
.sticker-bind-trigger strong {
  color: #171717;
  font-size: 14px;
  font-weight: 900;
}

.switch-card span:not(.switch-track),
.sticker-bind-trigger small,
.time-awareness-note,
.empty-note {
  color: #85898e;
  font-size: 12px;
}

.switch-track {
  width: 46px;
  height: 28px;
  background: #dedad7;
}

.switch-track::after {
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
}

.switch-card input:checked + .switch-track {
  background: #171717;
}

.switch-card input:checked + .switch-track::after {
  transform: translateX(18px);
}

.compact-switch .switch-track {
  width: 38px;
  height: 22px;
}

.compact-switch .switch-track::after {
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
}

.compact-switch input:checked + .switch-track::after {
  transform: translateX(16px);
}

.compact-field {
  min-height: 76px;
  justify-content: center;
}

.field > span {
  color: #767b81;
  font-size: 12px;
  font-weight: 800;
}

.field input,
.field textarea,
.field select {
  min-height: 42px;
  padding: 10px 12px;
  color: #171717;
  font-weight: 700;
}

.field textarea {
  min-height: 112px;
  line-height: 1.55;
}

.model-select-shell {
  min-height: 48px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  background: #f6f7f7;
}

.model-select-field select {
  background: transparent;
}

.record-header em {
  align-self: center;
  color: #898e93;
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
}

.merge-actions,
.manual-summary-actions,
.memory-actions {
  gap: 8px;
}

.secondary-action,
.danger-action {
  min-height: 40px;
  border-radius: 14px;
  font-weight: 900;
}

.secondary-action {
  background: #eef0f1;
  color: #171717;
}

.secondary-action:disabled,
.summary-submit:disabled {
  background: #ece9e7;
  color: #aba7a4;
  box-shadow: none;
}

.danger-action {
  background: rgba(239, 68, 90, 0.11);
}

.memory-card {
  gap: 10px;
  padding: 12px;
}

.memory-card textarea {
  min-height: 104px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  background: #ffffff;
}

.appearance-tools-grid,
.color-grid,
.profile-avatar-grid {
  gap: 9px;
}

.appearance-tool-card,
.color-card,
.profile-avatar-grid .field,
.profile-avatar-grid .upload-card {
  min-height: 88px;
}

.appearance-tool-card,
.color-card {
  padding: 12px;
}

.color-card input[type='color'],
.appearance-color-field input[type='color'] {
  min-height: 38px;
  padding: 4px;
  border-radius: 12px;
  background: #ffffff;
}

.upload-card {
  position: relative;
  align-content: center;
  gap: 4px;
  padding: 12px;
  cursor: pointer;
}

.upload-card strong {
  color: #171717;
  font-size: 14px;
  font-weight: 900;
}

.upload-card input[type='file'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  opacity: 0;
  cursor: pointer;
}

.profile-preview {
  gap: 14px;
}

.profile-preview .avatar {
  width: 60px;
  height: 60px;
  border: 3px solid #ffffff;
  box-shadow: 0 10px 24px rgba(18, 25, 22, 0.12);
}

.profile-preview strong {
  color: #171717;
  font-size: 17px;
  font-weight: 900;
}

.sticker-bind-trigger {
  min-height: 56px;
  padding: 12px;
}

.sticker-group-popover {
  gap: 7px;
  padding: 8px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  background: #ffffff;
}

.time-awareness-note {
  padding: 12px;
  line-height: 1.55;
}

.control-panel button,
.setting-action-button,
.secondary-action,
.danger-action,
.summary-submit,
.manual-summary-button,
.sticker-bind-trigger,
.background-thumb-actions button {
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, opacity 0.16s ease;
}

.control-panel button:active,
.setting-action-button:active,
.secondary-action:active,
.danger-action:active,
.summary-submit:active,
.manual-summary-button:active,
.sticker-bind-trigger:active,
.background-thumb-actions button:active {
  transform: translateY(1px);
}

.manual-summary-button,
.summary-submit,
.setting-action-button,
.secondary-action,
.danger-action,
.background-thumb-actions button {
  min-height: 42px;
  border-radius: 13px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
}

.manual-summary-button,
.summary-submit,
.primary-setting-action {
  background: linear-gradient(145deg, #181818, #31302d);
  color: #ffffff;
  box-shadow: 0 12px 22px rgba(22, 22, 22, 0.16);
}

.secondary-action,
.background-thumb-actions button:first-child {
  background: #edf1ef;
  color: #171717;
  box-shadow: inset 0 0 0 1px rgba(23, 23, 23, 0.04);
}

.danger-action,
.background-thumb-actions button:last-child {
  background: rgba(239, 68, 90, 0.1);
  color: #d73850;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.08);
}

.secondary-action:disabled,
.summary-submit:disabled,
.background-thumb-actions button:disabled {
  transform: none;
  background: #ebe8e5;
  color: #aaa5a0;
  box-shadow: none;
  cursor: default;
}

.memory-records {
  gap: 12px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 249, 0.9)),
    radial-gradient(circle at 12% 0%, rgba(6, 199, 85, 0.09), transparent 32%);
}

.memory-card {
  position: relative;
  gap: 12px;
  padding: 15px 14px 14px 18px;
  border: 1px solid rgba(50, 43, 35, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(90deg, rgba(224, 217, 205, 0.58) 0 8px, transparent 8px),
    linear-gradient(180deg, #fffdf9 0%, #fbfaf6 100%);
  box-shadow: 0 16px 28px rgba(36, 30, 24, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.memory-card::after {
  content: '';
  position: absolute;
  inset: 14px 12px 14px auto;
  width: 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(77, 67, 55, 0.05));
  pointer-events: none;
}

.memory-card-head {
  align-items: flex-start;
}

.memory-card-head div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.memory-card-head span {
  color: #9b8f82;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.memory-card-head strong {
  color: #221f1c;
  font-size: 15px;
  font-weight: 900;
}

.memory-card-head em {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef8f1;
  color: #1f6b3a;
  font-style: normal;
  font-size: 10px;
  font-weight: 900;
}

.memory-card textarea {
  min-height: 178px;
  padding: 14px 14px 14px 16px;
  border: 1px solid rgba(84, 74, 62, 0.08);
  border-radius: 14px;
  background:
    repeating-linear-gradient(180deg, transparent 0 27px, rgba(70, 60, 48, 0.045) 28px),
    rgba(255, 255, 255, 0.72);
  color: #2a2723;
  font-size: 13px;
  line-height: 1.85;
}

.memory-empty-note {
  min-height: 96px;
  display: grid;
  place-items: center;
  text-align: center;
  background:
    linear-gradient(90deg, rgba(224, 217, 205, 0.44) 0 8px, transparent 8px),
    #fffdf9;
  color: #8b847d;
}

.background-manager {
  display: grid;
  gap: 10px;
}

.background-url-card,
.background-upload-card,
.background-color-card {
  min-height: 84px;
  padding: 12px;
  border: 1px solid rgba(20, 24, 22, 0.05);
  border-radius: 16px;
  background: #f6f8f7;
}

.inline-input-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.inline-input-action input {
  min-width: 0;
}

.setting-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  padding: 0 12px;
}

.background-color-card input[type='color'] {
  width: 100%;
  min-height: 42px;
  padding: 5px;
  border-radius: 13px;
  background: #ffffff;
}

.background-library {
  display: grid;
  gap: 10px;
}

.background-thumb-card {
  display: grid;
  gap: 8px;
  padding: 9px;
  border: 1px solid rgba(20, 24, 22, 0.06);
  border-radius: 18px;
  background: #ffffff;
}

.background-thumb-card.active {
  border-color: rgba(6, 199, 85, 0.36);
  box-shadow: 0 12px 24px rgba(6, 199, 85, 0.09);
}

.background-thumb {
  position: relative;
  display: grid;
  align-items: end;
  width: 100%;
  min-height: 118px;
  padding: 10px;
  border-radius: 14px;
  overflow: hidden;
  background-color: #eef1ef;
  background-position: center;
  background-size: cover;
  color: #ffffff;
  text-align: left;
}

.background-thumb::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 28%, rgba(0, 0, 0, 0.35));
}

.background-thumb span {
  position: relative;
  width: fit-content;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.72);
  font-size: 11px;
  font-weight: 900;
}

.background-thumb-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.background-thumb-actions button {
  min-height: 36px;
}

.compact-empty-note {
  min-height: 72px;
  display: grid;
  place-items: center;
  text-align: center;
}

.bubble-preview {
  display: grid;
  gap: 10px;
  min-height: 154px;
  padding: 14px;
  border: 1px solid rgba(20, 24, 22, 0.06);
  border-radius: 18px;
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 999px rgba(255, 255, 255, 0.26);
}

.preview-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.user-preview-row {
  justify-content: flex-end;
}

.narration-preview-row {
  justify-content: center;
}

.preview-bubble {
  max-width: 76%;
  padding: 9px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.character-preview-row .preview-bubble {
  border-bottom-left-radius: 6px;
}

.user-preview-row .preview-bubble {
  border-bottom-right-radius: 6px;
}

.narration-preview-bubble {
  font-style: italic;
}

.rgb-input-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.rgb-input-row input {
  min-width: 0;
  min-height: 32px;
  padding: 0 4px;
  border-radius: 10px;
  text-align: center;
}

.beauty-panel .bubble-color-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 8px;
}

.beauty-panel .bubble-color-grid .color-card {
  gap: 7px;
  min-height: 0;
  padding: 10px;
  overflow: hidden;
  border-radius: 16px;
}

.beauty-panel .bubble-color-grid .color-card > span {
  overflow: hidden;
  color: #626d68;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beauty-panel .bubble-color-grid .color-card input[type='color'] {
  min-height: 30px;
  height: 30px;
  padding: 3px;
  border-radius: 10px;
}

.beauty-panel .bubble-color-grid .rgb-input-row {
  gap: 4px;
}

.beauty-panel .bubble-color-grid .rgb-input-row input {
  min-height: 30px;
  padding: 0 1px;
  font-size: 11px;
  font-weight: 800;
  appearance: textfield;
}

.beauty-panel .bubble-color-grid .rgb-input-row input::-webkit-inner-spin-button,
.beauty-panel .bubble-color-grid .rgb-input-row input::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.display-options-grid {
  grid-template-columns: 1fr;
}

.display-options-grid .switch-card {
  min-height: 58px;
}

.wide-field {
  min-width: 0;
}

.profile-section,
.local-book-bind {
  border: 1px solid rgba(17, 17, 17, 0.04);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 14px 36px rgba(21, 30, 26, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.profile-section {
  display: grid;
  grid-template-columns: clamp(82px, 25vw, 104px) minmax(0, 1fr);
  gap: clamp(10px, 3vw, 14px);
  align-items: center;
  min-width: 0;
  padding: clamp(12px, 3.5vw, 14px);
  border-radius: 24px;
}

.avatar-card {
  align-self: center;
  display: grid;
  justify-items: center;
  gap: 10px;
  min-width: 0;
}

.avatar-preview {
  width: clamp(70px, 21vw, 88px);
  height: clamp(70px, 21vw, 88px);
  border-radius: clamp(20px, 6vw, 26px);
  background: #eef3f1;
  object-fit: cover;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.05), 0 12px 26px rgba(26, 33, 30, 0.08);
}

.avatar-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  max-width: 100%;
  padding: 0 clamp(10px, 2.8vw, 12px);
  border: 1px solid rgba(6, 199, 85, 0.16);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(232, 249, 239, 0.98), rgba(255, 242, 247, 0.96));
  color: #16643e;
  font-size: 11px;
  font-weight: 850;
  white-space: nowrap;
  box-shadow: 0 10px 20px rgba(31, 120, 74, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  touch-action: manipulation;
}

.avatar-upload input {
  display: none;
}

.profile-fields {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.identity-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(8px, 2.5vw, 10px);
  min-width: 0;
}

.note-field {
  grid-column: 1 / -1;
}

.profile-section .compact-field {
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.profile-section .compact-field input {
  min-height: 44px;
  padding: 11px 12px;
  border-radius: 16px;
}

.profile-panel > .field textarea {
  min-height: 168px;
}

.local-book-bind {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
}

.local-book-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.local-book-header strong {
  color: #30363a;
  font-size: 13px;
}

.local-book-header > span,
.local-book-empty {
  color: #69736f;
  font-size: 11px;
  font-weight: 850;
}

.local-book-list {
  display: grid;
  gap: 10px;
  max-height: calc(58px * 4 + 10px * 3);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.local-book-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 58px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  color: #151719;
  font-size: 13px;
  font-weight: 850;
  box-shadow: 0 8px 18px rgba(30, 55, 45, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
  touch-action: manipulation;
}

.local-book-row.selected {
  border-color: rgba(6, 199, 85, 0.34);
  background: #f7fffa;
  color: #146b3f;
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.12), 0 8px 18px rgba(30, 55, 45, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.local-book-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.book-check {
  position: relative;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(21, 23, 25, 0.05);
  box-shadow: inset 0 0 0 1px rgba(21, 23, 25, 0.1);
}

.book-check::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 3px;
  width: 5px;
  height: 9px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  opacity: 0;
  transform: rotate(45deg) scale(0.7);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.local-book-row.selected .book-check {
  background: var(--link-green);
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.7), 0 6px 14px rgba(6, 199, 85, 0.22);
}

.local-book-row.selected .book-check::after {
  opacity: 1;
  transform: rotate(45deg) scale(1);
}

.local-book-row span:first-of-type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-book-empty {
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 360px) {
  .memory-toggle-grid,
  .range-grid,
  .color-grid,
  .local-book-list,
  .profile-avatar-stack {
    grid-template-columns: 1fr;
  }

  .beauty-panel .bubble-color-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .beauty-panel .bubble-color-grid .color-card {
    gap: 6px;
    padding: 8px;
    border-radius: 14px;
  }

  .beauty-panel .bubble-color-grid .rgb-input-row {
    gap: 3px;
  }

  .beauty-panel .bubble-color-grid .rgb-input-row input {
    min-height: 28px;
    font-size: 10px;
  }

  .appearance-tools-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.control-panel {
  gap: 14px;
  min-width: 0;
  color: #151719;
  font-size: 12px;
}

.control-panel *,
.control-panel *::before,
.control-panel *::after {
  min-width: 0;
}

.panel-section {
  gap: 14px;
  min-width: 0;
}

.settings-block,
.memory-hero,
.profile-preview,
.manual-summary-card,
.memory-records {
  border: 1px solid rgba(17, 17, 17, 0.04);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 14px 36px rgba(21, 30, 26, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.settings-block,
.manual-summary-card,
.memory-records {
  display: grid;
  gap: 14px;
  padding: 14px;
}

.section-header {
  align-items: flex-start;
  gap: 10px;
}

.section-header div {
  gap: 4px;
}

.section-header span,
.memory-card-head span {
  color: #8a8f94;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-transform: uppercase;
}

.section-header strong {
  color: #151719;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.15;
}

.memory-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  min-height: 118px;
  padding: 18px;
  background:
    radial-gradient(circle at 94% 6%, rgba(6, 199, 85, 0.14), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 248, 0.92));
}

.memory-hero div {
  gap: 6px;
}

.memory-hero span,
.profile-preview span,
.upload-card span,
.empty-note,
.switch-card span:not(.switch-track) {
  color: #747b80;
  font-size: 12px;
  line-height: 1.45;
}

.memory-hero span,
.profile-preview span {
  font-weight: 800;
}

.memory-hero strong {
  color: #0f1111;
  font-size: 30px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
}

.memory-hero p {
  max-width: 100%;
  margin: 0;
  color: #747b80;
  font-size: 12px;
  line-height: 1.45;
}

.field,
.profile-avatar-stack {
  display: grid;
  gap: 8px;
}

.field > span {
  max-width: 100%;
  overflow: hidden;
  color: #4c5357;
  font-size: 11px;
  font-weight: 850;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field input,
.field textarea,
.field select,
.model-select-shell,
.sticker-bind-trigger,
.switch-card,
.compact-field,
.upload-card,
.time-awareness-note,
.empty-note,
.merge-picker,
.memory-card,
.background-url-card,
.background-upload-card,
.background-color-card,
.background-thumb-card,
.bubble-preview {
  border: 1px solid rgba(42, 75, 60, 0.08);
  border-radius: 16px;
  background: rgba(250, 252, 250, 0.96);
  box-shadow: 0 8px 18px rgba(30, 55, 45, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.field input,
.field textarea,
.field select {
  width: 100%;
  min-height: 44px;
  padding: 11px 12px;
  color: #151719;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.4;
}

.field textarea {
  min-height: 132px;
  max-width: 100%;
  resize: vertical;
}

.field input::placeholder,
.field textarea::placeholder {
  color: #a3a9ad;
}

.field:focus-within > span {
  color: #17191b;
}

.field:focus-within input,
.field:focus-within textarea,
.field:focus-within select,
.model-select-shell:focus-within {
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.35), 0 0 0 3px rgba(6, 199, 85, 0.1);
}

.memory-toggle-grid,
.range-grid,
.color-grid,
.manual-summary-actions,
.merge-actions,
.memory-actions,
.background-thumb-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.switch-card,
.compact-field {
  min-height: 66px;
  padding: 12px;
}

.switch-card {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  touch-action: manipulation;
}

.switch-card div {
  gap: 3px;
}

.switch-card strong,
.sticker-bind-trigger strong,
.upload-card strong {
  max-width: 100%;
  overflow: hidden;
  color: #151719;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.switch-track {
  flex: 0 0 auto;
  width: 46px;
  height: 28px;
  background: #171717;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.08);
}

.switch-track::after {
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  box-shadow: 0 3px 8px rgba(42, 35, 31, 0.18);
}

.switch-card input:not(:checked) + .switch-track {
  background: #dedad7;
}

.switch-card input:checked + .switch-track::after {
  transform: translateX(18px);
}

.compact-switch {
  min-height: 42px;
  padding: 9px 10px;
  border-radius: 14px;
}

.compact-switch .switch-track {
  width: 38px;
  height: 22px;
}

.compact-switch .switch-track::after {
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
}

.compact-switch input:checked + .switch-track::after {
  transform: translateX(16px);
}

.compact-field {
  justify-content: center;
}

.compact-field input {
  min-height: 36px;
  padding: 8px 10px;
  border-radius: 13px;
}

.manual-summary-button,
.summary-submit,
.setting-action-button,
.secondary-action,
.danger-action,
.background-thumb-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 42px;
  padding: 0 12px;
  overflow: hidden;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.15;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  touch-action: manipulation;
}

.manual-summary-button,
.summary-submit,
.primary-setting-action {
  background: #171717;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(17, 17, 17, 0.16);
}

.secondary-action,
.background-thumb-actions button:first-child {
  background: #edf1ef;
  color: #171717;
  box-shadow: inset 0 0 0 1px rgba(23, 23, 23, 0.04);
}

.danger-action,
.background-thumb-actions button:last-child {
  background: rgba(239, 68, 90, 0.1);
  color: #d73850;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.08);
}

.manual-summary-button:disabled,
.summary-submit:disabled,
.secondary-action:disabled,
.danger-action:disabled,
.background-thumb-actions button:disabled {
  transform: none;
  background: #ebe8e5;
  color: #aaa5a0;
  box-shadow: none;
  cursor: default;
}

.manual-summary-card p,
.time-awareness-note,
.empty-note {
  margin: 0;
  color: #747b80;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
}

.model-select-shell {
  display: grid;
  align-items: center;
  gap: 8px;
  min-height: 50px;
  padding: 6px;
}

.model-select-shell {
  grid-template-columns: auto auto minmax(0, 1fr);
}

.model-select-shell select:not(.with-provider) {
  grid-column: 1 / -1;
}

.model-select-shell img {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  object-fit: cover;
}

.model-select-vendor {
  max-width: 76px;
  overflow: hidden;
  color: #5f6662;
  font-size: 11px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-select-field select,
.frequency-field select {
  min-width: 0;
  overflow: hidden;
  background: transparent;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-header em,
.memory-card-head em {
  flex: 0 0 auto;
  font-style: normal;
  white-space: nowrap;
}

.record-header em {
  color: #747b80;
  font-size: 12px;
  font-weight: 900;
}

.merge-picker {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.memory-card {
  position: relative;
  display: grid;
  gap: 12px;
  padding: 14px;
  background: #fffdf9;
}

.memory-card-head {
  align-items: flex-start;
}

.memory-card-head div {
  display: grid;
  gap: 3px;
}

.memory-card-head strong {
  color: #221f1c;
  font-size: 15px;
  font-weight: 900;
  line-height: 1.2;
}

.memory-card-head em {
  max-width: 44%;
  padding: 4px 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #eef8f1;
  color: #1f6b3a;
  font-size: 10px;
  font-weight: 900;
  text-overflow: ellipsis;
}

.memory-card textarea {
  min-height: 156px;
  padding: 13px;
  border: 1px solid rgba(84, 74, 62, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
  color: #2a2723;
  font-size: 13px;
  line-height: 1.7;
}

.memory-empty-note,
.compact-empty-note {
  display: grid;
  min-height: 92px;
  place-items: center;
  text-align: center;
}

.background-manager,
.background-library {
  display: grid;
  gap: 10px;
}

.background-url-card,
.background-upload-card,
.background-color-card,
.profile-avatar-stack .field,
.profile-avatar-stack .upload-card {
  min-height: 84px;
  padding: 12px;
}

.inline-input-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.setting-action-button {
  min-width: 64px;
}

.background-color-card input[type='color'],
.color-card input[type='color'],
.appearance-color-field input[type='color'] {
  width: 100%;
  min-height: 40px;
  padding: 4px;
  border-radius: 13px;
  background: #ffffff;
}

.background-thumb-card {
  display: grid;
  gap: 8px;
  padding: 9px;
}

.background-thumb-card.active {
  border-color: rgba(6, 199, 85, 0.32);
  background: linear-gradient(135deg, rgba(237, 252, 242, 0.98), rgba(255, 246, 249, 0.96));
  box-shadow: 0 10px 24px rgba(31, 120, 74, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.background-thumb {
  min-height: 118px;
  border-radius: 14px;
}

.background-thumb span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bubble-preview {
  display: grid;
  gap: 10px;
  min-height: 154px;
  padding: 14px;
  background-position: center;
  background-size: cover;
}

.preview-row {
  min-width: 0;
}

.preview-bubble {
  max-width: min(76%, 280px);
  overflow-wrap: anywhere;
}

.profile-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 16px;
}

.profile-preview .avatar {
  width: 62px;
  height: 62px;
  border: 3px solid #ffffff;
  border-radius: 20px;
  object-fit: cover;
  box-shadow: 0 10px 24px rgba(18, 25, 22, 0.12);
}

.profile-preview div {
  display: grid;
  gap: 4px;
}

.profile-preview strong {
  overflow: hidden;
  color: #151719;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-preview span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-card {
  position: relative;
  display: grid;
  align-content: center;
  gap: 5px;
  cursor: pointer;
}

.upload-card input[type='file'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  opacity: 0;
  cursor: pointer;
}

.sticker-bind-trigger {
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 58px;
  padding: 12px;
  overflow: hidden;
  text-align: left;
  white-space: nowrap;
  touch-action: manipulation;
}

.sticker-bind-trigger > span {
  display: grid;
  grid-template-columns: 1fr;
  gap: 3px;
}

.sticker-bind-trigger small,
.sticker-group-name {
  overflow: hidden;
  color: #747b80;
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticker-bind-trigger svg {
  flex: 0 0 auto;
}

.sticker-group-popover {
  display: grid;
  gap: 7px;
  padding: 8px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: inset 0 0 0 1px rgba(20, 24, 22, 0.05);
}

.sticker-group-option,
.merge-row {
  grid-template-columns: auto minmax(0, 1fr);
}

.time-awareness-note {
  padding: 12px;
}

@media (min-width: 520px) {
  .background-library {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 380px) {
  .settings-block,
  .manual-summary-card,
  .memory-records {
    padding: 12px;
    border-radius: 22px;
  }

  .memory-hero {
    padding: 16px;
  }

  .switch-card,
  .compact-field {
    min-height: 62px;
    padding: 10px;
  }

  .switch-card {
    gap: 8px;
  }

  .switch-card strong,
  .sticker-bind-trigger strong,
  .upload-card strong {
    font-size: 13px;
  }

  .manual-summary-button,
  .summary-submit,
  .setting-action-button,
  .secondary-action,
  .danger-action,
  .background-thumb-actions button {
    padding-inline: 10px;
  }
}

@media (max-width: 340px) {
  .memory-hero,
  .inline-input-action,
  .profile-preview {
    grid-template-columns: 1fr;
  }

  .manual-summary-button,
  .setting-action-button {
    width: 100%;
  }

  .memory-toggle-grid,
  .strategy-control-grid,
  .range-grid,
  .color-grid,
  .manual-summary-actions,
  .merge-actions,
  .memory-actions,
  .background-thumb-actions {
    grid-template-columns: 1fr;
  }

  .memory-card-head {
    display: grid;
    grid-template-columns: 1fr;
  }

  .memory-card-head em {
    max-width: 100%;
    width: fit-content;
  }
}

.settings-block,
.memory-hero,
.profile-preview,
.manual-summary-card,
.memory-records,
.switch-card,
.compact-field,
.upload-card,
.time-awareness-note,
.empty-note,
.merge-picker,
.memory-card,
.background-url-card,
.background-upload-card,
.background-color-card,
.background-thumb-card,
.bubble-preview,
.sticker-bind-trigger,
.sticker-group-popover {
  border-color: transparent;
}

.switch-card,
.compact-field,
.upload-card,
.time-awareness-note,
.empty-note,
.merge-picker,
.background-url-card,
.background-upload-card,
.background-color-card,
.background-thumb-card,
.sticker-bind-trigger,
.sticker-group-popover {
  background: rgba(248, 251, 249, 0.9);
  box-shadow: 0 10px 22px rgba(28, 55, 44, 0.035), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.model-select-shell {
  border-color: transparent;
  background: rgba(255, 255, 255, 0.95);
}

.manual-summary-button,
.summary-submit,
.primary-setting-action {
  border: 1px solid rgba(6, 199, 85, 0.18);
  background: linear-gradient(135deg, rgba(224, 249, 233, 0.98), rgba(255, 242, 247, 0.96));
  color: #16643e;
  box-shadow: 0 14px 28px rgba(31, 120, 74, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.secondary-action,
.background-thumb-actions button:first-child {
  border: 0;
  background: #edf8f1;
  color: #1f6b3a;
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.08);
}

.danger-action,
.background-thumb-actions button:last-child {
  border: 0;
  background: rgba(239, 68, 90, 0.09);
  color: #d73850;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.06);
}

.switch-track {
  background: #dceee4;
  box-shadow: inset 0 0 0 1px rgba(31, 107, 58, 0.08);
}

.switch-card input:not(:checked) + .switch-track {
  background: #dfe8e4;
}

.switch-card input:checked + .switch-track {
  background: linear-gradient(135deg, #62d98d, #06c755);
  box-shadow: 0 8px 16px rgba(6, 199, 85, 0.18), inset 0 0 0 1px rgba(6, 199, 85, 0.18);
}

.switch-track::after {
  background: #ffffff;
  box-shadow: 0 3px 8px rgba(31, 107, 58, 0.18);
}

.manual-summary-button:disabled,
.summary-submit:disabled,
.secondary-action:disabled,
.danger-action:disabled,
.background-thumb-actions button:disabled {
  background: rgba(239, 242, 240, 0.86);
  color: #a0aaa5;
  box-shadow: none;
}

.beauty-panel .background-manager {
  gap: 9px;
}

.beauty-panel .background-tool-panel {
  display: grid;
  grid-template-columns: 1fr;
  gap: 9px;
  align-items: stretch;
  min-width: 0;
}

.beauty-panel .background-quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  min-width: 0;
}

.beauty-panel .background-url-card,
.beauty-panel .background-upload-card,
.beauty-panel .background-color-card {
  min-height: 0;
  padding: 10px;
  border-radius: 16px;
  background: rgba(248, 251, 249, 0.92);
  box-shadow: 0 8px 18px rgba(28, 55, 44, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.beauty-panel .background-url-card {
  align-content: stretch;
  gap: 8px;
}

.beauty-panel .background-field-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.beauty-panel .background-field-title > span {
  min-width: 0;
  overflow: hidden;
  color: #626d68;
  font-size: 11px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beauty-panel .background-field-title .setting-action-button {
  flex: 0 0 28px;
  width: 28px;
  min-width: 28px;
  min-height: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #16643e;
  box-shadow: none;
}

.beauty-panel .background-field-title .setting-action-button svg {
  flex: 0 0 auto;
}

.beauty-panel .background-url-card > span,
.beauty-panel .background-color-card > span {
  color: #626d68;
  font-size: 11px;
  font-weight: 900;
}

.beauty-panel .inline-input-action {
  gap: 7px;
}

.beauty-panel .background-url-card > input,
.beauty-panel .inline-input-action input {
  min-height: 42px;
  border-radius: 14px;
  font-weight: 800;
}

.beauty-panel .setting-action-button {
  min-width: 56px;
  min-height: 42px;
  padding-inline: 12px;
  border-radius: 14px;
}

.beauty-panel .background-upload-card {
  align-content: center;
  gap: 2px;
  min-height: 54px;
}

.beauty-panel .background-upload-card strong {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beauty-panel .background-upload-card span {
  color: #78827d;
  font-size: 11px;
  font-weight: 800;
}

.beauty-panel .background-color-card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
  align-items: stretch;
  min-height: 54px;
}

.beauty-panel .background-color-select {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 0;
  height: 28px;
  padding: 4px 9px 4px 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: inset 0 0 0 1px rgba(42, 75, 60, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.beauty-panel .background-color-select input[type='color'] {
  width: 20px;
  min-width: 20px;
  min-height: 20px;
  height: 20px;
  padding: 3px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  box-shadow: none;
}

.beauty-panel .background-color-select span {
  min-width: 0;
  overflow: hidden;
  color: #626d68;
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beauty-panel .background-library {
  gap: 8px;
  max-height: min(306px, 42vh);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.beauty-panel .compact-empty-note {
  min-height: 58px;
  padding: 10px 12px;
  border-radius: 16px;
  color: #74807a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.45;
}

.beauty-panel .background-thumb-card {
  gap: 7px;
  padding: 8px;
  border-radius: 16px;
}

.beauty-panel .background-thumb {
  min-height: 86px;
  border-radius: 13px;
}

.beauty-panel .background-thumb-actions {
  gap: 7px;
}

.beauty-panel .background-thumb-actions button {
  min-height: 34px;
  border-radius: 12px;
}

.memory-merge-dashboard {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.memory-merge-dashboard span {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 10px;
  border-radius: 16px;
  background: rgba(248, 251, 249, 0.92);
  box-shadow: inset 0 0 0 1px rgba(31, 107, 58, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.memory-merge-dashboard strong {
  color: #17241d;
  font-size: 17px;
  font-weight: 950;
  line-height: 1;
}

.memory-merge-dashboard small,
.merge-row-copy small {
  min-width: 0;
  overflow: hidden;
  color: #738079;
  font-size: 11px;
  font-weight: 850;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-action {
  gap: 6px;
}

.icon-action svg {
  flex: 0 0 auto;
}

.memory-records .merge-picker-panel {
  gap: 9px;
  padding: 10px;
  border-radius: 18px;
  background: rgba(248, 251, 249, 0.94);
}

.merge-picker-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.merge-picker-head div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.merge-picker-head strong {
  color: #17241d;
  font-size: 13px;
  font-weight: 950;
}

.merge-picker-head span {
  min-width: 0;
  overflow: hidden;
  color: #718078;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tiny-action {
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(31, 107, 58, 0.08);
  color: #1f6b3a;
  font-size: 12px;
  font-weight: 900;
}

.tiny-action:disabled {
  color: #9aa39f;
  background: rgba(239, 242, 240, 0.78);
}

.memory-records .merge-row {
  min-height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: inset 0 0 0 1px rgba(31, 107, 58, 0.06);
}

.memory-records .merge-row.selected {
  background: rgba(232, 250, 239, 0.94);
  box-shadow: inset 0 0 0 1px rgba(6, 199, 85, 0.18), 0 8px 18px rgba(6, 199, 85, 0.08);
}

.merge-row-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.merge-row-copy strong {
  min-width: 0;
  overflow: hidden;
  color: #1d2922;
  font-size: 13px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memory-records .button-row {
  justify-content: flex-start;
  min-height: 52px;
  padding: 9px 10px;
  text-align: left;
}

.memory-confirm-card {
  display: grid;
  gap: 12px;
  padding: 4px;
}

.memory-confirm-card > span {
  color: #1f6b3a;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.memory-confirm-card h2,
.memory-confirm-card p {
  margin: 0;
}

.memory-confirm-card h2 {
  color: #17211c;
  font-size: 18px;
  font-weight: 950;
}

.memory-confirm-card p,
.memory-confirm-card li {
  color: #59645f;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.memory-confirm-card ul {
  display: grid;
  gap: 7px;
  max-height: min(32vh, 240px);
  overflow-y: auto;
  margin: 0;
  padding: 10px 12px 10px 26px;
  border-radius: 16px;
  background: rgba(248, 251, 249, 0.92);
  overscroll-behavior: contain;
}

.memory-confirm-card li {
  overflow-wrap: anywhere;
}

.memory-confirm-card-danger > span {
  color: #d73850;
}

.memory-confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.memory-confirm-actions.confirm-only {
  grid-template-columns: 1fr;
}

.memory-confirm-actions .danger-confirm {
  border-color: rgba(239, 68, 90, 0.14);
  background: rgba(239, 68, 90, 0.11);
  color: #d73850;
  box-shadow: inset 0 0 0 1px rgba(239, 68, 90, 0.08);
}

.memory-panel .switch-card strong,
.memory-panel .switch-card div span:not(.switch-track),
.memory-panel .compact-field > span,
.memory-panel .compact-field small,
.memory-panel .secondary-action,
.memory-panel .danger-action,
.memory-panel .summary-submit,
.memory-panel .manual-summary-button {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.memory-panel button,
.memory-panel .secondary-action,
.memory-panel .danger-action,
.memory-panel .summary-submit {
  min-height: 40px;
  height: auto;
  padding-block: 9px;
  line-height: 1.25;
}

@media (max-width: 360px) {
  .merge-picker-head {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 340px) {
  .memory-records > .merge-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .memory-records > .merge-actions .secondary-action {
    min-height: 38px;
    padding-inline: 6px;
    font-size: 11px;
  }
}

@media (max-width: 360px) {
  .beauty-panel .background-tool-panel {
    grid-template-columns: 1fr;
  }

  .beauty-panel .background-quick-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
