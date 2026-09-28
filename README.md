# Livo

Live, interactive presentations. Build slides with quizzes, polls and forms; present on a laptop, control from your phone, and let the audience join by QR code — no accounts, no apps.

## Architecture

| Part | Owns | Where |
|---|---|---|
| `apps/web` (Next.js) | Dashboard, editor, controller, presentation screen, audience UI, API routes | Any Next.js host |
| `apps/realtime` (Cloudflare Worker + Durable Objects, `partyserver`) | Live room state: current slide, timer, open interactions, live results | Your Cloudflare account |
| Supabase | Users, presentations, slides, elements, interactions, rooms, participants, responses | Supabase |
| Cloudflare R2 | Uploaded images | R2 bucket |
| `packages/types` | Shared document model, realtime protocol, response validation/aggregation, signed room tokens | — |

The presentation document and the live room are deliberately separate: clients load the deck once, and the room only sends ids and small events. Responses are aggregated in the room and written to Supabase in batches (`POST /api/realtime/flush`).

## Setup

1. Copy `.env.example` to `.env` and fill it in. `ROOM_TOKEN_SECRET` must be at least 32 characters.
2. Put the same secret in `apps/realtime/.dev.vars` (see `.dev.vars.example`).
3. `npm install`
4. Apply the migrations in order in the Supabase SQL editor (or `supabase db push`):
   - `supabase/migrations/0001_foundation.sql`
   - `supabase/migrations/0002_editor_rooms_analytics.sql`
5. Run the app and the room server in two terminals:
   ```bash
   npm run dev            # http://localhost:3000
   npm run dev:realtime   # ws://localhost:1999
   ```
6. For image uploads, allow `PUT` from your site origin in the R2 bucket's CORS settings.

## Deploying the realtime server

```bash
cd apps/realtime
npx wrangler login
npx wrangler secret put ROOM_TOKEN_SECRET        # same value as the web app
# edit wrangler.jsonc → vars.WEB_ORIGIN = your deployed site URL
cd ../.. && npm run deploy:realtime
```
Then set `NEXT_PUBLIC_PARTYKIT_HOST` to the printed `livo-realtime.<subdomain>.workers.dev` host.

## Routes

| Route | Who | What |
|---|---|---|
| `/dashboard` | Creator | Presentations, templates, recent sessions |
| `/presentation/[id]` | Creator | Slide editor (autosaves) |
| `/presentation/[id]/analytics` | Creator | Session analytics, survey results, CSV export |
| `/control/[code]` | Creator, or anyone with the controller key link | Mobile controller |
| `/present/[code]` | Creator, or the presenter key link | Projector view (`→`/`Space` next, `←` back, `F` fullscreen, `J` join QR) |
| `/join`, `/join/[code]` | Audience | Join by code/QR, answer interactions |

## Testing the room server

With `npx wrangler dev --var WEB_ORIGIN:` running in `apps/realtime`:

```bash
ROOM_TOKEN_SECRET=... npm run test:realtime                     # protocol checks + load test (10–100)
ROOM_TOKEN_SECRET=... node apps/realtime/scripts/load-test.mjs --load-only --sizes 250,500,1000
```

## Production checklist

- Add a Cloudflare rate-limiting rule for `/join` and the realtime host (the app has per-connection and per-instance limits, but public endpoints need edge limits too).
- Keep "Only me" results for anything sensitive — they never leave the controller's connection.
- Run the load test against the deployed worker before large events.
