const encryptedBackupIterations = 600_000;

export interface EncryptedLinkBackupEnvelope {
  app: 'LINK';
  encryptedBackupVersion: 1;
  exportedAt: number;
  kdf: {
    name: 'PBKDF2-SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-256-GCM';
    iv: string;
  };
  payload: string;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveEncryptionKey(recoveryKey: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(recoveryKey),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function createBackupRecoveryKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `BLK1-${bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

export async function encryptLinkBackupText(plainText: string, recoveryKey: string, exportedAt = Date.now()) {
  if (recoveryKey.trim().length < 24) throw new Error('恢复密钥无效，请重新生成。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(recoveryKey.trim(), salt, encryptedBackupIterations);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 },
    key,
    new TextEncoder().encode(plainText)
  );
  const envelope: EncryptedLinkBackupEnvelope = {
    app: 'LINK',
    encryptedBackupVersion: 1,
    exportedAt,
    kdf: { name: 'PBKDF2-SHA-256', iterations: encryptedBackupIterations, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-256-GCM', iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(encrypted))
  };
  return JSON.stringify(envelope);
}

export async function decryptLinkBackupText(encryptedText: string, recoveryKey: string) {
  let envelope: EncryptedLinkBackupEnvelope;
  try {
    envelope = JSON.parse(encryptedText) as EncryptedLinkBackupEnvelope;
  } catch {
    throw new Error('云端文件不是有效的 BabyLink 加密备份。');
  }
  if (envelope?.app !== 'LINK'
    || envelope.encryptedBackupVersion !== 1
    || envelope.kdf?.name !== 'PBKDF2-SHA-256'
    || envelope.cipher?.name !== 'AES-256-GCM'
    || !envelope.payload) {
    throw new Error('暂不支持该加密备份格式。');
  }
  if (!Number.isInteger(envelope.kdf.iterations) || envelope.kdf.iterations < 100_000 || envelope.kdf.iterations > 2_000_000) {
    throw new Error('加密备份的密钥参数无效。');
  }
  try {
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const key = await deriveEncryptionKey(recoveryKey.trim(), salt, envelope.kdf.iterations);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      toArrayBuffer(base64ToBytes(envelope.payload))
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('恢复密钥不正确，或云端备份已经损坏。');
  }
}