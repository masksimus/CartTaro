# CartTaro V4 — test deployment verification

Target project: `tarot-vk-uat-public-2026` (separate from VK published application).
Intended production tracking branch: `deploy/tarot-v4-uat-20261105`.
VK published app ID: `54582199`; its production URL and the GitHub `main` branch are not changed.

## Release gates

- GitHub CI with local PostgreSQL validated signed HMAC and state persistence.
- Public UAT mobile UI, public-domain RWS artwork, VK Bridge CDN and Neon database health passed on 320, 360 and 393 pixel mobile viewports.
- Authenticated real VK launch remains blocked on Preview by absent `VK_PROTECTED_KEY` (Production-only secret).
- Check that Vercel auto-deploys this branch into the *separate test project's* Production target without exposing or moving secrets.
- Verify `/api/v2/progress` returns HTTP 401 when called without a VK signature; if HTTP 503, the test is not yet ready.
- Do not enable writes or rewards until signed VK WebView testing confirms identity and persistence.

Added as a safe Git push to exercise the configured branch tracker. No game functionality is modified.
