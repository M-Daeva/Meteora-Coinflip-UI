# Coinflip · Solana devnet

A small React app that walks through a full on-chain flow on devnet:

1. **Claim** test USDC (quote mint) from the faucet program.
2. **Swap** USDC → base mint on a Meteora DBC virtual pool.
3. **Bet** base mint on heads/tails. The coinflip program requests randomness from ORAO VRF.
4. **Wait** for fulfillment (a spinning coin), then **settle** the bet and see the payout.

Stack: TypeScript, Vite, React 19, Tailwind CSS v4, TanStack Query, `@solana/wallet-adapter` (Wallet Standard discovery, so Phantom / Solflare / Backpack show up without per-wallet adapters), Anchor.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
```

Copy `.env.example` to `.env` and set `VITE_RPC_URL` if the public devnet endpoint rate-limits you. Your wallet needs to be on devnet with a bit of SOL ([faucet.solana.com](https://faucet.solana.com)).

## How it works

| Concern | Where |
|---|---|
| Contract helpers (unchanged) | `src/common/` |
| Wiring helpers to the wallet + RPC | `src/hooks/useHelpers.ts`: the wallet-adapter `AnchorWallet` already matches `common`'s `TxSigner`, so it's passed to `RpcProvider` directly |
| Protocol data (mints, decimals, limits) | `src/hooks/useProtocol.ts`: read from the coinflip + faucet config accounts |
| Live balances | `src/hooks/useBalances.ts`: TanStack Query plus `connection.onAccountChange` on the ATAs and the wallet. A transfer made from the wallet app updates the page immediately; a 30 s refetch covers dropped websockets |
| Bet nonce persistence | `src/lib/betStore.ts`: the nonce goes to `localStorage` (per wallet) **before** the bet tx is sent and is removed only after settlement. Reloading resumes the flow; bets that never landed or were settled by someone else are cleaned up automatically |
| VRF polling | `src/hooks/useCoinflip.ts`: `useBetStatus` polls the bet account and the ORAO randomness account every second until it's fulfilled |
| Tx results | `src/lib/activity.tsx`: every send returns a Solscan link or an error turned into a readable sentence by `src/lib/errors.ts`, which parses Anchor logs, DBC/DAMM/ORAO IDL error codes, SPL token errors, wallet rejections and RPC failures |

`tsconfig.json` sets `noImplicitAny: false` only because one line in `common/helpers/orao-vrf.ts` doesn't pass it, and `common` is kept as is. `src/common/account` (EVM code) is excluded from type-checking and is never bundled.

## Deploying for free

It's a static SPA (`npm run build` → `dist/`), so any static host works:

- **Vercel** (recommended): import the GitHub repo. It detects Vite (build `npm run build`, output `dist`). Add `VITE_RPC_URL` under Environment Variables. Every push gets a preview URL.
- **Netlify**: same steps, build `npm run build`, publish `dist`.
- **Cloudflare Pages**: same steps. Generous free bandwidth.
- **GitHub Pages**: free, but you need a GitHub Action and `base: "/<repo>/"` in `vite.config.ts`.

Note: `VITE_RPC_URL` ends up in the client bundle. Use a devnet-only key and restrict it to your domain in the RPC provider's dashboard.
