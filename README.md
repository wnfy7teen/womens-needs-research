# WOMEN'S NEEDS RESEARCH

Telegram Mini App frontend (React + TypeScript + Vite) connected to the Supabase Edge Function.

## Local development

1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the Supabase publishable key. The frontend uses the Edge Function URL for all survey operations; the key is reserved for future Supabase client features.
4. Run:

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The static production output is written to `dist/`.

## Cloudflare Pages

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`
- Add the variables from `.env.example` in Cloudflare Pages settings.

## Supabase backend

Project: `mqxuhbbthshjuetbjxbh`
Function: `survey-public`

GET `/functions/v1/survey-public` returns sections and questions.
POST actions: `start`, `save`, `complete`. `start` returns a random 256-bit session token once; only its SHA-256 hash is stored in `survey_submissions.session_token_hash`. Both `save` and `complete` require the token, so knowing a submission UUID alone does not grant access.

The frontend loads the official Telegram WebApp bridge, calls `ready()` and `expand()`, and reacts to Telegram theme changes. In-progress answers, the submission ID, and its session token are kept in `sessionStorage` for the lifetime of the browser tab, so a page reload in the same tab can restore the session. They are not persisted across a new tab or browser session. The token is a bearer credential: do not log it, transmit it to analytics, or place it in URLs.

## Privacy and security notes

- Do not add Telegram user IDs to survey records.
- Do not expose the Supabase service-role key in frontend variables.
- The Edge Function currently uses a permissive CORS origin for initial integration; restrict it to the deployed Pages domain before public launch.
- Public submissions are anonymous and protected by a per-submission bearer token, but are not yet protected by CAPTCHA or application-level rate limiting. Add abuse protection before broad distribution.
- Admin analytics and export are intentionally not included in this public client package; they require a separately authenticated admin API and server-side role checks.
