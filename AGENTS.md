# Agent instructions

This is a DeepSpace SDK app (Cloudflare Workers + React, deployed to `<name>.app.space`).

- Before any DeepSpace work, read and follow the DeepSpace skill: `.agents/skills/deepspace/SKILL.md`
  (same file at `.claude/skills/deepspace/SKILL.md`). Vendored from github.com/deepdotspace/deepspace-skill @ dadfa91.
- The docs at https://docs.deep.space are the authority (`/llms.txt` index, append `.md` to any page).
- Design decisions and running progress: `docs/progress.md`. Specs: `docs/superpowers/specs/`.
- Never run `deepspace push`, `deepspace deploy`, `app undeploy`, `app transfer`, or `app collaborators` unless
  your task explicitly says to. The first deploy permanently latches the app's source authority.
- Secrets only via `npx deepspace secrets`; never in `.dev.vars`, commits, or logs.
