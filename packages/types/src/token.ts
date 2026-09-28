// HMAC-SHA256 signed room tokens (JWT-compatible HS256). Uses Web Crypto so the same code
// runs in Next.js (Node 20+) and in the Cloudflare Worker.
import type { RoomRole } from "./model";

export interface RoomClaims {
  roomId: string;
  role: RoomRole | "system";
  presentationId?: string;
  participantId?: string;
  name?: string;
  exp: number; // unix seconds
}

const encoder = new TextEncoder();
const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
const encodeJson = (value: unknown) => toBase64Url(encoder.encode(JSON.stringify(value)));

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string) {
  let key = keyCache.get(secret);
  if (!key) { key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); keyCache.set(secret, key); }
  return key;
}

export async function signRoomToken(claims: RoomClaims, secret: string): Promise<string> {
  const body = `${encodeJson({ alg: "HS256", typ: "JWT" })}.${encodeJson(claims)}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

export async function verifyRoomToken(token: string | null | undefined, secret: string): Promise<RoomClaims | null> {
  const [header, payload, signature] = token?.split(".") ?? [];
  if (!header || !payload || !signature) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(signature), encoder.encode(`${header}.${payload}`));
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as RoomClaims;
    return typeof claims.roomId === "string" && typeof claims.exp === "number" && claims.exp * 1000 > Date.now() ? claims : null;
  } catch {
    return null;
  }
}
