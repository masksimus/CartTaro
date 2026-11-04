# CartTaro V3 — One/Three-card readings (isolated VK developer pilot)

## Scope and release boundary

This feature is present **only** in branch \`feature/tarot-v3-interactive-spreads\` and in the separate Vercel testing project \`tarot-vk-uat-public-2026\`. The public VK Mini App \`54582199\` continues to load its existing GitHub Pages URL from \`main\`.

V3 introduces a reading room within the existing \`v2-pilot.html\`, with original symbolic card art rendered via HTML/CSS, flip animations, and Russian interpretations for 22 Major Arcana. This first art direction is stylized; it is not a claim that 22 individually illustrated paintings have been produced.

### Mechanics

- **One-card reading**: a single theme and reflection.
- **Three-card reading**: \`Что было / Что происходит / Куда направить внимание\`. Cards are distinct.
- The server uses \`node:crypto.randomInt\`, not client-controlled randomness, and returns validated titles, card names, upright/reversed interpretations and prompts.
- GET \`/api/v2/spreads/one\` and GET \`/api/v2/spreads/three\` are signed VK-HMAC-only, no query strings or bodies, no referrer and no caching.
- Readings are free, **do not** add a card to the collection, spend or add crystals, update the streak, or insert any database records. They are session-only, not history.
- UI supports pointer and keyboard input, 320/360/393 px Android viewports and reduced-motion preferences.
- Empty/unverified sessions cannot generate readings. No VK credentials or database passwords are included in the bundle or response.
- Guidance is entertainment/reflection, not predictions of the future.

### Verified QA

GitHub Actions workflow \`tarot-v2-postgres.yml\` on this branch:
- 38/38 Node server tests, including tampering, expired HMAC, no economy effects and distinct deck selection.
- 45/45 Playwright mobile tests against signed test VK launches and real CI PostgreSQL, including card flipping, three interpretations, keyboard access, temporary upstream errors and no currency mutations.
- CI contains only fixture credentials.

### Real VK UAT

- Keep existing VK mobile **developer URL**: \`https://tarot-vk-uat-public-2026.vercel.app/v2-pilot.html\`.
- Launch the app with the VK app administrator account as before. After signed VK Bridge verification, scroll to \`Ваши карты сегодня\`.
- Choose a one-card reading, flip to reveal the meaning.
- Choose a three-card reading, flip each card, see three different positions and guidance.
- Confirm the 10 crystals, streak 1 and saved Strength card (if still the same account and no new UTC day) remain unchanged after readings. Completing a daily reward and a reading are independent.
- Close and reopen the VK app; progress should be unchanged. The free readings are intentionally **not stored**.

### Rollback

Restore the previous READY Vercel deployment of \`tarot-vk-uat-public-2026\` using Vercel deployment rollback/redeploy. This only affects the isolated developer pilot; do not touch the public VK URL or \`main\`. The existing Postgres schema and tables remain untouched.
