# General Decision — Failure Memory
> Updated 2026-11-03 JST. Historical facts and unverified risks are separated. For live status read root `STATE.md`.

| Date | Failure / symptom | Cause or evidence | Resolution / prevention | Status |
|---|---|---|---|---|
| 2026-09-15 | Production `/api/*` failed with `ERR_MODULE_NOT_FOUND: /var/task/src/cards.ts` | Vercel dependency tracing omitted `src/**` when imports used `.ts` specifiers | Keep `vercel.json` function `includeFiles=src/**`; run `npm run check:bundle` after API changes | Historically fixed; regression risk |
| 2026-09-15 | Requests hung, status 0, `WARN: default export returned a 'Response'` | Function-shaped default export treated as legacy Node handler; returned Response ignored | Use `export default {fetch: handler}`, not bare default handler | Historically fixed; regression risk |
| 2026-09 | Timezone-dependent diary tests fail in UTC | Assertions assumed Taipei time | Use `TZ=Asia/Taipei npm run typecheck && npm run test`; document test timezone | Known environment pitfall |
| 2026-09 | WebKit E2E blocked in one Linux environment | Playwright browser download restricted | Chromium result is not equivalent to Safari/WebKit PASS; keep explicit evidence | Environment-specific |
| 2026-11-03 | First daily planner had no specific places or reliable routes | Static task catalog/local choices mistaken for decision engine | Google Places integration PR #30, Routes scheduler PR #31 | Implementation present; live API unverified |
| 2026-11-03 | Poor mobile layout and weak UI feedback | Desktop-style inputs and unclear hierarchy on mobile | Scoped mobile-first stylesheet PR #29; busy/error/venue cards PR #30 | Device visual E2E still missing |
| 2026-11-03 | Route matrix branch build ERROR | `tests/unit/dailyRouting.test.ts` fixture inference omitted `eta` and `conflict` (TS2339) | Type fixtures as `ScheduledStop[]`; later preview READY | Fixed in branch; add typecheck gate |
| 2026-11-03 | Place override risk: old coordinates retained | Editing place text without invalidating cached `candidate`/ETA | Clear candidate and ETA on manual location change in PR #31 | Implemented; test pending |
| 2026-11-03 | Production readiness overstated | Vercel READY was reported without live POST, real iPhone or API permission evidence | Require real production smoke + mobile E2E before declaring feature PASS | **OPEN P0** |
| 2026-11-03 | Routes API may fail despite env variable present | `GOOGLE_PLACES_KEY` exists but Routes API enablement/billing/permissions not proven | Check Google Cloud API status and real Routes response; fail closed | **OPEN P0** |
| 2026-11-03 | Shuffle may not preserve all user choices | Client replanning and server selection have separate state paths; insufficient regression coverage | Test custom/fixed/done/selected place retention with one-stop shuffle | **OPEN P0** |
| 2026-11-03 | Appointment planning may be suboptimal | Greedy walking scheduler, not time-window optimization; opening hours not considered at ETA | Test multi-appointment constraints and opening windows, label limitations | **OPEN P0** |

## Mandatory release gates
1. Confirm env names and Google APIs without printing secret values.
2. Run typecheck, unit tests, build, and API bundle check; record commands, exit codes and commit SHA.
3. Smoke POST real `/api/daily-route` on production with a geocodable start, named stops, a fixed appointment and one-stop Shuffle; verify response fields and failure behavior.
4. Run responsive iPhone Safari/WebKit, tablet and desktop visual/interaction checks; record screenshots or a precise blocker.
5. Merge/deploy only after checks; record production deployment ID and a checker VERDICT. No evidence = FAIL, not inferred PASS.
