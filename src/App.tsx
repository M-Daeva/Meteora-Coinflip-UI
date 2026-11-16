import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BetSide } from "./common/interfaces/coinflip";
import { useProtocol } from "./hooks/useProtocol";
import { usePendingBets } from "./lib/betStore";
import { humanizeError } from "./lib/errors";
import { Balances } from "./components/Balances";
import { FaucetStep } from "./components/FaucetStep";
import { SwapStep } from "./components/SwapStep";
import { BetStep } from "./components/BetStep";
import { CoinStage } from "./components/CoinStage";
import { ActivityLog, Toasts } from "./components/Activity";
import { Button } from "./components/ui";

export default function App() {
  const protocol = useProtocol();
  const { publicKey } = useWallet();
  const bets = usePendingBets(publicKey?.toBase58());
  const [side, setSide] = useState<BetSide>(BetSide.Head);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          <img src="/coin.svg" alt="" className="size-8" />
          <div className="leading-tight">
            <p className="text-lg font-extrabold">Coinflip</p>
            <p className="text-xs text-haze">Solana devnet</p>
          </div>
        </div>
        <WalletMultiButton />
      </header>

      <div className="mt-6 mb-8 max-w-2xl sm:mt-10">
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl">Heads or tails, settled on-chain.</h1>
        <p className="mt-4 max-w-prose text-haze sm:text-lg">
          Claim test USDC, swap it on a Meteora bonding curve, and bet. ORAO's verifiable randomness decides the flip.
        </p>
      </div>

      {protocol.isPending && <p className="py-16 text-haze">Loading protocol accounts from devnet…</p>}

      {protocol.isError && (
        <div className="rounded-2xl border border-loss/50 bg-loss/10 p-6">
          <p className="font-semibold">Couldn't read the protocol from devnet.</p>
          <p className="mt-1 text-sm text-haze">{humanizeError(protocol.error)}</p>
          <Button variant="ghost" className="mt-4" onClick={() => protocol.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {protocol.data && (
        <>
          <Balances protocol={protocol.data} />
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-16">
            <div>
              <FaucetStep protocol={protocol.data} />
              <SwapStep protocol={protocol.data} />
              <BetStep protocol={protocol.data} side={side} onSide={setSide} hasActiveBet={bets.length > 0} />
            </div>
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <CoinStage protocol={protocol.data} side={side} />
              <ActivityLog />
            </aside>
          </div>
        </>
      )}

      <footer className="mt-20 border-t border-ink-3 pt-6 text-sm text-haze">
        Devnet only: tokens here have no value. Built with React, Anchor and the Solana wallet adapter.
      </footer>
      <Toasts />
    </div>
  );
}
