const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Solana public keys are exactly 32 decoded bytes; base58 case is significant. */
export function isSolanaAddress(value: unknown): value is string {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) return false;
  let decoded = BigInt(0);
  for (const character of value) {
    decoded = decoded * BigInt(58) + BigInt(BASE58_ALPHABET.indexOf(character));
  }
  let byteLength = 0;
  while (decoded > BigInt(0)) {
    byteLength += 1;
    decoded >>= BigInt(8);
  }
  // Each leading base58 '1' encodes an additional zero byte.
  for (const character of value) {
    if (character !== "1") break;
    byteLength += 1;
  }
  return byteLength === 32;
}
