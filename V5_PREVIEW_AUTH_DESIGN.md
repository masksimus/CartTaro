# Temporary signed VK verification for V5 Preview

**Scope:** Only `feature/tarot-v5-release-candidate` running in Vercel `VERCEL_ENV=preview` and with `TARO_V5_UAT_MODE=true` and a valid allowlist. It is not a new public authentication service.

For test Preview branches, Vercel's `VK_PROTECTED_KEY` remains Production-only. Instead of copying a confidential signing key into Preview, V5 forwards the original Bearer signed launch to the *fixed* V4 Production `GET /api/v2/progress` endpoint to verify VK signature, user ID, app ID and freshness. V4 endpoint is **read-only**, returns HTTP 200 only for a verified signed launch. V5 discards the upstream progress response. Only after 200 does it use the signed user ID for the new `tarot_v5_game` database. A separate allowlist restricts V5 access to one tester. This is a limited UAT dependency; it cannot be enabled for the actual published V5 production environment.

- Reject missing, malformed, duplicate-user-ID launches before delegation.
- A V4 response 401 is forwarded as 401; timeouts, redirects and other responses fail closed as 503.
- The upstream host is hardcoded (not from user input) to prevent SSRF.
- Never send private VK parameters to logging, client responses, third parties or storage.
- V5 signs no tokens, and V4 is not modified. No V4 database writes.
- Do not roll this temporary delegation into public V5 production. On production, direct `VK_PROTECTED_KEY` verification remains required.
- `TARO_V2_WRITES_ENABLED` must stay disabled until signed V5 UAT verifies account binding and authorization.
