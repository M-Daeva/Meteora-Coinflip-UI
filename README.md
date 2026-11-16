# Meteora Coinflip · Web UI

A web client for **[Meteora Coinflip](https://github.com/M-Daeva/Meteora-Coinflip)**, a Solana program that turns a coin-flip bet into a token swap. Each bet sells the player's tokens through a Meteora Dynamic Bonding Curve (DBC) pool, and ORAO VRF supplies verifiable randomness. The game has no house edge; the operator earns from swap trading fees.

That repository holds the on-chain program (Rust, Anchor), the TypeScript clients and the LiteSVM tests. This repository is the frontend that runs the whole flow against the program deployed on **Solana devnet**.

**[Live demo](https://meteora-coinflip-ui-flax.vercel.app)**

## What a player does

1. **Get test USDC** from a devnet faucet program. A countdown shows when the next claim is allowed.
2. **Swap USDC → base token** on the Meteora DBC virtual pool.
3. **Bet heads or tails** in the base token. The program sells the base token for USDC via CPI, checks bet limits, and requests ORAO VRF randomness.
4. **Wait for the oracle.** A 3D coin spins until the randomness account is fulfilled.
5. **Settle the bet.** The coin lands and the payout is shown. A winner receives 2× the USDC that came out of the swap.

## Engineering highlights

- **Live balances without reloads.** Balances are cached in TanStack Query and pushed by `onAccountChange` websocket subscriptions on the wallet and its token accounts. A transfer made from the wallet app shows up immediately. A slow refetch covers dropped sockets.
- **Bets survive a page reload.** A bet is identified on-chain by `(user, nonce)`. The nonce is saved to `localStorage` (per wallet) *before* the transaction is signed, and removed only after settlement. Reloading at any point resumes the flow. Bets that never landed, or that the worker already settled, are detected and cleaned up.
- **Every transaction gives a result.** Each send returns a Solscan link or one readable sentence. The error decoder handles Anchor error logs, custom error codes from the DBC, DAMM v2 and ORAO IDLs, SPL Token errors, wallet rejections, missing SOL, expired blockhashes and RPC rate limits.
- **Chain time, not device time.** Cooldowns are compared against the cluster's Clock sysvar (with a latency-corrected offset), so a misconfigured device clock can't distort countdowns.
- **Shared clients, not re-implemented ones.** The UI uses the program's TypeScript helpers (`src/common`) unchanged. A thin adapter passes the wallet-adapter `AnchorWallet` in as the helpers' signer, so instruction building, priority fees and simulation stay in one place.
- **Wallet Standard.** No per-wallet adapters. Phantom, Solflare, Backpack and other standard wallets are discovered automatically.
- **Responsive and accessible.** Works from 360 px phones to wide desktops, with keyboard focus states, live regions for status changes, and a reduced-motion fallback for the coin animation.

## Tech stack

TypeScript · React 19 · Vite · Tailwind CSS v4 · TanStack Query · `@solana/wallet-adapter` (Wallet Standard) · `@solana/web3.js` · `@coral-xyz/anchor` · `@solana/spl-token`

On-chain integrations: Meteora DBC, Meteora DAMM v2, ORAO VRF, Token-2022.

## Project structure

```
src/
├── common/               # program clients & IDLs shared with the main repo (kept unmodified)
├── hooks/
│   ├── useHelpers.ts     # binds common helpers to the RPC connection + connected wallet
│   ├── useProtocol.ts    # mints, decimals, bet limits, faucet params from config accounts
│   ├── useBalances.ts    # live SOL / token balances (query cache + websocket subscriptions)
│   ├── useCoinflip.ts    # place / poll / settle a bet
│   └── useChainClock.ts  # device ↔ cluster clock offset
├── lib/
│   ├── betStore.ts       # persisted pending-bet nonces (useSyncExternalStore, cross-tab)
│   ├── activity.tsx      # transaction runner: Solscan link or readable error
│   ├── errors.ts         # error decoder (logs, IDL codes, wallet/RPC failures)
│   └── format.ts         # bigint-safe amount parsing and formatting
└── components/           # steps, CSS 3D coin, balances, notifications
```

## Running locally

Requires Node 20+ and a browser wallet set to **devnet** with a little SOL ([faucet.solana.com](https://faucet.solana.com)).

```bash
bun install
bun dev        # http://localhost:5173
bun build      # typecheck + production bundle in dist/
```

The public devnet RPC is rate-limited. To use your own, copy `.env.example` to `.env`:

```
VITE_RPC_URL=https://devnet.helius-rpc.com/?api-key=...
```

## Deployment

The build output is a static SPA in `dist/`. It's deployed on Vercel: the Vite preset with `VITE_RPC_URL` set as an environment variable. The RPC URL ends up in the client bundle, so use a devnet-only key restricted to the site's domain.

## Notes

- Devnet only. The tokens have no value.
- The UI allows one open bet per wallet at a time.
- Win or loss is shown from the USDC actually paid out in the settlement transaction, not inferred client-side from the randomness.
