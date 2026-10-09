import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /**
     * The contracts workspace is a separate hardhat toolchain with its own
     * dependencies, and `tsconfig.json` already excludes it for the same
     * reason. Linting it from here judged hardhat scripts against this app's
     * rules while their own types were not even installed, so the only way to
     * satisfy the no-any rule was to annotate types the checker could not see.
     * Hardhat compiles and tests that workspace in its own CI job.
     */
    "contracts/**",
    /**
     * Generated from contracts/verify/VerifySim.sol by
     * scripts/build-verify-sim.mjs. Editing it to satisfy a lint rule would be
     * undone by the next build.
     */
    "lib/verify/sim-artifact.ts",
  ]),
  {
    /**
     * Two React compiler rules are warnings here rather than errors.
     *
     * Not because the advice is wrong. Because on this codebase they are mostly
     * not finding bugs, and a gate that fails on things that are not bugs gets
     * ignored, which costs more than it saves.
     *
     * `purity` was checked case by case. Three of its four reports are inside
     * event handlers, not render: the id built in `AlertsPanel.add` and the swap
     * deadline in `TradePanel` both run on a click, and the rule simply cannot
     * prove it. The fourth, in `LiveBoard`, reads `Date.now()` during render and
     * would be a real hydration hazard, except `at` is null until a refresh so
     * it never runs on the server, and the component is not imported anywhere.
     *
     * `set-state-in-effect` reports fourteen sites, and the bulk are deliberate
     * hydration-safe patterns with comments saying so: the sidebar starts
     * expanded on both sides and reads localStorage after mount precisely so the
     * rail does not snap width during hydration, and `InstallPrompt` reads the
     * user agent after mount for the same reason. Rewriting those to satisfy the
     * rule would replace working, documented, server-safe code with
     * `useSyncExternalStore` across wallet tracking, currency, alerts, the trade
     * panel and sign-in, which are the surfaces most expensive to break.
     *
     * Two genuine instances were fixed rather than downgraded: the search box in
     * `Filters` now adjusts during render, and `Screener` holds no mirrored prop
     * state at all.
     *
     * Kept as warnings so the reports stay visible, and scheduled into the
     * Phase 8 quality pass, where each can be converted on its own merits.
     */
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
