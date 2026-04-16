# Claude Code rules for this repository

These rules apply to every Claude Code session in this repo. Follow them
without being asked.

## Bump the app version on every revision

Every commit that changes user-visible behavior, UI, API routes, or any
runtime code MUST also bump `APP_VERSION` in `lib/version.ts` in the same
commit.

- The value renders in the bottom of the sidebar (see
  `components/NavBar.tsx`) so the user can visually confirm that Vercel has
  picked up the latest deploy.
- Increment the patch component (e.g. `0.05` → `0.06`). There is no formal
  semver discipline — the goal is simply that the number changes every time
  a new deploy goes out.
- Documentation-only changes to Markdown files in the repo root (like this
  one) still count as a revision: bump the version.
- If you make multiple commits in one working session, bump the version in
  the final commit of the session at minimum. It is fine (and encouraged)
  to bump on every commit.

If you forget, the next session will bump twice and that is fine — the only
failure mode is forgetting altogether, because then the user cannot tell
from the sidebar whether their change is live.

## Branching

The user will tell you which branch to develop on via the session harness
("Develop on branch `<name>`"). Never push to a different branch without
explicit permission in the current session.
