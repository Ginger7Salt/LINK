import type { ChatGobangApiErrorCode, ChatGobangAttachment, GenerateReplyInput } from '@/types/domain';
import { extractJsonContent } from '@/utils/aiResponse';
import { gobangStoneForPlayer, GOBANG_BOARD_SIZE } from '@/utils/gobang';
import { requestTextGeneration } from './ai';
import { buildPrompt } from './prompt';

export interface GeneratedGobangMove {
  row: number;
  column: number;
}

export class GobangApiError extends Error {
  readonly code: ChatGobangApiErrorCode;

  constructor(code: ChatGobangApiErrorCode, message: string) {
    super(message);
    this.name = 'GobangApiError';
    this.code = code;
  }
}

function renderGobangBoard(game: ChatGobangAttachment) {
  const occupied = new Map(game.moves.map((move) => [`${move.row}:${move.column}`, move.player]));
  const header = `    ${Array.from({ length: GOBANG_BOARD_SIZE }, (_, column) => String(column).padStart(2, ' ')).join(' ')}`;
  const rows = Array.from({ length: GOBANG_BOARD_SIZE }, (_, row) => {
    const points = Array.from({ length: GOBANG_BOARD_SIZE }, (_, column) => {
      const player = occupied.get(`${row}:${column}`);
      return player === 'user' ? ' U' : player === 'char' ? ' C' : ' .';
    }).join(' ');
    return `${String(row).padStart(2, ' ')}  ${points}`;
  });
  return [header, ...rows].join('\n');
}

function renderMoveHistory(game: ChatGobangAttachment) {
  if (!game.moves.length) return '暂无落子。';
  return game.moves
    .map((move, index) => `${index + 1}. ${move.player === 'user' ? '用户 U' : '角色 C'} -> (${move.row}, ${move.column})`)
    .join('\n');
}

function buildGobangMovePrompt(input: GenerateReplyInput, game: ChatGobangAttachment) {
  const contextPrompt = buildPrompt(input, {
    includeOnlineChatPunctuation: false,
    includeOnlineStickerSemantics: false,
    includeOnlineRoutineCare: false,
    includeAvailableStickers: false,
    includeOnlineReplyTools: false,
    outputPromptOverride: '当前是特殊棋局任务。不要执行普通聊天消息、资料修改、主页主题、Sticker、语音、图片、定位、转账、一起听、邀约或通话输出格式；最终输出格式只以后文的五子棋 JSON 协议为准。'
  });
  const characterStone = gobangStoneForPlayer(game, 'char') === 'black' ? '黑棋' : '白棋';
  const userStone = game.userStone === 'black' ? '黑棋' : '白棋';
  const revision = game.revision ?? game.moves.length;

  return [
    contextPrompt,
    `══════════════════════════════════════\n当前特殊任务：五子棋角色回合\n══════════════════════════════════════

以上角色设定、世界书、记忆手册、现实时间感知、关系状态和最近对话全部继续有效。本轮不是普通聊天回复：你正在以同一个角色身份与用户下五子棋，需要亲自观察棋盘并决定这一手落在哪里。不要套用预设棋风，不要随机落子，也不要迎合用户输赢；你的判断、认真程度、冒险或谨慎都只能从角色本人、当前关系、最近对话和此刻心态自然产生。

你可以在内部完整思考攻防、连线、阻挡和后续变化，但绝对不要输出分析过程、思维链、候选点或评分。这个请求只负责提交一个合法落点；落子之后的完整线上聊天回复会由另一个与普通聊天相同的任务生成。

棋局协议：
- gameId: ${game.gameId}
- revision: ${revision}
- 棋盘：15 × 15，自由五子棋，任一方向连续五子或以上获胜
- 角色：C，执${characterStone}，当前必须落子
- 用户：U，执${userStone}
- 空位：.
- 坐标：row 和 column 均从 0 到 14

当前棋盘：
${renderGobangBoard(game)}

完整落子历史：
${renderMoveHistory(game)}

只输出一个 JSON 对象，不要 Markdown，不要代码围栏，不要 JSON 之外的任何文字。JSON 必须且只能包含以下字段：
- gameId：字符串，固定为 ${game.gameId}
- revision：整数，固定为 ${revision}
- row：你观察棋盘后自行决定的 0 到 14 整数
- column：你观察棋盘后自行决定的 0 到 14 整数

硬性要求：
1. gameId 和 revision 必须原样返回。
2. row、column 必须是 0 到 14 的整数，并且目标位置必须是当前棋盘中的空位 .。
3. 只能返回角色 C 的一手，不得代替用户落子，不得一次返回多个坐标。
4. 不得在 JSON 中增加 narration、dialogue、reasoning、analysis、score、candidates 等字段。`
  ].join('\n\n');
}

function parseInteger(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d{1,2}$/.test(value.trim())) return Number(value.trim());
  return null;
}

function explicitCoordinateRecord(rawResponse: string) {
  const rowMatch = rawResponse.match(/(?:["']?row["']?|行坐标)\s*[:：=]\s*["']?(\d{1,2})/i);
  const columnMatch = rawResponse.match(/(?:["']?(?:column|col)["']?|列坐标)\s*[:：=]\s*["']?(\d{1,2})/i);
  const movePairMatch = rawResponse.match(/(?:落子|落在|下在|move|choose)[^\d]{0,20}\(?\s*(\d{1,2})\s*[,，]\s*(\d{1,2})\s*\)?/i);
  const row = rowMatch?.[1] ?? movePairMatch?.[1];
  const column = columnMatch?.[1] ?? movePairMatch?.[2];
  if (row === undefined || column === undefined) return null;
  return { row, column } satisfies Record<string, unknown>;
}

function nestedResponseTexts(record: Record<string, unknown>) {
  const directTexts = [record.content, record.reply, record.text, record.output]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  const messageTexts = Array.isArray(record.messages)
    ? record.messages.flatMap((message) => {
      if (!message || typeof message !== 'object' || Array.isArray(message)) return [];
      const messageRecord = message as Record<string, unknown>;
      return [messageRecord.content, messageRecord.text]
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
    })
    : [];
  return [...directTexts, ...messageTexts];
}

function normalizeMoveRecord(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const move = record.move;
  if (!move || typeof move !== 'object' || Array.isArray(move)) return record;
  return { ...record, ...(move as Record<string, unknown>) };
}

function validateGeneratedMove(record: Record<string, unknown>, game: ChatGobangAttachment): GeneratedGobangMove {
  const revision = game.revision ?? game.moves.length;
  if (record.gameId !== undefined && String(record.gameId) !== game.gameId) {
    throw new GobangApiError('invalid-response', '角色模型返回了其他棋局的落子。');
  }
  if (record.revision !== undefined && parseInteger(record.revision) !== revision) {
    throw new GobangApiError('invalid-response', '角色模型返回了不属于当前棋局版本的落子。');
  }

  const row = parseInteger(record.row);
  const column = parseInteger(record.column);
  if (row === null || column === null || row < 0 || row >= GOBANG_BOARD_SIZE || column < 0 || column >= GOBANG_BOARD_SIZE) {
    throw new GobangApiError('invalid-response', '角色模型返回的落子坐标超出棋盘范围。');
  }
  if (game.moves.some((move) => move.row === row && move.column === column)) {
    throw new GobangApiError('illegal-move', '角色模型选择了已有棋子的位置，本手没有生效。');
  }

  return { row, column };
}

function parseGobangMoveResponse(rawResponse: string, game: ChatGobangAttachment): GeneratedGobangMove {
  let record: Record<string, unknown> | null = null;
  try {
    record = normalizeMoveRecord(JSON.parse(extractJsonContent(rawResponse)));
  } catch {
    record = null;
  }

  if (record && parseInteger(record.row) !== null && parseInteger(record.column) !== null) {
    return validateGeneratedMove(record, game);
  }

  if (record) {
    for (const nestedText of nestedResponseTexts(record)) {
      try {
        return parseGobangMoveResponse(nestedText, game);
      } catch (error) {
        if (error instanceof GobangApiError && error.code !== 'invalid-response') throw error;
      }
    }
  }

  const explicitRecord = explicitCoordinateRecord(rawResponse);
  if (explicitRecord) return validateGeneratedMove(explicitRecord, game);

  const preview = rawResponse.replace(/\s+/g, ' ').trim().slice(0, 180);
  throw new GobangApiError('invalid-response', `角色模型没有返回可解析的五子棋落点。${preview ? ` 返回摘要：${preview}` : ''}`);
}

export function classifyGobangApiError(error: unknown): { code: ChatGobangApiErrorCode; message: string } {
  if (error instanceof GobangApiError) return { code: error.code, message: error.message };
  if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return { code: 'interrupted', message: error.name === 'TimeoutError' ? '角色落子请求超时，请重试这一手。' : '角色落子请求已中断，请重试这一手。' };
  }
  const message = error instanceof Error ? error.message.trim() : String(error ?? '').trim();
  const networkError = /network|fetch|cors|网络|代理|超时|timeout|502|503|504/i.test(message);
  return {
    code: networkError ? 'network' : 'unknown',
    message: message || '角色落子 API 请求失败。'
  };
}

export async function generateGobangMove(input: GenerateReplyInput, game: ChatGobangAttachment, signal?: AbortSignal) {
  const rawResponse = await requestTextGeneration(input.settings, buildGobangMovePrompt(input, game), input.modelOverride, {
    temperature: 0.35,
    jsonMode: true,
    signal
  });
  if (!rawResponse.trim()) throw new GobangApiError('invalid-response', '角色模型没有返回五子棋落子。');
  return parseGobangMoveResponse(rawResponse, game);
}
