# ALYS under https://alyspools.com/app (staging architecture)

## Verified hosting facts
- Marketing site remains on Hostinger at https://alyspools.com.
- ALYS Next.js application remains on Netlify (server-rendered app).
- The public `/app` path must preserve the origin in the browser, including login, cookies, service worker and offline visits.
- A Hostinger URL redirect to Netlify is NOT the same as mounting the app at `alyspools.com/app`.

## Recommended routing architecture
`Browser -> Cloudflare path route /app* -> Netlify ALYS app`
`Browser -> Hostinger marketing site for everything else`

Cloudflare must manage the DNS zone and be proxy for the website, with Hostinger origin DNS records preserved. Preserve all existing email MX/TXT records. Do not move DNS/name servers without account access and review of current records. Route a Worker only to `alyspools.com/app*`. Cloudflare Worker template: `deployment/cloudflare/alys-app-proxy.js`. Configure `ALYS_NETLIFY_ORIGIN` as a stable Netlify hostname, for example `https://<your-netlify-site>.netlify.app/` (replace with real site). Worker expects the Netlify build to serve `/app` already.

## What is staged in this branch
- `next.config.ts`: **opt-in only** `ALYS_APP_BASE_PATH=/app` to enable the production Next.js basePath. Default behavior remains unchanged.
- Worker proxy template and this deployment plan. No DNS, Hostinger, Cloudflare, Netlify, Supabase or production database has been modified.

## Remaining technical work BEFORE enabling /app
1. Rewrite all hard-coded `/api/*`, `/login`, `/route`, `/offline`, `/sw.js`, `/manifest.webmanifest`, image/icon URLs, `window.location`/history replacements, and external report email links to use a tested application path helper. Next.js `Link` handles `basePath` automatically, but browser fetch, absolute asset strings, and service-worker cache keys do **not**.
2. Restrict Service Worker registration, scope, offline navigation, cache cleanup and public asset caching to `/app/`; never let this new build delete existing offline drafts/photos, or assume changing the PWA origin preserves existing IndexedDB.
3. Update Auth redirects, cookies and `APP_URL`/invitation links for same-origin `https://alyspools.com/app`. Note current `applicationOrigin()` expects origin without a path, so extend and test its contract before altering `APP_URL`.
4. Add end-to-end tests with `ALYS_APP_BASE_PATH=/app` for login/logout, RSC/SSR, private API calls, Next static assets, navigation, GPS, report links, service worker, photos JPEG/HEIC, offline sync and resuming the app after lock/sleep.
5. Check production Supabase schema migrations 026/027 and current ALYS V3 merge status separately; do not run migrations implicitly from this routing branch.
6. Set up a staging Netlify site and Cloudflare route using a staging host before touching the main domain. In Cloudflare, DNS of Hostinger must remain proxied with Hostinger-provided origin address (do not guess). Keep all unrelated paths going to Hostinger. Confirm SSL, route path and WordPress/Builder behavior.
7. Confirm Apple iOS installed PWA behavior: `scope=/app/`, start URL, permissions, push/auth cookies, no old pending device operations. No browser data reset as a workaround.

## Acceptance conditions
- `https://alyspools.com/`, blog, form submission, and SEO content remain exactly served by Hostinger.
- `https://alyspools.com/app` and every subpage load without changing the visible host.
- Static assets, API requests, photo uploads and all cookie redirects stay under `/app` with no 404, CORS or CSP errors.
- Owner/Technician role isolation and offline/online transitions work on physical iPhone.
- No production DNS, schema or website change without validation/explicit approval.

## Alternative if DNS/Cloudflare cannot be used
`https://app.alyspools.com` is substantially simpler: map the subdomain to Netlify while keeping Hostinger on the apex. It is **not** the exact requested `/app` URL. A WordPress/Hostinger redirect from `/app` to that subdomain changes the browser URL and does not fulfill the strict requirement.
