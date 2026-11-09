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
 * No `thresholds.break` is set: the measured baseline is 48.24%
 * (170 mutants, 82 killed / 87 survived / 1 no coverage), far below any
 * useful gate. Add a threshold only after the surviving StringLiteral
 * mutants (mostly unasserted TYPE_KINDS / GENERIC_TYPES mappings) are
 * killed by stronger tests. No top-level `tsconfig` option: Stryker 10
 * warns it is unknown.
 */
export default {
  mutate: ['src/placeKind.ts'],
  testRunner: 'vitest',
  checkers: [],
  concurrency: 2,
};
