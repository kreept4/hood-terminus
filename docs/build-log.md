# Build log

One entry per phase of `13-hackathon-build-plan.md`. The README's "Built during
Crypto World's Fair" list is generated from this file.

## Phase 0: setup and history

**Date:** October 6, 2026

**What changed**

Rewrote the repository history so the pre-hackathon project is the first commit
and every later commit is hackathon work. `main` went from two commits to three:

1. `Import v1, built September 3 to 11, 2026, before Crypto World's Fair`
2. `Add MIT license and .gitignore`
3. `Add Verify: pre-trade sell simulation for Robinhood Chain tokens`

Version 1 came from the `rhc-terminal` folder, 234 files with their original
modification times recorded in `_file-dates.txt`. Generated build output was left
out of the import: the compiled contract artifacts under `contracts/artifacts`,
the TypeScript build cache `tsconfig.tsbuildinfo`, and `design/__pycache__`.
`__pycache__/` was added to `.gitignore`. That took the repository from 53.6 MB to
2.9 MB.

Corrected the hackathon disclosure in `README.md`. The previous wording said the
import contained v1 "exactly as it was deployed" and named no omissions, which
was not accurate once build output was dropped. It now states the production ship
time, names all three kinds of omitted build output, and points to
`_file-dates.txt` as the evidence for the date range.

Before this phase, `main` held only the license and Verify commits, so the full
application and the Verify feature had never existed in one tree. They do now.

**What was tested**

- All 234 imported files confirmed byte-identical to the source folder by md5,
  with modification times preserved.
- File dates verified to fall between 2026-09-03T16:46:49Z and
  2026-09-11T10:19:07Z, consistent with the 10:21 UTC ship time.
- Secret scan over every imported file: no private keys, seed phrases, Supabase
  service role keys, provider URLs with embedded keys, Privy secrets, Stripe
  keys, JWTs, or 64-character hex values assigned to a key, secret, private,
  signer or deployer name. Every credential is read through `process.env`. One
  Infura project ID in the contract build output traced to `forge-std`'s bundled
  default endpoints, a third-party public value, and that output is no longer in
  the repository.
- `git log` confirmed three commits in the required order with no build output
  tracked.
- Branches `v1-import` and `build-plan` deleted after the push; the plan is
  preserved here as `13-hackathon-build-plan.md`.
