# General Decision — Failure Memory
> Updated 2026-11-04 JST. Historical facts and unverified risks are separated. For live status read root `STATE.md`.

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
| 2026-11-03 | Production readiness overstated | Vercel READY was reported without live POST, real iPhone or API permission evidence | Require real production smoke + mobile E2E before declaring feature PASS | Production POST smoke done 2026-11-04 (`/api/order`, `/api/daily-route`); real-device E2E still **OPEN P0** |
| 2026-11-03 | Routes API may fail despite env variable present | `GOOGLE_PLACES_KEY` exists but Routes API enablement/billing/permissions not proven | Check Google Cloud API status and real Routes response; fail closed | **OPEN P0** |
| 2026-11-03 | Shuffle may not preserve all user choices | Client replanning and server selection have separate state paths; insufficient regression coverage | Test custom/fixed/done/selected place retention with one-stop shuffle | **OPEN P0** |
| 2026-11-03 | Appointment planning may be suboptimal | Greedy walking scheduler, not time-window optimization; opening hours not considered at ETA | Test multi-appointment constraints and opening windows, label limitations | **OPEN P0** |


| 2026-11-03 | Daily UI radically differed from the main App despite being called responsive | Daily created a second sage-green editorial theme and a nested `<main>` under the host `main[data-level]` 440px container, causing conflicting global layout rules | PR #32 deletes independent palette/layout overrides; inherits exact host 8-bit tokens, square corners, hard shadow, and width; nested main changed to div | Source fix; device screenshots pending |
| 2026-11-03 | Itinerary lacked venue images and one-tap navigation | Cards showed text and Google Maps *search* only; no images or direct routing target | PR #32: Places photos via `api/place-photo.ts`, short-lived URI and author attribution, explicit missing-photo UI, `mapsNavigationUrl` with destination_place_id + walking navigation | **Preview Google photo API 3/3 HTTP 200**; browser UX pending |
| 2026-11-03 | Real route API test revealed Routes 403 | Preview actual Google Text Search and Place Photo calls succeeded, but Routes ComputeRouteMatrix returned HTTP 403 | Keep venue-level navigation and honest fallback, never fabricate ETAs. Enable Google Routes for existing GCP key/billing/restrictions and rerun smoke | **OPEN P0** |
| 2026-11-03 | External temporary QA function imported sibling `api/daily-route.ts` and returned 500 | Vercel lambda did not package sibling `api/*.ts`; `ERR_MODULE_NOT_FOUND` in preview runtime log | Temporary smoke was moved inside the same route handler to exercise real POST, then removed before release | Fixed; no QA endpoint in release |
| 2026-11-03 | Per-stop Shuffle risked losing other chosen stops | Separate client/server state paths were not tested end-to-end | Real preview internal-POST smoke: cafe place ID changed, meal and fixed PARCO place IDs unchanged | Verified server-level PASS; UI E2E pending |

| 2026-11-03 | Round 4–7 silently disappeared from production | Two workstreams on one Vercel project: core app shipped by direct upload while `main` stayed at Round 3; merging PR #27–#32 into `main` made Vercel's git integration redeploy production from `main` | PR #26 merged both lines. One deployment path only (git `main`); before any production action, check which deployment the alias points to and its source | Fixed 2026-11-04 |
| 2026-11-03 | Round 8 direct upload to production would have overwritten 今日行程 | Deploy decision based on a handoff that said "production = Round 7" without re-checking the live alias | Cancelled the build within ~20 s (`dpl_Fa2rMgQxuYeJDrbS9x5jAAk3RigP`); alias never moved. Never direct-upload production | Prevented |
| 2026-11-03 | Fixed appointments could never be added | `addFixedTask` regex written as `\\d` (literal backslash); `main`'s own unit test was failing at merge time | `bd884c4`. Unit tests are a merge gate | Fixed |
| 2026-11-03 | `check:bundle` failed on new API files | `api/daily-route.ts`, `api/place-photo.ts` exported only one named method | `984645e`: both named exports; wrong method → 405 | Fixed |
| 2026-11-03 | Relaxed scene fallback sent users to shops closing on arrival / not yet open | When no candidate passed scene rules, the whole batch was put back, including shops with < 10 min left or opening later | `viable` + `reachablePool`: open-on-arrival is never relaxed; nothing left → convenience-store rescue | Fixed (Round 10) |
| 2026-11-04 | Command said 「09:20 前吃完」 at a shop opening 10:00 | `sceneTimes` ignored opening time; quick meal/takeout allowed opening-soon shops | Quick meal and takeout require open on arrival; times start at opening (`opensInMin`) | Fixed (Round 10) |
| 2026-11-04 | 5 e2e failures labelled "Chromium difference" for weeks | 4 were a real layout bug (Google Maps attribution 11–13 px below the 375×667 first screen); 1 was a test race | Measure before blaming the environment. Attribution moved under place-meta; race fixed | Fixed; e2e 124/124 |
| 2026-11-04 | 「你在車上？」asked when the user had just waited in the menu | Location prefetched on menu entry went stale (> 60 s) by submit time | Re-fetch once on submit; ask only if still stale | Fixed |
| 2026-11-04 | Overnight work stalled 8 h | 4 parallel subagents hit the account 5-hour usage limit at ~00:00 JST; main thread had ended its turn and nothing woke it | ≤ 2 parallel subagents; leave a self-wake timer (background sleep) when waiting | Process fix |
| 2026-11-04 | Morning date dinner gets 4.1–4.2★, up to ~30 min walk | Nearby 4.3★+ restaurants not open yet; rating relaxed to best available | Needs Cross decision (recommend: accept best nearby + 15 min walk cap) | **OPEN** |

## Mandatory release gates
1. Confirm env names and each Google API separately (Text Search / Details / Photos / Routes) without printing secret values.
2. Run typecheck, unit tests, build, and API bundle check; record commands, exit codes and commit SHA.
3. Smoke POST real `/api/daily-route` on production with a geocodable start, named stops, a fixed appointment and one-stop Shuffle; verify response fields and failure behavior.
4. Run responsive iPhone Safari/WebKit, tablet and desktop visual/interaction checks; record screenshots or a precise blocker.
5. Merge/deploy only after checks; record production deployment ID and a checker VERDICT. No evidence = FAIL, not inferred PASS.
6. Before merging to `main`, confirm `general-decision.vercel.app` currently points to a `main` git deployment. Never direct-upload to production.
7. Run the full e2e suite (`npx playwright test --browser=chromium tests/e2e`); a failing test is a bug until measured otherwise.
