# Publishing Checklist

Use this checklist before pushing to GitHub.

## Scope

- Confirm `git rev-parse --show-toplevel` points to `portfolio-intelligence-tracker`.
- Confirm `git ls-files` only includes project files.
- Confirm no parent workspace files are staged.

## Secrets

- No `.env` files except `.env.example`.
- No private keys or certificates.
- No Supabase service-role key.
- No OpenAI/Anthropic/GitHub tokens.
- No real user portfolio data or private screenshots.

## Data

- Seed data must be synthetic.
- Example URLs must be fake or intentionally public.
- KOL handles in seed data must be placeholders unless explicitly approved.

## Repository

- A public repository is acceptable only after the checks above confirm it contains code, placeholder configuration and synthetic fixtures only.
- Enable secret scanning and Dependabot.
- Add branch protection before inviting collaborators.

## Private Beta Gate

- Run `npm run typecheck`, `npm run build`, `npm run test --workspaces --if-present`, and `npm run eval:rag --workspace @pit/api`.
- Execute `npm run smoke:beta --workspace @pit/api` against the target Beta service with two Supabase test users.
- Keep `BETA_SMOKE_ALLOW_DELETE` unset unless User A is a disposable validation account.
- If image storage is enabled, run smoke again with `BETA_SMOKE_IMAGE_PATH` and confirm signed URL isolation.
- Confirm Render logs do not expose provider keys, Supabase service-role key, signed URLs, raw research text, or Storage object paths.
