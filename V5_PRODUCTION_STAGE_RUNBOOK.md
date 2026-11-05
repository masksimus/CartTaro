# CartTaro V5 Production staging — launch safety gate

Release environment: a new, isolated Vercel project; **never** change V4 Production.
The V5 Production API has an additional server-side condition:
`TARO_V5_PUBLIC_RELEASE_CONFIRMED=true` before **any** daily reward can be granted. This is separate from `TARO_V2_WRITES_ENABLED` and `TARO_V2_PUBLIC_GAME_ENABLED`. Default is OFF.

Until confirmed, all user-specific requests still require valid signed VK launch and configured `TARO_V5_DATABASE_URL`. No fallback to `neondb`.

Do not put VK protected key or database passwords into GitHub. If the operator cannot create a new Vercel project owing to access error 403, release remains NO-GO. Setup must be completed through authorized user account; do not deploy onto the existing V4 project's Production target.

Publication prerequisites:
- Verify the application's data protection operator and contact details, legal basis, retention, deletion mechanism.
- Obtain independent reviewed launch configuration and permanent release domain.
- Verify genuine V5 signed VK login on Android and data / reward security using a non-production account and production-like setup.
- Explicit launch authorization from the owner.
