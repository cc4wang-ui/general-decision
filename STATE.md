# General Decision — STATE.md
> Canonical current project status. Updated 2026-11-03 JST. Read this before making changes.
> Repo: cc4wang-ui/general-decision | Production: https://general-decision.vercel.app
> Historical `state/decide-mvp-build.md` describes September MVP, NOT current acceptance.

## 1. Verified facts
- **PR #32 (2026-11-03)** unifies `今日行程` with the existing 8-bit App design tokens and 440px container; removes the conflicting nested `<main>`, adds Google Places on-demand photos with author attribution, exact Google Maps walking navigation and place detail links. The photo endpoint does not cache Google photo names/URIs.
- **Verified with actual Vercel preview calls (PR #32)**: `/api/daily-route` real server smoke returned 3 named Shibuya places and addresses, HTTP 200; `/api/place-photo` returned HTTP 200 for **all 3 corresponding Google Place IDs**; single-stop Shuffle returned a different cafe while preserving the selected meal and fixed PARCO appointment.
- **Confirmed blocker:** Google Routes matrix returned HTTP **403** in real preview runtime logs on 2026-11-03. The app now returns verified named venues and route-order approximation with a visible unverified-route warning, not fake ETAs or an empty itinerary. Direct Google Maps navigation uses Google's directions URL.

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
- **P0 — full production E2E unverified:** preview internal-POST smoke did verify actual Places responses, three photo responses, and per-stop Shuffle. Real Google Routes API returned 403, so **walking ETA is not available**. Real production POST and browser device interactions still need independent confirmation.
- **P0 — Google Routes API:** Google Places Text Search, Details and Photos are confirmed operational on preview. **Google Routes responds 403**, so API enablement, billing and restrictions for the existing key must be corrected outside this repository. Never ask user to paste a key. The existence of `GOOGLE_PLACES_KEY` is not proof of authorization.
- **P0 — route algorithm correctness:** `src/dailyRouting.ts` uses a greedy nearest-feasible heuristic, not global route optimization. Fixed appointments may be late; alerts exist, but rigorous multi-appointment optimization, opening-hour constraints, overnight boundaries and transit choices remain unverified.
- **P1 — Shuffle remaining coverage:** actual preview smoke PASS for alternate cafe + preserved meal/fixed stop; still missing browser E2E for manually overridden destinations, completed stops, multiple appointments and UI live feedback.
- **P1 — UI device testing:** PR #32 removed independent editorial style and nested `<main>`; uses original 8-bit tokens and original 440px host container. **No verified real iPhone Safari/iPad/desktop screenshots or touch E2E** yet.
- **P1 — live shop information:** Places returns place metadata/open-now when supplied; current implementation does not enforce opening hours for planned arrival, confirm product inventory, exhibitions, reservations or admission.
- **P1 — current location:** no GPS. Default is Shibuya Station; a previous assumed residence label was replaced. Users must enter actual starting point.
- **P1 — stale documentation:** historical README/DEPLOY/status still describe September setup. This STATE is canonical until those docs are reconciled.
- **P1 — code hygiene:** prior preview build logs mentioned pre-existing TypeScript diagnostics in `src/diary.ts`; despite Vercel build READY, run `npm run typecheck` and record exact exit status before claiming TS clean.
- **P2 — sync and memory:** local-only browser persistence; no cross-device sync, no ChatGPT memory import, no canonical project vault sync.

## 4. Lessons learned
- Deploy READY ≠ verified functionality; every release needs real POST smoke and device UX evidence.
- The first daily feature was a static activity list disguised as an itinerary; named venues and real travel times are core requirements, not later enhancements.
- A mobile CSS makeover without real-world decision quality did not satisfy the user. **Never create independent style tokens or nested `<main>` inside a screen:** these caused the severe mismatched UI; inherit host `src/styles.css` tokens, hard shadows and main width.
- A Google Places key in Vercel does not prove Places API (New), Routes API or billing are enabled. **2026-11-03: Text Search + Details + Photo work, Routes returns 403.** Test these as separate services.
- `api/` has previously failed only on Vercel due to missing `src/**` in lambda and incorrect default export. Keep `vercel.json` includeFiles and `export default {fetch: handler}`; run `npm run check:bundle`.
- Existing unit tests were not always run before merging. One preview failed TS2339 on `eta`/`conflict` test fixture types. Typecheck and build must be gates.
- User-editing a place must invalidate the previous candidate and ETA; otherwise stale location data contaminates route calculations.
- Avoid falsely interpreting fixed appointment or Google Maps metadata as verified reservation/stock.

## 5. Last session — 2026-11-03
- User explicitly rejected the mismatched Daily UI and generic non-navigable cards. PR #32 makes Daily consistent with main 8-bit App; each resolved stop has a real Google place, image (or explicit unavailable state), address, place detail and walking navigation link.
- Main at `9f8cb4c`, Vercel production READY; this is a deployment observation only.
- Preview validation: named places 3/3 PASS, real place photos 3/3 PASS, single-stop Shuffle preservation PASS, Routes matrix FAIL (403). Next: enable Google Routes for the existing key, test real walking ETA with fixed times, and run iPhone/desktop UI E2E before declaring full product PASS.
- Handoff: read this file, `docs/FAILURE-MEMORY.md`, `src/dailyDecision.tsx`, `src/dailyRouting.ts`, `api/daily-route.ts`, `DEPLOY.md`, and the current deployment logs. Do not start a parallel app.
