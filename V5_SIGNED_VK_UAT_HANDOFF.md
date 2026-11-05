# CartTaro V5 — signed VK developer UAT handoff

Date: 2026-11-05.

## Verified

- `V5` GitHub branch is isolated from `main` and V4 Production.
- Dedicated PostgreSQL database `tarot_v5_game` is reachable, and the test data was not migrated.
- Server checks signed VK app launch and restricts Preview requests to `TARO_V5_UAT_USER_IDS` (server-only).
- `TARO_V5_UAT_MODE=true` and a single allowlisted test account are configured as branch-scoped Preview settings.
- `TARO_V2_PUBLIC_GAME_ENABLED=true` selects the isolated game database.
- `TARO_V2_WRITES_ENABLED=false` for the V5 Preview branch. No live rewards can be issued while auth setup is incomplete.
- `VK_PROTECTED_KEY` exists only in V4 Production. A single Vercel variable cannot simultaneously target branch-specific Preview and Production. Do not relocate or delete the Production key.

## One remaining protected-secret setup (outside ChatGPT)

In Vercel project `tarot-vk-uat-public-2026`, create **another** encrypted/sensitive environment variable named `VK_PROTECTED_KEY` with:
- Environment: **Preview**
- Git branch: **feature/tarot-v5-release-candidate** (exact)
- Value: the **existing VK application protected key** obtained from the authorized VK developer console, entered directly in Vercel.
- Never paste the value into a ChatGPT message, GitHub, logs, URL query, or a screenshot.

Leave the existing Production `VK_PROTECTED_KEY` intact. Do not select all Preview branches.

After saving, redeploy the **V5 Preview branch only** (Git push suffices). Then:
1. `GET /api/v2/status` remains `mode=read_only`.
2. `GET /api/v2/health` returns `database=connected`.
3. An unsigned request `GET /api/v2/progress` returns `401` (rather than `503/auth_not_configured`).
4. Inside authenticated VK test launch, only the allowlisted developer can read isolated V5 progress; other signed users get `403/uat_access_denied`.
5. Only after these read-only checks and approval may test writes be enabled in branch-specific Preview, then use single-day 10-crystal/card tests and verify persistence.

No change to official VK app URL, GitHub `main`, V4 Production, or legacy PostgreSQL data is part of this step.
