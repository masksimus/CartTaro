# V5 isolated Production-stage re-deployment check
Date: 2026-11-05.

Target Vercel project: `carttaro-v5-release-stage`, ID `prj_IQoxIKxggiLgYGcwZcZyB7kvxzGS`.
Expected branch: `release/tarot-v5-prod-stage-20261105`.

The protected environment variable `VK_PROTECTED_KEY` was added in Vercel Production *after* the previous READY deployment. This documentation-only commit triggers an isolated re-deployment to load it.

No protected key, signed launch, user ID or DB URL is stored here. This commit does not change the published VK application, the legacy V4 Vercel project, or `main`.

Safe staging flags to retain:
- `TARO_V2_PUBLIC_GAME_ENABLED=true`: use isolated `tarot_v5_public` database.
- `TARO_V2_WRITES_ENABLED=false`: no daily claims or draws.
- `TARO_V5_PUBLIC_RELEASE_CONFIRMED=false`: no public game economy without owner's explicit authorization.

Post-deploy checks: READY, Git SHA matches this commit, GET `/api/v2/status` read_only with rewardsEnabled false, `/api/v2/health` connected, anonymous `/api/v2/progress` unauthorized. Genuine signed VK Android UAT is a separate step.
