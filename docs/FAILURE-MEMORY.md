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


| 2026-11-03 | Daily UI radically differed from the main App despite being called responsive | Daily created a second sage-green editorial theme and a nested `<main>` under the host `main[data-level]` 440px container, causing conflicting global layout rules | PR #32 deletes independent palette/layout overrides; inherits exact host 8-bit tokens, square corners, hard shadow, and width; nested main changed to div | Source fix; device screenshots pending |
| 2026-11-03 | Itinerary lacked venue images and one-tap navigation | Cards showed text and Google Maps *search* only; no images or direct routing target | PR #32: Places photos via `api/place-photo.ts`, short-lived URI and author attribution, explicit missing-photo UI, `mapsNavigationUrl` with destination_place_id + walking navigation | **Preview Google photo API 3/3 HTTP 200**; browser UX pending |
| 2026-11-03 | Real route API test revealed Routes 403 | Preview actual Google Text Search and Place Photo calls succeeded, but Routes ComputeRouteMatrix returned HTTP 403 | Keep venue-level navigation and honest fallback, never fabricate ETAs. Enable Google Routes for existing GCP key/billing/restrictions and rerun smoke | **OPEN P0** |
| 2026-11-03 | External temporary QA function imported sibling `api/daily-route.ts` and returned 500 | Vercel lambda did not package sibling `api/*.ts`; `ERR_MODULE_NOT_FOUND` in preview runtime log | Temporary smoke was moved inside the same route handler to exercise real POST, then removed before release | Fixed; no QA endpoint in release |
| 2026-11-03 | Per-stop Shuffle risked losing other chosen stops | Separate client/server state paths were not tested end-to-end | Real preview internal-POST smoke: cafe place ID changed, meal and fixed PARCO place IDs unchanged | Verified server-level PASS; UI E2E pending |

## Mandatory release gates
1. Confirm env names and each Google API separately (Text Search / Details / Photos / Routes) without printing secret values.
2. Run typecheck, unit tests, build, and API bundle check; record commands, exit codes and commit SHA.
3. Smoke POST real `/api/daily-route` on production with a geocodable start, named stops, a fixed appointment and one-stop Shuffle; verify response fields and failure behavior.
4. Run responsive iPhone Safari/WebKit, tablet and desktop visual/interaction checks; record screenshots or a precise blocker.
5. Merge/deploy only after checks; record production deployment ID and a checker VERDICT. No evidence = FAIL, not inferred PASS.
