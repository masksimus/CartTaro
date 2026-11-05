# Codex / agent engineering rules for CartTaro V6 feature branch

Read `docs/V6_COOKIE_INSPIRED_CODEX_BRIEF.md` before any changes and inspect the existing V5 code and tests.

- Work only on `feature/tarot-v6-cookie-inspired-20261105` (or a PR branch derived from it). Never modify `main`, V4 branch, V5 stage branch or published VK app settings without a separate explicit authorization.
- Never expose, print, commit or copy `VK_PROTECTED_KEY`, Neon connection strings, signed VK launch parameters, user identifiers or other secrets.
- Preserve signed VK HMAC verification, server-authoritative game state, idempotent rewards, database isolation and `TARO_V5_PUBLIC_RELEASE_CONFIRMED=false`. Unsigned local demo must not call protected API routes or pretend to authenticate.
- Build a playable original tarot game inspired by «Печенька»'s retention *concept*, **not** a replica of its proprietary assets/UI/text.
- Use officially documented, pinned VK Bridge and local essential assets; no untrusted remote scripts on startup.
- Design for Android 320/360/393/430px, VK WebView safe-area, reduced motion, screen readers and touch.
- Test source syntax, Node tests, real PostgreSQL integration and Playwright Android viewport flows; report failing or unverified checks honestly.
- Preview first. Never auto-merge or release into VK production, enable rewards/payments/ads, or spend money without owner approval.
