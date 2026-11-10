/**
 * Stryker mutation testing config.
 *
 * Scope is deliberately narrow: only src/placeKind.ts (the classifier at the
 * centre of the PR #38 failures) is mutated, and only with the vitest runner.
 *
 * NOTE: `checkers` is intentionally empty. Enabling the TypeScript checker
 * fails the dry-run compile with TS5056 (Cannot write file 'src/insignia.d.ts'
 * because it would be overwritten by multiple input files): the repo has both
 * src/insignia.ts and src/insignia.tsx, and the checker's declaration emit
 * collides on the same output name. Mutants are still validated by vitest
 * (a type-breaking mutant fails its tests); only the checker's early
 * interception is missing. Do not re-enable the checker without first
 * renaming one of the two insignia files.
 *
 * `thresholds.break` is 95. Observed ceiling 98.24%–98.82% (167–168/170
 * scored) across four runs on main 5fa0a2e6: the score fluctuates run to run
 * because Stryker classifies borderline mutants as Timeout under timing
 * pressure (dry run 11 s vs 15 s, total 2m50s vs 3m55s). 95 sits ≥3.2
 * points below the lowest observed score. 98 would be too tight: only
 * 0.24 points of headroom above the low end, and one new equivalent
 * mutant (−0.59) would drop the score to 97.65, below 98.
 * No top-level `tsconfig` option: Stryker 10 warns it is unknown.
 */
export default {
  mutate: ['src/placeKind.ts'],
  testRunner: 'vitest',
  checkers: [],
  concurrency: 2,
  thresholds: { break: 95 },
};
