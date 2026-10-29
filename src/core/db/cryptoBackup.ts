/**
 * 备份文件加密（模块 17 #7）：PBKDF2-SHA256 派生密钥 + AES-GCM 认证加密。
 * 密码不落盘、不进备份；加密文件格式：
 *   campusflow-enc:v1:<salt b64>:<iv b64>:<ciphertext b64>
 * 解密失败（密码错误/数据损坏）抛出明确错误，不产生半途数据。
 */

const PREFIX = "campusflow-enc:v1:";
const ITERATIONS = 210_000;

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** 加密文本（如 JSON 备份）。 */
export async function encryptText(plain: string, password: string): Promise<string> {
  if (!password) throw new Error("加密需要密码");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plain),
  );
  return `${PREFIX}${toB64(salt)}:${toB64(iv)}:${toB64(new Uint8Array(ciphertext))}`;
}

/** 是否为加密备份文本。 */
export function isEncryptedBackup(text: string): boolean {
  return text.trim().startsWith(PREFIX);
}

/** 解密备份文本。密码错误或数据损坏时抛错。 */
export async function decryptText(encrypted: string, password: string): Promise<string> {
  const raw = encrypted.trim();
  if (!isEncryptedBackup(raw)) throw new Error("不是加密备份格式");
  const [, , saltB64, ivB64, dataB64] = raw.split(":");
  if (!saltB64 || !ivB64 || !dataB64) throw new Error("加密备份格式不完整");
  try {
    const key = await deriveKey(password, fromB64(saltB64));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) as unknown as BufferSource },
      key,
      fromB64(dataB64) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("解密失败：密码错误或文件已损坏");
  }
}
