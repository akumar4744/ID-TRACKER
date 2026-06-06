// src/lib/crypto.ts
// Web-Crypto-based passphrase encryption.
//   • PBKDF2 (250k iterations, SHA-256) derives a per-blob AES-GCM-256 key.
//   • Each blob carries its own random salt + IV, so identical plaintexts under
//     the same passphrase produce different ciphertexts.
//   • The passphrase NEVER leaves the browser. Server only sees ciphertext.

const SALT_BYTES      = 16;
const IV_BYTES        = 12;
const KEY_ITERATIONS  = 250_000;

// ── base64 helpers (browser-safe, no Buffer) ───────────────────────────────
function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KEY_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface EncryptedBlob {
  ciphertext: string;
  iv:         string;
  salt:       string;
}

export async function encryptString(plaintext: string, passphrase: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv   = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key  = await deriveKey(passphrase, salt);
  const ct   = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key,
                                           new TextEncoder().encode(plaintext));
  return {
    ciphertext: bytesToBase64(new Uint8Array(ct)),
    iv:         bytesToBase64(iv),
    salt:       bytesToBase64(salt),
  };
}

export async function decryptString(blob: EncryptedBlob, passphrase: string): Promise<string> {
  const salt = base64ToBytes(blob.salt);
  const iv   = base64ToBytes(blob.iv);
  const ct   = base64ToBytes(blob.ciphertext);
  const key  = await deriveKey(passphrase, salt);
  const pt   = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// Sentinel plaintext stored on the very first vault item ("verification").
// On unlock we try to decrypt it — success = passphrase is correct.
export const VAULT_SENTINEL = "VAULT_OK_v1";
