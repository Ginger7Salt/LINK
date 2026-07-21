import type { ChatGobangApiState, ChatGobangAttachment, ChatGobangMove, ChatGobangPlayer, ChatGobangStatus } from '@/types/domain';

export const GOBANG_BOARD_SIZE = 15 as const;

const directions = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
] as const;

type GobangPosition = Pick<ChatGobangMove, 'row' | 'column'>;

type CreateGobangGameOptions = {
  gameId: string;
  starter: ChatGobangPlayer;
  direction?: 'incoming' | 'outgoing';
  invitationStatus?: 'pending' | 'accepted';
  createdAt?: number;
};

type ApplyGobangMoveOptions = {
  createdAt?: number;
  dialogue?: string;
  dialogueTranslation?: string;
  apiModel?: string;
  requestId?: string;
};

function positionKey(row: number, column: number) {
  return `${row}:${column}`;
}

function isInsideBoard(row: number, column: number) {
  return row >= 0 && row < GOBANG_BOARD_SIZE && column >= 0 && column < GOBANG_BOARD_SIZE;
}

function createMoveMap(moves: ChatGobangMove[]) {
  return new Map(moves.map((move) => [positionKey(move.row, move.column), move.player]));
}

function playerAt(board: Map<string, ChatGobangPlayer>, row: number, column: number) {
  return board.get(positionKey(row, column));
}

function countDirection(board: Map<string, ChatGobangPlayer>, row: number, column: number, player: ChatGobangPlayer, rowStep: number, columnStep: number) {
  let count = 0;
  let nextRow = row + rowStep;
  let nextColumn = column + columnStep;
  while (isInsideBoard(nextRow, nextColumn) && playerAt(board, nextRow, nextColumn) === player) {
    count += 1;
    nextRow += rowStep;
    nextColumn += columnStep;
  }
  return { count, nextRow, nextColumn };
}

function lineShape(board: Map<string, ChatGobangPlayer>, row: number, column: number, player: ChatGobangPlayer, rowStep: number, columnStep: number) {
  const forward = countDirection(board, row, column, player, rowStep, columnStep);
  const backward = countDirection(board, row, column, player, -rowStep, -columnStep);
  const openEnds = Number(isInsideBoard(forward.nextRow, forward.nextColumn) && !playerAt(board, forward.nextRow, forward.nextColumn))
    + Number(isInsideBoard(backward.nextRow, backward.nextColumn) && !playerAt(board, backward.nextRow, backward.nextColumn));
  return { length: 1 + forward.count + backward.count, openEnds };
}

function completesFive(board: Map<string, ChatGobangPlayer>, position: GobangPosition, player: ChatGobangPlayer) {
  return directions.some(([rowStep, columnStep]) => lineShape(board, position.row, position.column, player, rowStep, columnStep).length >= 5);
}

export function createGobangGame(options: CreateGobangGameOptions): ChatGobangAttachment {
  const createdAt = options.createdAt ?? Date.now();
  return {
    gameId: options.gameId,
    direction: options.direction ?? 'outgoing',
    invitationStatus: options.invitationStatus ?? 'accepted',
    size: GOBANG_BOARD_SIZE,
    status: 'active',
    turn: options.starter,
    starter: options.starter,
    userStone: options.starter === 'user' ? 'black' : 'white',
    moves: [],
    undoCount: 0,
    startedAt: createdAt,
    acceptedAt: options.invitationStatus === 'pending' ? undefined : createdAt,
    updatedAt: createdAt,
    revision: 0,
    apiState: { status: 'idle' }
  };
}

export function gobangStoneForPlayer(game: Pick<ChatGobangAttachment, 'userStone'>, player: ChatGobangPlayer) {
  if (player === 'user') return game.userStone;
  return game.userStone === 'black' ? 'white' : 'black';
}

export function gobangWinner(game: Pick<ChatGobangAttachment, 'status'>): ChatGobangPlayer | null {
  if (game.status === 'user-won') return 'user';
  if (game.status === 'char-won') return 'char';
  return null;
}

export function respondGobangInvitation(game: ChatGobangAttachment, status: 'accepted' | 'rejected' | 'cancelled', respondedAt = Date.now()): ChatGobangAttachment {
  if ((game.invitationStatus ?? 'accepted') !== 'pending') return game;
  return {
    ...game,
    invitationStatus: status,
    respondedAt,
    acceptedAt: status === 'accepted' ? respondedAt : undefined,
    updatedAt: respondedAt,
    apiState: { status: 'idle', model: game.apiState?.model }
  };
}

export function applyGobangMove(game: ChatGobangAttachment, position: GobangPosition, player: ChatGobangPlayer, options: ApplyGobangMoveOptions = {}): ChatGobangAttachment {
  if ((game.invitationStatus ?? 'accepted') !== 'accepted' || game.status !== 'active' || game.turn !== player || !isInsideBoard(position.row, position.column)) return game;
  if (game.moves.some((move) => move.row === position.row && move.column === position.column)) return game;
  const createdAt = options.createdAt ?? Date.now();
  const move: ChatGobangMove = {
    ...position,
    player,
    createdAt,
    ...(player === 'char' && options.dialogue?.trim() ? { dialogue: options.dialogue.trim() } : {}),
    ...(player === 'char' && options.dialogueTranslation?.trim() ? { dialogueTranslation: options.dialogueTranslation.trim() } : {}),
    ...(player === 'char' && options.apiModel?.trim() ? { apiModel: options.apiModel.trim() } : {}),
    ...(player === 'char' && options.requestId?.trim() ? { requestId: options.requestId.trim() } : {})
  };
  const moves = [...game.moves, move];
  const board = createMoveMap(moves);
  let status: ChatGobangStatus = 'active';
  if (completesFive(board, position, player)) status = player === 'user' ? 'user-won' : 'char-won';
  else if (moves.length === GOBANG_BOARD_SIZE * GOBANG_BOARD_SIZE) status = 'draw';
  return {
    ...game,
    moves,
    status,
    turn: player === 'user' ? 'char' : 'user',
    updatedAt: createdAt,
    endedAt: status === 'active' ? undefined : createdAt,
    revision: (game.revision ?? game.moves.length) + 1,
    apiState: { status: 'idle', model: options.apiModel?.trim() || game.apiState?.model }
  };
}

export function canUndoGobangRound(game: ChatGobangAttachment) {
  return game.status === 'active' && game.turn === 'user' && game.undoCount < 1 && game.moves.some((move) => move.player === 'user');
}

export function undoGobangRound(game: ChatGobangAttachment, updatedAt = Date.now()): ChatGobangAttachment {
  if (!canUndoGobangRound(game)) return game;
  let lastUserMoveIndex = -1;
  for (let index = game.moves.length - 1; index >= 0; index -= 1) {
    if (game.moves[index]?.player !== 'user') continue;
    lastUserMoveIndex = index;
    break;
  }
  if (lastUserMoveIndex < 0) return game;
  return {
    ...game,
    moves: game.moves.slice(0, lastUserMoveIndex),
    turn: 'user' as const,
    status: 'active' as const,
    undoCount: game.undoCount + 1,
    updatedAt,
    endedAt: undefined,
    revision: (game.revision ?? game.moves.length) + 1,
    apiState: { status: 'idle', model: game.apiState?.model }
  };
}

export function resignGobangGame(game: ChatGobangAttachment, endedAt = Date.now()): ChatGobangAttachment {
  if (game.status !== 'active') return game;
  return {
    ...game,
    status: 'resigned' as const,
    updatedAt: endedAt,
    endedAt,
    revision: (game.revision ?? game.moves.length) + 1,
    apiState: { status: 'idle', model: game.apiState?.model }
  };
}

export function updateGobangApiState(game: ChatGobangAttachment, apiState: ChatGobangApiState, updatedAt = Date.now()): ChatGobangAttachment {
  return {
    ...game,
    apiState: { ...apiState },
    updatedAt
  };
}