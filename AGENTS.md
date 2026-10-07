<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repo hygiene

- Never commit generated or scratch artefacts: browser profiles (`chrome-profile/`), screenshots, Playwright output, exported data dumps, one-off scripts. (The answer exports under `docs/data/` are the deliberate exception: they are the fixtures the dev boards are reseeded from.) Keep them in the session scratchpad directory, and add a `.gitignore` rule if a tool keeps writing one into the repo.
- Stage files by name (`git add <paths>`), never `git add -A` or `git add .`. Review `git status` before every commit and question anything you did not knowingly change.
- Schema changes ship as a numbered file in `supabase/migrations/` AND are applied to both the dev and prod Supabase projects before the code that needs them merges. The build runs no migrations.
