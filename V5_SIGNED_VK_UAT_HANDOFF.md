# CartTaro V5 — signed VK developer UAT handoff

Last reviewed: 2026-11-05.

## Current verified setup
- Isolated V5 branch `feature/tarot-v5-release-candidate`. GitHub `main` and V4 Production unchanged.
- Dedicated Neon database `tarot_v5_game`, separate from V4 `neondb`, no migrated player data.
- Preview-only `TARO_V5_UAT_MODE=true` and one allowlisted VK account in the protected `TARO_V5_UAT_USER_IDS` server environment variable.
- Preview-only `TARO_V2_PUBLIC_GAME_ENABLED=true` selects isolated database.
- `TARO_V2_WRITES_ENABLED=false` for V5 Preview. Rewards remain disabled until read-only UAT is verified.
- Production VK protected key remains in Production only; **do not copy or reveal it**.
- V5 Preview server has an isolated read-only verification path for signed VK launch tokens. When no direct Preview key is available, it forwards only the bearer header to `https://tarot-vk-uat-public-2026.vercel.app/api/v2/progress`, a trusted V4 endpoint that verifies VK signature, app ID and freshness. V5 checks 200/401 only and does not use V4 progress. Failure/timeout gives 503, not access.
- Unit test `server/test/v5-uat-delegated-auth.test.mjs` covers valid, corrupted, excluded-user and unavailable verifier cases with simulated verifier; **real VK WebView verification is still required**.

## Remaining UAT with the developer's VK session
1. Open the VK app developer panel and put V5 Preview URL into the **development URL field only**, never the public URL:
   `https://tarot-vk-uat-public-git-6ff854-maksimiirina1992-9738s-projects.vercel.app/release/index.html`
2. Reopen app ID 54582199 under the developer's account. It should show **VK Bridge: подключён** and **Сервер: подпись проверена**.
3. Click **Проверить сохранение карт и кристаллов**; newly created V5 database starts at zero and no reward claims occur. Do not assume V4's previous 10 crystals transferred.
4. Verify 1-card/3-card spread, card JPEGs, and reopen once to confirm read-only persistence.
5. Use `GET /api/v2/status`: expected `mode=read_only`; `GET /api/v2/health`: expected `database=connected`.
6. After real signed read-only UAT is confirmed, we can enable writes **only in the V5 Preview branch**, for the allowlisted developer and isolated V5 database. Test one grant and one card in 24h, replay protection and reopening. For safety, obtain explicit user approval for first game-data writes if needed.
7. Before general release: choose a genuine standalone Production app setup with independent VK key and database backups, plus final Android verification, moderation and rollback checks.

## Forbidden shortcuts
- Do not switch the Vercel project's Production tracking branch, overwrite V4 data or remove the allowlist.
- Do not share protected key, passwords, signed launch query strings, DB URLs or account IDs in chat, screenshots or GitHub.
- Do not enable a public reward economy on an arbitrary preview URL.
