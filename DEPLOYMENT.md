# Cloudflare Pages deployment

Project: `womens-needs-research`
Production branch: `main`
Build command: `npm run build`
Output directory: `dist`
Root directory: repository root
Pages hostname: `womens-needs-research.pages.dev`

## Before public launch

- Verify the production deployment and the Telegram Mini App on desktop and mobile.
- Confirm the survey loads and that start, save, resume, and complete work against the existing Supabase Edge Function.
- Restrict the Edge Function CORS policy to the production frontend origins.
- Add abuse protection (rate limiting and an appropriate anti-bot measure) before broad public distribution.
- Confirm the survey version intended for public use; do not change active survey versions as part of a frontend deployment.
- Keep Supabase service-role credentials server-side. Never put them in `VITE_*` variables.
