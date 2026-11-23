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
POST actions: `start`, `save`, `complete`.

## Privacy and security notes

- Do not add Telegram user IDs to survey records.
- Do not expose the Supabase service-role key in frontend variables.
- The Edge Function currently uses a permissive CORS origin for initial integration; restrict it to the deployed Pages domain before public launch.
- Public submissions are anonymous but not yet protected by CAPTCHA/rate limiting. Add abuse protection before broad distribution.
- Admin analytics and export are intentionally not included in this public client package; they require a separately authenticated admin API and server-side role checks.
