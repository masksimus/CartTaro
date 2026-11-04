# CartTaro V2 — PostgreSQL production-isolated developer pilot

## Current status

VK real-user launch and HMAC confirmed in the previous stage. New V2 economy has been tested against a real PostgreSQL 16 CI service, but no user database is connected to Vercel yet. GitHub main, existing published app and old visual preview are unchanged.

## Persistence guarantees

- New isolated tables: tarot_v2_accounts, tarot_v2_claims, tarot_v2_daily_cards, tarot_v2_arcana. Old site data is untouched.
- Signed VK launch HMAC is checked on every request, including application ID 54582199, timestamp and user.
- One daily claim per user/day; UTC reward cycle 10/15/20/25/30/35/50 crystals.
- One daily card per user/day, 22 major arcana, achievement flags based on stored account progress.
- PostgreSQL row locks and unique day constraints prevent duplicate grants under concurrent requests and across Vercel instances.
- No real purchases, payments or client-provided balances.
- IMPORTANT: writes are disabled by default even after DATABASE_URL is configured. Only TARO_V2_WRITES_ENABLED=true enables test rewards.
- If database is missing or unavailable, server returns HTTP 503. The client must not award offline crystals.

## Connect a free Neon PostgreSQL database

1. Open https://vercel.com/marketplace/neon and select a $0 Free plan (verify actual cost before accepting).
2. Connect only the separate Vercel project named tarot-vk-uat-public-2026. Do not attach to tarotpreview2026 or other user projects.
3. Complete Vercel Marketplace Neon creation. Confirm the integration injected DATABASE_URL into the project's Production environment. This is a secret: do not send any connection URL, password or key into chat, images or GitHub.
4. Leave TARO_V2_WRITES_ENABLED absent; redeploy this isolated project. Open /api/v2/status: storageConfigured should be true, rewardsEnabled should be false. This status only checks configuration; connection is tested by signed /api/v2/progress.
5. Once the database is live, change only the VK mobile developer URL to https://tarot-vk-uat-public-2026.vercel.app/v2-pilot.html. Do NOT change any published VK URLs.
6. Test progress read with your own admin account. After successful read-only QA, set TARO_V2_WRITES_ENABLED=true in the isolated project's Production environment and redeploy again.
7. Test one daily claim and one card, repeat-click, close and reopen in VK, then check persistence. On failure remove TARO_V2_WRITES_ENABLED and redeploy for immediate write stop.

## Endpoints

- GET /api/v2/status: non-sensitive configuration status.
- GET /api/v2/progress: signed VK only, persistent read.
- POST /api/v2/daily/claim: signed VK only, transactional claim, explicitly write-gated.
- POST /api/v2/daily/draw: signed VK only, transactional daily card, explicitly write-gated.

## Limits and release safety

- First operation bootstraps only new tarot_v2_* SQL tables with an advisory transaction lock; future schema migrations need reviewed versioning.
- Real existing user balances are NOT transferred. V2 users begin with a fresh isolated state.
- The API is not a replacement for billing or in-app purchase validation.
- Real-user gradual release, retention, monitoring, backups, and VK platform testing must be completed before replacing the public VK app.
- Test-only CI database passwords and HMAC fixtures are not real credentials.
- CI: GitHub Actions workflow tarot-v2-postgres.yml uses PostgreSQL 16 and three Android-sized browser viewports.
