import { createVerify } from "node:crypto";

export interface CallbackFields {
  transactionId: string;
  intentId: string;
  adUnit: string;
  rewardItem: string;
  rewardAmount: number;
  timestamp: number;
}

interface Key { keyId: number; pem: string; }
let keyCache: { expiresAt: number; keys: Key[] } | undefined;
const KEY_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";

async function getKeys(force = false): Promise<Key[]> {
  if (!force && keyCache && keyCache.expiresAt > Date.now()) return keyCache.keys;
  const response = await fetch(KEY_URL, { signal: AbortSignal.timeout(5000) });
  if (response.status === 504) throw new DOMException('Key request timed out', 'TimeoutError');
  if (!response.ok) throw new Error("KEY_FETCH_FAILED");
  const body = await response.json() as { keys?: Key[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("KEY_FETCH_FAILED");
  keyCache = { keys: body.keys, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return body.keys;
}

export async function verifyAdmobCallback(rawUrl: string, expectedAdUnits: readonly string[],
    loadKeys: (force?: boolean) => Promise<Key[]> = getKeys): Promise<CallbackFields> {
  const rawQuery = rawUrl.split("?", 2)[1];
  if (!rawQuery) throw new Error("INVALID_CALLBACK");
  const marker = "&signature=";
  const index = rawQuery.lastIndexOf(marker);
  if (index < 0) throw new Error("INVALID_CALLBACK");
  const signedPart = rawQuery.slice(0, index);
  const tail = rawQuery.slice(index + marker.length);
  const keyMarker = "&key_id=";
  const keyIndex = tail.lastIndexOf(keyMarker);
  if (keyIndex < 0 || tail.indexOf(keyMarker) !== keyIndex) throw new Error("INVALID_CALLBACK");
  const signature = tail.slice(0, keyIndex);
  const keyId = Number(tail.slice(keyIndex + keyMarker.length));
  if (!Number.isSafeInteger(keyId) || !signature) throw new Error("INVALID_CALLBACK");
  let keys = await loadKeys();
  let key = keys.find(item => item.keyId === keyId);
  if (!key) { keys = await loadKeys(true); key = keys.find(item => item.keyId === keyId); }
  if (!key) throw new Error("UNKNOWN_KEY");
  const verifier = createVerify("SHA256");
  verifier.update(Buffer.from(signedPart, "utf8"));
  verifier.end();
  const decodedSignature = Buffer.from(decodeURIComponent(signature).replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (!verifier.verify(key.pem, decodedSignature)) throw new Error("BAD_SIGNATURE");

  const params = new URLSearchParams(signedPart);
  const transactionId = params.get("transaction_id") || "";
  const intentId = params.get("custom_data") || "";
  const adUnit = params.get("ad_unit") || "";
  const rewardItem = params.get("reward_item") || "";
  const rewardAmount = Number(params.get("reward_amount"));
  const timestamp = Number(params.get("timestamp"));
  const timestampMs = timestamp > 1e15 ? Math.floor(timestamp / 1000) : timestamp;
  if (!transactionId || !intentId || !expectedAdUnits.includes(adUnit) || !rewardItem ||
      !Number.isInteger(rewardAmount) || rewardAmount < 1 ||
      !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 24 * 60 * 60 * 1000) {
    throw new Error("INVALID_CALLBACK");
  }
  return { transactionId, intentId, adUnit, rewardItem, rewardAmount, timestamp };
}
