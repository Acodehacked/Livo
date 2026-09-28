import { z } from "zod";

const browserEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_PARTYKIT_HOST: z.string().min(1),
});

export const publicEnv = () => browserEnv.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_PARTYKIT_HOST: process.env.NEXT_PUBLIC_PARTYKIT_HOST,
});

/** Realtime host without protocol or trailing slash; partysocket picks ws:// for localhost and wss:// otherwise. */
export const realtimeHost = () => publicEnv().NEXT_PUBLIC_PARTYKIT_HOST.replace(/^(https?|wss?):\/\//, "").replace(/\/+$/, "");

/** Absolute site origin for join links and QR codes. */
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const roomEnv = () => z.object({
  ...browserEnv.shape,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ROOM_TOKEN_SECRET: z.string().min(32),
}).parse(process.env);

export const r2Env = () => z.object({
  R2_ACCOUNT_ID: z.string().min(1), R2_ACCESS_KEY_ID: z.string().min(1), R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1), R2_PUBLIC_BASE_URL: z.string().url(),
}).parse(process.env);
