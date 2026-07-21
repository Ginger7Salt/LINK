<template>
  <section class="gobang-panel">
    <template v-if="!game">
      <header class="gobang-setup-hero">
        <span class="gobang-kicker">LINK PLAY · PRIVATE MATCH</span>
        <h2>和 {{ characterName }} 对弈</h2>
        <p>角色会读取当前线上会话，并通过真实 API 决定每一手。</p>
      </header>

      <fieldset class="gobang-options">
        <legend>谁先落子</legend>
        <div class="gobang-option-grid gobang-option-grid--starter">
          <button type="button" :class="{ active: starter === 'user' }" @click="starter = 'user'">
            <i class="gobang-option-stone gobang-option-stone--black"></i>
            <span><strong>我执黑</strong><small>你先落子</small></span>
          </button>
          <button type="button" :class="{ active: starter === 'char' }" @click="starter = 'char'">
            <i class="gobang-option-stone gobang-option-stone--white"></i>
            <span><strong>让 TA 先</strong><small>你执白棋</small></span>
          </button>
        </div>
      </fieldset>

      <button class="gobang-primary-action" type="button" :disabled="disabled" @click="emit('start', starter)">
        <span>摆好棋盘</span>
        <ArrowRight :size="15" />
      </button>
    </template>

    <template v-else>
      <header class="gobang-game-head">
        <div class="gobang-game-title">
          <span class="gobang-kicker">LINK PLAY · ROUND {{ roundNumber }}</span>
          <h2>{{ statusTitle }}</h2>
          <p>{{ statusDetail }}</p>
        </div>
        <span class="gobang-status-chip" :class="[`gobang-status-chip--${game.status}`, { 'gobang-status-chip--failed': apiFailure }]">{{ statusChip }}</span>
      </header>

      <div class="gobang-board-shell">
        <div class="gobang-board" role="grid" aria-label="十五路五子棋棋盘">
          <button
            v-for="point in boardPoints"
            :key="point.key"
            class="gobang-point"
            :class="point.classes"
            type="button"
            role="gridcell"
            :disabled="!canPlaceStone || Boolean(point.move)"
            :aria-label="point.ariaLabel"
            @click="emit('place', point.row, point.column)"
          >
            <i v-if="point.star" class="gobang-star" aria-hidden="true"></i>
            <span v-if="point.move" class="gobang-stone" :class="[`gobang-stone--${point.stone}`, { latest: point.latest }]">
              <i v-if="point.latest"></i>
            </span>
          </button>
        </div>
        <span v-if="isRequesting" class="gobang-thinking"><i></i><i></i><i></i>{{ characterName }} 正在看棋</span>
      </div>

      <section v-if="apiFailure" class="gobang-api-error" role="alert">
        <span><strong>角色没有完成这一手</strong><small>{{ apiErrorText }}</small></span>
        <button type="button" :disabled="disabled || isRequesting" @click="emit('retry')">重新调用 API</button>
      </section>

      <div class="gobang-actions">
        <template v-if="game.status === 'active'">
          <button type="button" :disabled="isRequesting || disabled || !canUndo" @click="emit('undo')">悔一步</button>
          <button class="gobang-danger-action" type="button" :disabled="isRequesting || disabled" @click="emit('resign')">认输</button>
        </template>
        <button v-else class="gobang-primary-action" type="button" :disabled="disabled" @click="emit('new-game')">
          <span>再来一局</span>
          <RotateCcw :size="14" />
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight, RotateCcw } from 'lucide-vue-next';
import type { ChatGobangAttachment, ChatGobangPlayer } from '@/types/domain';
import { canUndoGobangRound, gobangStoneForPlayer, GOBANG_BOARD_SIZE } from '@/utils/gobang';

const props = defineProps<{
  game: ChatGobangAttachment | null;
  characterName: string;
  userName: string;
  busy?: boolean;
  disabled?: boolean;
  roundNumber?: number;
}>();

const emit = defineEmits<{
  start: [starter: ChatGobangPlayer];
  place: [row: number, column: number];
  retry: [];
  undo: [];
  resign: [];
  'new-game': [];
}>();

const starter = ref<ChatGobangPlayer>('user');
const starKeys = new Set(['3:3', '3:11', '7:7', '11:3', '11:11']);

const moveMap = computed(() => new Map((props.game?.moves ?? []).map((move) => [`${move.row}:${move.column}`, move])));
const latestMove = computed(() => {
  const moves = props.game?.moves ?? [];
  return moves[moves.length - 1];
});
const boardPoints = computed(() => Array.from({ length: GOBANG_BOARD_SIZE * GOBANG_BOARD_SIZE }, (_, index) => {
  const row = Math.floor(index / GOBANG_BOARD_SIZE);
  const column = index % GOBANG_BOARD_SIZE;
  const key = `${row}:${column}`;
  const move = moveMap.value.get(key);
  const latest = latestMove.value?.row === row && latestMove.value.column === column;
  return {
    key,
    row,
    column,
    move,
    latest,
    star: starKeys.has(key),
    stone: move && props.game ? gobangStoneForPlayer(props.game, move.player) : '',
    ariaLabel: move ? `${row + 1} 行 ${column + 1} 列，${move.player === 'user' ? props.userName : props.characterName}的棋子` : `${row + 1} 行 ${column + 1} 列，空位`,
    classes: {
      'edge-top': row === 0,
      'edge-right': column === GOBANG_BOARD_SIZE - 1,
      'edge-bottom': row === GOBANG_BOARD_SIZE - 1,
      'edge-left': column === 0
    }
  };
}));

const isRequesting = computed(() => Boolean(props.busy || props.game?.apiState?.status === 'requesting'));
const apiFailure = computed(() => ['failed', 'interrupted'].includes(props.game?.apiState?.status ?? ''));
const apiErrorText = computed(() => props.game?.apiState?.error || 'API 请求失败，请重试这一手。');
const canPlaceStone = computed(() => props.game?.status === 'active' && props.game.turn === 'user' && !isRequesting.value && !props.disabled);
const canUndo = computed(() => Boolean(props.game && canUndoGobangRound(props.game)));
const statusTitle = computed(() => {
  if (!props.game) return '';
  if (props.game.status === 'user-won') return '你赢下了这一局';
  if (props.game.status === 'char-won') return `${props.characterName} 赢了`;
  if (props.game.status === 'draw') return '棋盘落满，平局';
  if (props.game.status === 'resigned') return '你收起了棋子';
  if (apiFailure.value) return `${props.characterName} 没有完成落子`;
  if (isRequesting.value) return `${props.characterName} 正在落子`;
  if (props.game.turn === 'char') return `等待 ${props.characterName} 落子`;
  return '轮到你了';
});
const statusDetail = computed(() => {
  if (!props.game) return '';
  if (props.game.status === 'active') return `${props.game.moves.length + 1} 手 · 使用线上聊天模型`;
  return `共落下 ${props.game.moves.length} 手`;
});
const statusChip = computed(() => {
  if (!props.game) return '';
  if (props.game.status === 'active') {
    if (apiFailure.value) return 'API 失败';
    return isRequesting.value ? '思考中' : props.game.turn === 'char' ? '待落子' : '你的回合';
  }
  if (props.game.status === 'user-won') return '胜';
  if (props.game.status === 'char-won') return '负';
  if (props.game.status === 'draw') return '和';
  return '已认输';
});
</script>

<style scoped>
.gobang-panel {
  display: grid;
  gap: 13px;
  color: #242126;
}

.gobang-setup-hero {
  position: relative;
  display: grid;
  min-height: 132px;
  align-content: start;
  overflow: hidden;
  padding: 18px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 85% 18%, rgba(255, 255, 255, 0.55), transparent 21%),
    linear-gradient(145deg, #f3d9b1, #d9a667 62%, #9d633b);
  box-shadow: 0 18px 36px rgba(103, 67, 39, 0.19);
}

.gobang-setup-hero::after {
  position: absolute;
  inset: 0;
  opacity: 0.18;
  background-image:
    linear-gradient(rgba(69, 41, 24, 0.55) 1px, transparent 1px),
    linear-gradient(90deg, rgba(69, 41, 24, 0.55) 1px, transparent 1px);
  background-size: 24px 24px;
  content: '';
  mask-image: linear-gradient(90deg, transparent 35%, #000 100%);
}

.gobang-kicker,
.gobang-setup-hero h2,
.gobang-setup-hero p {
  position: relative;
  z-index: 1;
}

.gobang-kicker {
  color: rgba(62, 38, 26, 0.68);
  font-size: 9px;
  font-weight: 950;
  letter-spacing: 0.12em;
}

.gobang-setup-hero h2,
.gobang-game-head h2 {
  margin: 6px 0 0;
  font-size: 22px;
  font-weight: 950;
  letter-spacing: -0.04em;
}

.gobang-setup-hero p,
.gobang-game-head p {
  margin: 5px 0 0;
  color: rgba(57, 39, 31, 0.72);
  font-weight: 720;
}

.gobang-options {
  display: grid;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.gobang-options legend {
  margin-bottom: 7px;
  color: #6b6570;
  font-size: 10px;
  font-weight: 900;
}

.gobang-option-grid {
  display: grid;
  gap: 7px;
}

.gobang-option-grid--starter { grid-template-columns: 1fr 1fr; }

.gobang-option-grid button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 58px !important;
  padding: 9px !important;
  border: 1px solid rgba(37, 31, 38, 0.08);
  border-radius: 13px !important;
  background: rgba(255, 255, 255, 0.78);
  color: #29252b;
  text-align: left;
  box-shadow: 0 5px 14px rgba(37, 31, 38, 0.04);
}

.gobang-option-grid button.active {
  border-color: rgba(177, 116, 67, 0.72);
  background: #fffaf3;
  box-shadow: 0 0 0 2px rgba(213, 156, 100, 0.14), 0 8px 20px rgba(102, 64, 37, 0.08);
}

.gobang-option-grid span {
  display: grid;
  min-width: 0;
}

.gobang-option-grid strong {
  font-size: 12px;
  font-weight: 930;
}

.gobang-option-grid small {
  color: #89828c;
  font-size: 9px;
  font-weight: 700;
}

.gobang-option-stone {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.gobang-option-stone--black { background: radial-gradient(circle at 35% 30%, #55555a, #17171a 62%, #08080a); }
.gobang-option-stone--white { border: 1px solid #ddd7cf; background: radial-gradient(circle at 35% 30%, #ffffff, #eeeae4 72%, #cfc8bf); }

.gobang-primary-action,
.gobang-danger-action,
.gobang-actions > button {
  border: 0;
  font-weight: 900;
}

.gobang-primary-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 43px !important;
  border-radius: 14px !important;
  background: #242126;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(36, 33, 38, 0.18);
}

.gobang-game-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 2px 0;
}

.gobang-game-title { min-width: 0; }
.gobang-game-head h2 { font-size: 19px; }

.gobang-status-chip {
  flex: 0 0 auto;
  padding: 5px 8px;
  border-radius: 999px;
  background: #f0e5d7;
  color: #8a5b37;
  font-size: 9px;
  font-weight: 950;
}

.gobang-status-chip--user-won { background: #e8f7ed; color: #138341; }
.gobang-status-chip--char-won,
.gobang-status-chip--resigned { background: #f3eef0; color: #7a626b; }
.gobang-status-chip--failed { background: #ffe8eb; color: #b73347; }

.gobang-board-shell {
  position: relative;
  display: grid;
  justify-items: center;
}

.gobang-board {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  width: min(100%, 370px);
  padding: 10px;
  overflow: hidden;
  border: 1px solid rgba(95, 58, 31, 0.25);
  border-radius: 15px;
  background:
    radial-gradient(circle at 22% 13%, rgba(255, 255, 255, 0.28), transparent 20%),
    linear-gradient(145deg, #e9c18e, #d7a461 72%, #c58b4d);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 16px 28px rgba(96, 59, 32, 0.16);
  touch-action: manipulation;
}

.gobang-point {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 0 !important;
  aspect-ratio: 1;
  padding: 0 !important;
  border: 0;
  border-radius: 0 !important;
  background: transparent;
  font-size: 0 !important;
}

.gobang-point::before,
.gobang-point::after {
  position: absolute;
  z-index: 0;
  background: rgba(76, 48, 28, 0.63);
  content: '';
  pointer-events: none;
}

.gobang-point::before { inset: calc(50% - 0.5px) 0 auto; height: 1px; }
.gobang-point::after { inset: 0 auto 0 calc(50% - 0.5px); width: 1px; }
.gobang-point.edge-left::before { left: 50%; }
.gobang-point.edge-right::before { right: 50%; }
.gobang-point.edge-top::after { top: 50%; }
.gobang-point.edge-bottom::after { bottom: 50%; }
.gobang-point:disabled { opacity: 1; }

.gobang-star {
  position: absolute;
  z-index: 1;
  inset: 50% auto auto 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(69, 42, 24, 0.78);
  transform: translate(-50%, -50%);
}

.gobang-stone {
  position: absolute;
  z-index: 2;
  inset: 11%;
  display: grid;
  place-items: center;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(57, 34, 19, 0.32);
}

.gobang-stone--black { background: radial-gradient(circle at 34% 27%, #626168, #242329 54%, #08080a 100%); }
.gobang-stone--white { border: 1px solid rgba(104, 82, 61, 0.2); background: radial-gradient(circle at 34% 27%, #ffffff, #f2eee8 58%, #d4ccc2 100%); }

.gobang-stone.latest::after {
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background: #ee5c6f;
  content: '';
}

.gobang-thinking {
  position: absolute;
  z-index: 5;
  bottom: 9px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(30, 28, 31, 0.86);
  color: #ffffff;
  font-size: 9px;
  font-weight: 850;
  backdrop-filter: blur(10px);
}

.gobang-thinking i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  animation: gobang-thinking 0.9s infinite ease-in-out;
}

.gobang-thinking i:nth-child(2) { animation-delay: 0.15s; }
.gobang-thinking i:nth-child(3) { animation-delay: 0.3s; }

.gobang-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.68);
  color: #746d76;
  font-size: 10px;
  font-weight: 700;
}

.gobang-note svg { flex: 0 0 auto; color: #ba8051; }

.gobang-dialogue span {
  display: grid;
  gap: 2px;
}

.gobang-dialogue strong {
  color: #4b4148;
  font-size: 9px;
}

.gobang-api-error {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(200, 67, 84, 0.16);
  border-radius: 12px;
  background: #fff4f5;
}

.gobang-api-error span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.gobang-api-error strong { color: #a63445; font-size: 10px; }
.gobang-api-error small { color: #8f6c72; font-size: 9px; line-height: 1.4; overflow-wrap: anywhere; }

.gobang-api-error button {
  min-height: 32px !important;
  padding: 0 10px !important;
  border: 0;
  border-radius: 10px !important;
  background: #b83e50;
  color: #ffffff;
  font-size: 9px !important;
  font-weight: 900;
}

.gobang-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.gobang-actions > button {
  min-height: 38px !important;
  border-radius: 12px !important;
  background: #f0edf0;
  color: #4f4951;
}

.gobang-actions > .gobang-danger-action { background: #fff0f2; color: #cf4b5d; }
.gobang-actions > .gobang-primary-action { grid-column: 1 / -1; background: #242126; color: #ffffff; }
.gobang-actions button:disabled { opacity: 0.42; }

@keyframes gobang-thinking {
  0%, 70%, 100% { transform: translateY(0); opacity: 0.4; }
  35% { transform: translateY(-2px); opacity: 1; }
}

@media (max-width: 360px) {
  .gobang-board { padding: 8px; }
}
</style>