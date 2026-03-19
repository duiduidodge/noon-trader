# Noon Trader Railway Deploy

Deploy `noon-trader` as separate Railway services and wire the worker into Noon Hub.

## Services

Create these Railway services in the `noon-trader` project:

- `noon-trader-db` as PostgreSQL
- `noon-trader-web`
- `noon-trader-worker`

## Dockerfile paths

Set these variables on each code service:

- `RAILWAY_DOCKERFILE_PATH=Dockerfile.web` for `noon-trader-web`
- `RAILWAY_DOCKERFILE_PATH=Dockerfile.worker` for `noon-trader-worker`

## Shared database variables

Use the trader database service values, not Noon Hub's database.

- `DATABASE_URL=<public or internal trader postgres URL>`

If the service runs on Railway and the database is in the same Railway project, use the internal URL.
If you run the worker locally, use the public URL instead.

## Web variables

Set on `noon-trader-web`:

```env
DATABASE_URL=<trader database url>
NEXT_PUBLIC_CHARTS_API_URL=wss://noon-hub-charts-api-production.up.railway.app
NODE_ENV=production
PORT=3012
```

## Worker variables

Set on `noon-trader-worker`:

```env
DATABASE_URL=<trader database url>
NODE_ENV=production
ENABLE_PAPER_TRADING=true
ENABLE_OPPORTUNITY_SIGNALS=true
ENABLE_EMERGING_MOVERS_SIGNALS=false
ENABLE_WHALE_SIGNALS=false
PAPER_TRADING_INITIAL_EQUITY=1000
PAPER_TRADING_ASSETS=BTC,ETH,SOL
PAPER_TRADING_INTERVAL_SECONDS=300
PAPER_TRADING_RISK_PER_TRADE=1
PAPER_TRADING_MIN_RR=2
PAPER_TRADING_MAX_DRAWDOWN=10
PAPER_TRADING_DAILY_LOSS_LIMIT=3
PAPER_TRADING_MAX_HOLD_HOURS=72
PAPER_TRADING_MIN_ADX=15
PAPER_TRADING_MIN_ENTRY_SCORE=45
PAPER_TRADING_REENTRY_COOLDOWN_HOURS=8
PAPER_TRADING_MAKER_FEE_BPS=1.5
PAPER_TRADING_TAKER_FEE_BPS=4.5
PAPER_TRADING_MAX_ADVERSE_FUNDING_HOURLY=0.0002
PAPER_TRADING_MIN_DAY_VOLUME_USD=25000000
PAPER_TRADING_MIN_OPEN_INTEREST_USD=10000000
PAPER_TRADING_STRONG_TREND_ADX=28
NOON_HUB_URL=https://noon-hub-api-production.up.railway.app
NOON_HUB_INGEST_KEY=<copy from noon-hub-api>
NOON_HUB_BOT_SLUG=noon-trader
NOON_HUB_BOT_NAME=Noon Trader
NOON_HUB_BOT_ENVIRONMENT=production
NOON_HUB_BOT_CATEGORY=trading
NOON_HUB_BOT_STRATEGY_FAMILY=smc
NOON_HUB_BOT_VENUE=hyperliquid
NOON_HUB_BOT_VERSION=1.0.0
```

## Database bootstrap

Once the trader database exists:

```bash
cd "/Users/dodge/Desktop/Vibe Code Project/Content Creator Bot/noon-trader"
npm run db:generate
npm run db:migrate:prod
```

Run that against the `noon-trader` database, not the Noon Hub database.

## Verify

After deploy:

- open the trader web domain
- confirm the worker service is healthy
- confirm Noon Hub shows `noon-trader` in `/hub/overview`
- confirm trader pages load against the trader database
