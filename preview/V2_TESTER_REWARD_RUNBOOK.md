# CartTaro V2 — isolated tester-only reward pilot

Status verified in Vercel: `tarot-vk-uat-public-2026.vercel.app` (separate project). Existing VK app ID `54582199` production URL and repo `main` are not modified.

## Server write boundaries

1. Only HMAC-verified VK launch parameters for app 54582199 with a valid short timestamp are accepted.
2. Postgres `DATABASE_URL` must be configured, and the server-only flag `TARO_V2_WRITES_ENABLED=true` must be enabled.
3. A **32-character hex developer PIN** stored only as Vercel sensitive environment variable `TARO_V2_TEST_ACCESS_PIN` must be provided using `X-Taro-Test-Pin` on *every* reward or card API request. The PIN is not in this repository, does not appear in URL or request body, and is never saved in browser storage.
4. The client verifies PIN using `POST /api/v2/access` (does NOT write to the database). A wrong, absent or malformed PIN always fails; `POST /api/v2/daily/claim` and `POST /api/v2/daily/draw` fail closed without a matching PIN.
5. A transaction and unique (user_id,day_utc) constraints ensure only one reward and one draw per UTC day, across server restarts and concurrent requests.
6. Rewards are *test-only virtual crystals*, not real purchases or payments. Old user balance and live app data are not migrated.

## Administrator UAT from VK mobile developer mode

- Keep existing public VK application URLs unchanged.
- Set **only mobile development URL** to `https://tarot-vk-uat-public-2026.vercel.app/v2-pilot.html`.
- Launch from the VK account that administers the app. Wait for "VK Bridge: подключён" and "Сервер: подпись проверена".
- Enter the **private tester PIN received separately** in the mobile "Код тестировщика" field and tap "Разрешить тестовые награды".
- Confirm that first daily reward adds 10 test crystals, streak becomes 1, and one new arcana is collected by "Открыть карту дня".
- Confirm both buttons are disabled for the remainder of that UTC day.
- Close the VK app and reopen via VK. The signing params will be fresh; reenter tester PIN only to unlock testing, but existing crystals, collection and today's status should already have persisted.
- Do not share protected key, Neon database URL, signed vk_ launch parameters, the tester PIN or authorization headers in screenshots.

## Safety checks

- `GET /api/v2/health` returns `ready:true, database:connected` without secret or user data.
- `GET /api/v2/status` reports `mode:developer_pilot` and `rewardsEnabled:true` only when write flag, Postgres and PIN are configured. This endpoint does not accept a test PIN.
- To halt new test rewards, set `TARO_V2_WRITES_ENABLED=false` in the isolated Vercel project's Production environment and deploy. No effect on published VK or visual demo.
- Tester PIN should be rotated after the UAT. Never commit it, log it or use it as a substitute for VK signature verification.
- Existing `main` and VK published URL remain immutable until separately reviewed release and user migration.

## Verified QA

GitHub Actions `https://github.com/masksimus/CartTaro/actions/runs/41810449321` — 30 server and 30 mobile browser tests on real PostgreSQL 16 *CI fixture*. Public Neon connection was verified separately through SQL health probe. Genuine per-user POST reward and subsequent VK WebView reload are awaiting manual UAT.
