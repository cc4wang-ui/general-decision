# General Decision — STATE.md
> Canonical current project status. Updated 2026-11-03 JST. Read this before making changes.
> Repo: cc4wang-ui/general-decision | Production: https://general-decision.vercel.app
> Historical `state/decide-mvp-build.md` describes September MVP, NOT current acceptance.

## 1. Verified facts
- Main commit `9f8cb4cc8dea8e4f2a731f8cdb2bac075f07c7d2` (PR #31) deployed to Vercel production, deployment `dpl_7sddcXHb633uyecLH4cFrhmWeMNM`, state **READY** on 2026-11-03. READY verifies deployment status, **not** real-world API functionality or UX.
- PR #27 introduced local-first daily context, FIT-EASY preference, daily tasks and persisted state. PR #28 added per-stop shuffle, custom place, fixed appointments and detail cards. PR #29 redesigned the daily page mobile-first. PR #30 added Google Places-backed named venue search and loading/error feedback. PR #31 added Google Routes WALK matrix, ETAs, fixed-time lateness alerts and scheduler tests.
- `GOOGLE_PLACES_KEY` and `ANTHROPIC_API_KEY` names exist in Vercel production/preview environment configuration (2026-11-03, metadata only). Their actual values, validity, billing permissions, Places API (New) and Routes API enablement have **not** been independently verified.
- The daily state uses browser `localStorage` key `decide.daily.v1`; it is not synced between devices and does not automatically inherit ChatGPT memories.
- UI: `src/dailyDecision.tsx`, `src/dailyDecision.css`; discovery endpoint: `api/daily-route.ts`; walking scheduler: `src/dailyRouting.ts`; scheduler tests: `tests/unit/dailyRouting.test.ts`.
- A preview build of the route-time branch was READY. An earlier build failed TypeScript checks in newly introduced tests and was fixed by typing fixtures; this was followed by a READY build.
- Existing historical `state/decide-mvp-build.md` and `DEPLOY.md` contain stale deployment and credential status. Do not treat them as live facts.

## 2. General rules
- Product is a **real, executable daily itinerary**, not a generic task list. Recommend specific verified places, preserve user-specified destinations and existing appointments, minimize detours, and show actionable details and reasons.
- One-stop Shuffle must change only the target venue and then recompute travel times, while preserving the other chosen stops, completed tasks and fixed appointments.
- Never invent a venue, opening status, route time, inventory, ticket, reservation or API success. Distinguish Places search results from availability and Routes walking ETA from guaranteed arrival.
- Fail closed when API or geocoding fails. Preserve the previous itinerary and show a visible error, rather than silently substituting a generic plan.
- Mobile-first: narrow iPhone layout, legible itinerary cards, touch-friendly controls, responsive tablet/desktop; interactive states must show loading, result and failure.
- Surgical changes only. Before release, run typecheck, unit tests, build, API smoke, route edge cases and browser/device checks. Require independent checker verdict where available; if unavailable, explicitly mark verification incomplete.
- User is nontechnical and prefers a working result to setup instructions. Avoid requiring manual inputs except location, must-visit places and fixed appointments.
- Do not write to the Chief-of-Staff Google Drive vault without explicit approval and preview.

## 3. Open failures
- **P0 — real production end-to-end unverified:** no confirmed successful POST to `/api/daily-route` using actual Places + Routes APIs. Vercel READY does not close this.
- **P0 — API prerequisites:** Places API (New), Routes API, billing, key restrictions and actual Google response permissions must be checked without exposing keys. The existence of `GOOGLE_PLACES_KEY` is not proof of authorization.
- **P0 — route algorithm correctness:** `src/dailyRouting.ts` uses a greedy nearest-feasible heuristic, not global route optimization. Fixed appointments may be late; alerts exist, but rigorous multi-appointment optimization, opening-hour constraints, overnight boundaries and transit choices remain unverified.
- **P0 — one-stop shuffle contract:** current `searchRoute` builds `replanDaily(state)` before search. Need regression tests to ensure user-selected venues and manually edited locations remain unchanged on one-stop Shuffle; the endpoint preserves candidate-backed stops, but UI/client transitions are not end-to-end verified.
- **P1 — UI device testing:** no verified iPhone Safari, iPad, desktop visual snapshots/touch E2E for the current version. Earlier user feedback explicitly reported poor responsiveness and ugly UI.
- **P1 — live shop information:** Places returns place metadata/open-now when supplied; current implementation does not enforce opening hours for planned arrival, confirm product inventory, exhibitions, reservations or admission.
- **P1 — current location:** no GPS. Default is Shibuya Station; a previous assumed residence label was replaced. Users must enter actual starting point.
- **P1 — stale documentation:** historical README/DEPLOY/status still describe September setup. This STATE is canonical until those docs are reconciled.
- **P1 — code hygiene:** prior preview build logs mentioned pre-existing TypeScript diagnostics in `src/diary.ts`; despite Vercel build READY, run `npm run typecheck` and record exact exit status before claiming TS clean.
- **P2 — sync and memory:** local-only browser persistence; no cross-device sync, no ChatGPT memory import, no canonical project vault sync.

## 4. Lessons learned
- Deploy READY ≠ verified functionality; every release needs real POST smoke and device UX evidence.
- The first daily feature was a static activity list disguised as an itinerary; named venues and real travel times are core requirements, not later enhancements.
- A mobile CSS makeover without real-world decision quality did not satisfy the user.
- A Google Places key in Vercel does not prove Places API (New), Routes API or billing are enabled.
- `api/` has previously failed only on Vercel due to missing `src/**` in lambda and incorrect default export. Keep `vercel.json` includeFiles and `export default {fetch: handler}`; run `npm run check:bundle`.
- Existing unit tests were not always run before merging. One preview failed TS2339 on `eta`/`conflict` test fixture types. Typecheck and build must be gates.
- User-editing a place must invalidate the previous candidate and ETA; otherwise stale location data contaminates route calculations.
- Avoid falsely interpreting fixed appointment or Google Maps metadata as verified reservation/stock.

## 5. Last session — 2026-11-03
- User explicitly requested the app be finished and deployed, then requested that project memory and failure history stay current.
- Main at `9f8cb4c`, Vercel production READY; this is a deployment observation only.
- Next acceptance sequence: verify Google API permissions and real production POST; test one-stop Shuffle preservation and fixed appointments; check arrival-time opening hours and route constraints; run iPhone/desktop UI tests; resolve any failures; only then label end-to-end PASS.
- Handoff: read this file, `docs/FAILURE-MEMORY.md`, `src/dailyDecision.tsx`, `src/dailyRouting.ts`, `api/daily-route.ts`, `DEPLOY.md`, and the current deployment logs. Do not start a parallel app.
