# Release Workflow

Recommended workflow for `noon-trader`:

1. Make and verify changes locally.
2. Commit to GitHub.
3. Let Railway deploy from the committed repo state.
4. Use direct `railway up` only for emergency debugging, not as the normal release path.

## Local checks before commit

```bash
cd "/Users/dodge/Desktop/Vibe Code Project/Content Creator Bot/noon-trader"
npm run db:generate
npm run typecheck
npm run build
```

## Railway deployment model

- GitHub is the source of truth.
- Railway is the runtime.
- `noon-trader-web` deploys from `Dockerfile.web`.
- `noon-trader-worker` deploys from `Dockerfile.worker`.

## Required secrets and variables

Set these in Railway, not in Git:

- `DATABASE_URL`
- `NOON_HUB_URL`
- `NOON_HUB_INGEST_KEY`
- any optional strategy/webhook keys

## Do not commit

- `.env`
- local database URLs you do not want in version control
- local artifacts
- generated backtest output

## Safe release rule

Do not shut down an older environment until:

- the new Railway deploy is healthy
- the worker is running
- Noon Hub shows the bot live
- the web app loads against the correct trader database
