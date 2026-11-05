# Neon V5 test database setup — 2026-11-05

Status: isolated `tarot_v5_game` PostgreSQL database created in existing authorized Neon project `fragrant-wind-83312420`, main branch `br-noisy-mountain-baszwdt5`.
Legacy developer database `neondb` was not modified or copied.

Vercel project: `tarot-vk-uat-public-2026`.
Preview branch: `feature/tarot-v5-release-candidate`.

Scoped environment variable names (values intentionally omitted):
- `TARO_V5_DATABASE_URL`: sensitive, Preview, V5 branch only
- `TARO_V2_PUBLIC_GAME_ENABLED=true`: Preview, V5 branch only
- `TARO_V2_WRITES_ENABLED`: not set for Preview
- `VK_PROTECTED_KEY`: production only; do not put this secret in a public repository

Expected behavior: `/api/v2/health` connects to the new database and bootstraps the isolated schema; `/api/v2/status` remains `read_only`; signed VK launch remains unavailable until securely authorized for V5 Preview. No public rewards, live balance writes, or VK published URL changes.

This documentation change also triggers a fresh Preview deployment to consume the newly scoped Vercel environment variables.
