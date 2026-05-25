# Security Policy

## Sensitive Data Rules

Do not commit:

- `.env` files or real environment-specific config
- API keys, OAuth secrets, service-role keys, database passwords, private keys, certificates
- Real user screenshots, private portfolio data, account handles that are not intentionally public test fixtures
- Raw exports from production databases or storage buckets

Allowed in the repository:

- `.env.example` with placeholder values only
- Synthetic seed data
- Local development URLs such as `http://localhost:4317`

## Pre-Push Checklist

Run these before pushing:

```bash
git status --short
git ls-files
rg -n "(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY|SUPABASE_SERVICE_ROLE|SERVICE_ROLE|password|passwd|secret|api[_-]?key|token|PRIVATE_KEY|client_secret)" .
find . -path ./.git -prune -o -type f -size +1M -print
npm --prefix backend test
```

## GitHub Repository Settings

Recommended settings:

- Keep the repository private until the product and data model are ready for public review.
- Enable GitHub secret scanning and push protection.
- Enable Dependabot alerts.
- Require pull request review before merging into `main` once collaborators are added.
- Protect `main` from force pushes.

## Incident Handling

If a secret is committed:

1. Revoke the secret immediately in the upstream provider.
2. Replace it with a new value.
3. Remove it from git history only after rotation; history cleanup alone is not sufficient.
4. Document what happened in a private incident note.

