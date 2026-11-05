# Codex implementation task — «Путь Арканов» V6 (inspired by the *game loop* of «Печенька», not its assets)

**Owner request:** Build a fully functioning, production-quality VK Mini App tarot game with engaging daily-return mechanics comparable in completeness to [«Печенька»](https://vk.com/cookiesapp), while creating an **original** visual identity, text, assets, architecture and game logic. This is a development assignment, **not** just a concept, screenshot, prompt, template, or technical plan.

## Repository and safe scope

- Repo: `masksimus/CartTaro`.
- **Your writable branch:** `feature/tarot-v6-cookie-inspired-20261105`; base `release/tarot-v5-prod-stage-20261105`.
- Existing V5 stage: [arkany-v5-2026.vercel.app](https://arkany-v5-2026.vercel.app/release/index.html); currently independent of published VK app.
- Existing VK Mini App ID: `54582199`. **Never change the app's public launch URL / VK production settings** without the owner's explicit go-live approval.
- **Never modify `main`, `deploy/tarot-v4-uat-20261105`, `release/tarot-v5-prod-stage-20261105`, V4 deployment or V4 Neon DB.** No automatic merges. Keep all V6 work isolated.
- V6 may use existing V5 signed VK launch verification + dedicated PostgreSQL storage as a safe base; do not reduce signed-request protections or mix V4/V5 public, tester and demo data.
- Current staging Production flags **must remain fail-closed**: `TARO_V2_WRITES_ENABLED=false` and `TARO_V5_PUBLIC_RELEASE_CONFIRMED=false` until explicit owner approval. Don't touch real rewards, payments or ads in live production.

## Read before coding

1. Inspect all source, scripts, tests, history and existing release docs. Identify the actual runnable frontend, backend route wiring, tests and database tables before editing.
2. Inspect official [VK Bridge](https://github.com/VKCOM/vk-bridge), [VK Mini App scaffolding](https://github.com/VKCOM/create-vk-mini-app), VK platform documentation and the current app's VK permissions. Pin reviewed dependency versions. Avoid unreviewed third-party snippets and external JS CDNs on the critical path; vendor/build audited VK Bridge locally.
3. Study the product loop (not visuals) of «Печенька» using [LUNA games case](https://lunagames.ru/pechenka/) and [developer story](https://t-j.ru/vk-cookie-story/): simple tactile daily reveal, topic categories, collection/progression, rewards, quests, profile, repeat visits and sharing.
4. All artwork, fonts, labels, text, colors, iconography, animations and compositions must be original/licensed. **Never clone «Печенька»'s UI, cookie art, 3D models, sound, graphics, branding, commercial copy, rewards, rankings, assets or code.**

## Product outcome: a playable V6

Implement a cohesive **mobile-first** tarot game, not an admin dashboard.

### First session (zero friction)
- Original artistic direction: warm ink/paper/engraving with readable typography and a distinctive card back, **not** violet cookie UI, generic neon/gradients, or generic AI art.
- First screen shows today's tarot deck and a clear touch target **«Открыть карту дня»**. Tap → physically convincing flip/reveal with animation fallback for reduced motion → readable contextual interpretation → **«Сохранить»** and **«Поделиться»** options (use official VK methods where allowed).
- If launch lacks a valid signed VK payload, offer a **clearly labelled local demo** of the reveal and UI **without calling protected endpoints, creating an account, or granting rewards**. Never fabricate a signed VK launch.
- Show an actionable empty/error state for offline, blocked DNS, failed assets or stale VK Bridge: retry, alternative test link, and clear explanation. Do not freeze indefinitely at “checking launch parameters”.
- No external network calls to unrelated domains at start; package essential UI, fonts, art and VK Bridge with the app.

### Core playable navigation
- Bottom navigation with compact mobile labels: **Сегодня**, **Расклады**, **Коллекция**, **Задания**, **Профиль**. Safe-area padding for Android/VK WebView; keyboard and touch support.
- **Today:** selected daily Arcana, theme, persistent server date, repeat-view prevention, progression meter, streak.
- **Readings:** one-card or three-card draw with unique thoughtful interpretations for topic choices (например: отношения, работа, развитие, настроение). Use existing backend signed routes; store only what backend supports. Draw should have an intuitive animated card interaction and a complete result screen. No claims of factual predictive powers.
- **Collection:** 22 Major Arcana with actual images, “unknown/unlocked” states, detail view, names/meaning, collection completion. Respect correct legal provenance and licensing; replace any missing/unreachable art with local fallback.
- **Quests:** achievable daily tasks and visible completion state. Only reward if signed server authorizes in later release; no spoofed balances or client-awarded points.
- **Profile:** nickname/avatar if permitted and explicitly provided by VK, game progress and streak, help/settings, privacy/rights information and data deletion request route (server-validated, no auto-delete of real users during tests).

### Polish and retention
- First-class portrait 320/360/393/430px and 1.25x/2x device pixel ratios; 44px touch targets, visible focus, accessible contrast, text overflow-safe fonts, dynamic theme as allowed.
- Tactile card stack, reveal, success/failure feedback and simple transitions; maintain 60 fps on common Android. Keep animations performant and respect `prefers-reduced-motion`.
- Original in-app copy, no coercive gambling-like mechanics and no forced sharing. Share only on user action. No paid/advertising SDK without approval and verified compliance.
- Deterministic day-based game loop with server as authority for player state; avoid duplicate payouts and races.

## Reliability: resolve the user's repeated “page unavailable” reports

The existing Vercel `.vercel.app` domain was reachable from some Moscow networks but timed out on others. **A READY deployment is not a mobile reachability proof.**

- Identify DNS/network reachability independently of runtime JS and signed VK startup; do not claim that frontend code changes fix provider routing.
- Package all critical dependencies locally, including VK Bridge JS, web fonts and required art; remove the unpkg.com startup dependency.
- Provide a healthy **isolated alternate host** reachable on Android from the user's location / Russian mobile networks. Candidate host choices must be tested for regulatory and platform compliance, uptime, no paid subscriptions without permission; don't assume GitHub Pages or Vercel can be reached on the device.
- Build a public, anonymous **static showcase/demo** on an allowed host with read-only local state, and a separate secure VK signed game flow; demo must never expose authenticated API data. Full game still requires real VK signed launch and server verification.
- Test TLS, DNS, status codes and asset loading from multiple relevant networks, then ask the owner for a single Android VK test confirmation where access to their actual handset is unavailable.

## Technical and data requirements

- Reuse hardened existing `server/src/auth.mjs`, `server/src/api-v2-handler.mjs` and `server/src/pg-store.mjs` where compatible. Preserve HMAC verification and freshness; no launch tokens in URL after initialization, logs, telemetry or localStorage.
- Keep backend `TARO_V5_DATABASE_URL` dedicated, ensure no V4 reads/writes, and no developer/tester DB fallback.
- If adding migrations or endpoints, use additive migrations, documented rollback and actual PostgreSQL integration tests. **Never run destructive SQL against live user data.**
- Do not put real `VK_PROTECTED_KEY`, Neon DSNs or user IDs in issues, Git, screenshots, CI artifacts, client bundles or console logs.
- Maintain resource efficiency and avoid injecting third-party trackers before consent. Respect VK Mini Apps and privacy/legal requirements; mark unfinished items honestly.

## Execution — Codex must implement, test, fix, and report

1. Create a compact screen flow and visual design tokens; then **implement real screens, transitions and game states** on this branch. No "mock UI" delivered as a finished app.
2. Implement local-demo startup and on-device error recovery; preserve signed VK production logic and server integration.
3. Build/bundle locally pinned VK Bridge (review license), locally hosted critical assets and fallback graphics.
4. Add automated unit + browser E2E tests: unsigned demo, invalid signature rejection, signed VK user progression, duplicate claims, persistence, 1/3-card spreads, disconnected network, blocked CDN, reduced motion, viewport 320/360/393/430.
5. Run `node --check`, `node --test`, PostgreSQL integration tests, Playwright in CI. Make failures actionable and fix them.
6. Test on an isolated preview; obtain the owner's actual phone/UAT confirmation before declaring “works on Android.” Provide working demo URL **only after independently verified**; do not change existing VK public URL, production deployment or payment settings.
7. Prepare a PR **against this V6 feature branch or the isolated V5 stage branch as appropriate**, but leave it unmerged and do not deploy to the owner's public VK app. Include before/after Android screenshots, test logs, security checks and precise completed/incomplete checklist.
8. Never say “production-ready” if VK signed-launch, app-domain allowlist, cross-border data/privacy, account deletion or phone reachability remain unverified.

## Definition of done

- Real playable, aesthetically coherent V6 with original branding.
- Local demo opens without signed VK launch; authenticated game requires and verifies signed VK credentials.
- Five navigation areas work; 1/3-card spreads work; 22 cards are available and legible; app doesn't stall on 3rd-party CDN.
- No unauthorized client writes, no V4 regression, no leakage of secrets/user data; test suite green.
- New **independently tested Android-accessible** preview/demo URL, GitHub PR, and release checklist. If any deliverable is blocked, explicitly state why and leave the public VK app unchanged.

**Do not stop at planning. Implement and verify the result within available tools/permissions.**
