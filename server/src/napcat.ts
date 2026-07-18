import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { config } from './config.js';
import { query, transaction } from './db.js';
import { recordAudit, revokeSessionsWithoutMembership, updateMembership, verifyChallengeFromGroup } from './auth.js';

interface OneBotEvent {
  post_type?: string;
  message_type?: string;
  notice_type?: string;
  group_id?: number | string;
  user_id?: number | string;
  operator_id?: number | string;
  raw_message?: string;
  sender?: {
    nickname?: string;
    card?: string;
    role?: string;
  };
  status?: string;
  retcode?: number;
  data?: unknown;
  echo?: string;
}

interface OneBotGroupMember {
  user_id?: number | string;
  nickname?: string;
  card?: string;
  role?: string;
}

let activeSocket: WebSocket | null = null;
const pendingActions = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}>();

function stringId(value: number | string | undefined) {
  return value === undefined ? '' : String(value);
}

function isAuthorizedConnection(request: FastifyRequest) {
  if (!config.napcatAccessToken) return !config.production;
  const queryToken = String((request.query as { access_token?: unknown } | null)?.access_token ?? '');
  const authorization = String(request.headers.authorization ?? '');
  return queryToken === config.napcatAccessToken || authorization === `Bearer ${config.napcatAccessToken}`;
}

function sendAction(action: string, params: Record<string, unknown>) {
  return new Promise<unknown>((resolve, reject) => {
    if (!activeSocket || activeSocket.readyState !== 1) {
      reject(new Error('NapCat 尚未连接。'));
      return;
    }
    const echo = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingActions.delete(echo);
      reject(new Error(`NapCat action timeout: ${action}`));
    }, 20_000);
    pendingActions.set(echo, { resolve, reject, timer });
    activeSocket.send(JSON.stringify({ action, params, echo }));
  });
}

async function sendGroupReply(groupId: string, message: string) {
  try {
    await sendAction('send_group_msg', { group_id: groupId, message });
  } catch {
    return;
  }
}

async function handleGroupMessage(event: OneBotEvent) {
  const groupId = stringId(event.group_id);
  const qq = stringId(event.user_id);
  const rawMessage = String(event.raw_message ?? '').trim();
  const match = rawMessage.match(/^\/?link\s+(?:绑定|bind)\s+([A-Z0-9]{6,16})\s*$/i);
  if (!match?.[1] || !groupId || !qq) return;

  const result = await verifyChallengeFromGroup({
    code: match[1],
    qq,
    groupId,
    nickname: event.sender?.card || event.sender?.nickname || '',
    role: event.sender?.role || 'member'
  });
  await recordAudit(result.ok ? 'napcat.challenge.verified' : 'napcat.challenge.rejected', qq, { groupId, reason: result.message });
  await sendGroupReply(groupId, `[CQ:at,qq=${qq}] ${result.message}`);
}

async function handleMembershipNotice(event: OneBotEvent) {
  const groupId = stringId(event.group_id);
  const qq = stringId(event.user_id);
  if (!groupId || !qq) return;
  const allowed = await query<{ group_id: string }>('SELECT group_id FROM allowed_groups WHERE group_id = $1 AND enabled = TRUE', [groupId]);
  if (!allowed.rows[0]) return;

  if (event.notice_type === 'group_increase') {
    await updateMembership({ qq, groupId, active: true });
    await recordAudit('napcat.membership.joined', qq, { groupId });
    return;
  }
  if (event.notice_type === 'group_decrease') {
    await updateMembership({ qq, groupId, active: false });
    await recordAudit('napcat.membership.left', qq, { groupId, operatorId: stringId(event.operator_id) });
  }
}

async function handleOneBotPayload(payload: OneBotEvent) {
  if (payload.echo) {
    const pending = pendingActions.get(payload.echo);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingActions.delete(payload.echo);
    if (payload.status === 'ok' || payload.retcode === 0) pending.resolve(payload.data);
    else pending.reject(new Error(`NapCat action failed (${payload.retcode ?? 'unknown'}).`));
    return;
  }
  if (payload.post_type === 'message' && payload.message_type === 'group') await handleGroupMessage(payload);
  if (payload.post_type === 'notice' && ['group_increase', 'group_decrease'].includes(String(payload.notice_type))) {
    await handleMembershipNotice(payload);
  }
}

async function applyGroupSnapshot(groupId: string, members: OneBotGroupMember[]) {
  const registeredUsers = await query<{ qq: string }>('SELECT qq FROM users');
  const registered = new Set(registeredUsers.rows.map((row) => row.qq));
  const activeMembers = members
    .map((member) => ({
      qq: stringId(member.user_id),
      nickname: member.card || member.nickname || '',
      role: member.role || 'member'
    }))
    .filter((member) => registered.has(member.qq));

  await transaction(async (client) => {
    await client.query('UPDATE memberships SET active = FALSE, updated_at = NOW() WHERE group_id = $1', [groupId]);
    for (const member of activeMembers) {
      await client.query(`
        INSERT INTO memberships (qq, group_id, active, nickname, role, last_seen_at, updated_at)
        VALUES ($1, $2, TRUE, $3, $4, NOW(), NOW())
        ON CONFLICT (qq, group_id) DO UPDATE SET
          active = TRUE,
          nickname = EXCLUDED.nickname,
          role = EXCLUDED.role,
          last_seen_at = NOW(),
          updated_at = NOW()
      `, [member.qq, groupId, member.nickname, member.role]);
    }
  });

  for (const user of registeredUsers.rows) await revokeSessionsWithoutMembership(user.qq);
}

export async function syncAllowedGroups() {
  if (!activeSocket || activeSocket.readyState !== 1) return { connected: false, synced: 0 };
  const groups = await query<{ group_id: string }>('SELECT group_id FROM allowed_groups WHERE enabled = TRUE ORDER BY group_id');
  let synced = 0;
  for (const group of groups.rows) {
    try {
      const data = await sendAction('get_group_member_list', { group_id: group.group_id, no_cache: true });
      if (!Array.isArray(data)) continue;
      await applyGroupSnapshot(group.group_id, data as OneBotGroupMember[]);
      synced += 1;
    } catch (error) {
      await recordAudit('napcat.group_sync.failed', '', { groupId: group.group_id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (synced) await recordAudit('napcat.group_sync.completed', '', { synced });
  return { connected: true, synced };
}

export async function registerNapCat(app: FastifyInstance) {
  app.get('/api/napcat/onebot', { websocket: true }, (socket, request) => {
    if (!isAuthorizedConnection(request)) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    activeSocket?.close(1012, 'Replaced by newer NapCat connection');
    activeSocket = socket;
    void recordAudit('napcat.connected');

    socket.on('message', (rawData) => {
      try {
        const payload = JSON.parse(rawData.toString()) as OneBotEvent;
        void handleOneBotPayload(payload).catch((error) => {
          void recordAudit('napcat.event.failed', '', { message: error instanceof Error ? error.message : String(error) });
        });
      } catch {
        return;
      }
    });
    socket.on('close', () => {
      if (activeSocket === socket) activeSocket = null;
      for (const [echo, pending] of pendingActions) {
        clearTimeout(pending.timer);
        pending.reject(new Error('NapCat connection closed.'));
        pendingActions.delete(echo);
      }
      void recordAudit('napcat.disconnected');
    });

    setTimeout(() => void syncAllowedGroups(), 1_000).unref();
  });

  app.post('/api/admin/napcat/sync', async (request, reply) => {
    if (!config.adminToken || request.headers.authorization !== `Bearer ${config.adminToken}`) {
      return await reply.code(401).send({ error: 'admin_auth_required' });
    }
    return await syncAllowedGroups();
  });

  const timer = setInterval(() => void syncAllowedGroups(), config.groupSyncMinutes * 60 * 1000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}