# Noon Trader

Standalone trading repo extracted from the original `crypto-news-bot` monorepo.

Included surfaces:
- `apps/web`: signals, live charts, paper bot state, backtests
- `apps/worker`: paper trading worker
- `apps/backtest`: Hyperliquid-focused paper SMC replay runner
- `packages/trading`: shared trading engine and market-data utilities

## Setup

```bash
npm install
npm run db:generate
```

## Development

```bash
npm run dev --workspace @noon-trader/web
npm run dev --workspace @noon-trader/worker
npm run paper:run --workspace @noon-trader/backtest -- --days 7,30,60,90 --coins BTC,ETH,SOL
```

## Release Model

- GitHub is the source of truth
- Railway is the runtime
- use local `railway up` only for emergency debugging

See [railway-deploy.md](/Users/dodge/Desktop/Vibe%20Code%20Project/Content%20Creator%20Bot/noon-trader/docs/railway-deploy.md) and [release-workflow.md](/Users/dodge/Desktop/Vibe%20Code%20Project/Content%20Creator%20Bot/noon-trader/docs/release-workflow.md).
