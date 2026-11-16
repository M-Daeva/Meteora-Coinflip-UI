import { useEffect, useMemo, useRef, useState } from "react";
import { BetSide } from "../common/interfaces/coinflip";
import { accountLink, txLink } from "../config";
import { useHelpers } from "../hooks/useHelpers";
import { tokenDelta, useBetStatus, useCoinflipActions } from "../hooks/useCoinflip";
import type { Protocol } from "../hooks/useProtocol";
import { betStore, usePendingBets } from "../lib/betStore";
import { formatUnits } from "../lib/format";
import { Coin } from "./Coin";
import { Button } from "./ui";

interface Result {
  nonce: number;
  side: BetSide;
  won: boolean;
  payout: bigint;
  signature: string;
}

const sideName = (s: BetSide) => (s === BetSide.Head ? "Heads" : "Tails");

export function CoinStage({ protocol, side }: { protocol: Protocol; side: BetSide }) {
  const { owner, helpers } = useHelpers();
  const ownerKey = owner?.toBase58();
  const bets = usePendingBets(ownerKey);
  const active = useMemo(() => [...bets].sort((a, b) => b.nonce - a.nonce)[0], [bets]);
  const status = useBetStatus(active);
  const { settleBet } = useCoinflipActions();
  const [settling, setSettling] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState<string>();
  const [elapsed, setElapsed] = useState(0);

  const phase = active ? status.data?.phase ?? "unconfirmed" : undefined;

  // bet closed by someone else (e.g. a settlement worker) or never landed → forget the nonce
  useEffect(() => {
    if (phase === "gone" && active && ownerKey) {
      betStore.remove(ownerKey, active.nonce);
      setNote(active.placeSig ? "That bet was already settled." : "The bet transaction never landed, so nothing was spent.");
    }
  }, [phase, active, ownerKey]);

  useEffect(() => {
    if (phase !== "waiting" || !active) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - active.createdAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase, active]);

  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active) {
      setResult(null);
      setNote(undefined);
      // on stacked (mobile) layouts the coin sits below the form: bring it into view
      if (window.matchMedia("(max-width: 1023px)").matches) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  async function settle() {
    if (!active || !owner) return;
    setSettling(true);
    const res = await settleBet(active.nonce);
    if (res.ok) {
      const payout = tokenDelta(res.tx, owner, protocol.quote.address);
      setResult({ nonce: active.nonce, side: active.side, won: payout > 0n, payout, signature: res.signature });
    }
    setSettling(false);
  }

  const spinning = !!active && phase !== "gone";
  const shownSide = result ? (result.won ? result.side : 1 - result.side) : active ? active.side : side;
  const { base, quote } = protocol;
  const betPda = active && owner ? helpers.coinflip.pdaBet(owner, active.nonce)[0].toBase58() : undefined;

  return (
    <section ref={ref} aria-labelledby="stage-title" className="rounded-[2rem] border border-ink-3 bg-ink-2/60 p-6 sm:p-8">
      <h2 id="stage-title" className="sr-only">
        Coin
      </h2>
      <Coin spinning={spinning} side={shownSide as BetSide} className="mx-auto w-40 sm:w-52" />

      <div className="mt-6 min-h-36 text-center" aria-live="polite">
        {!active && !result && (
          <>
            <p className="text-2xl font-bold">{owner ? `Calling ${sideName(side)}` : "Connect a wallet to play"}</p>
            <p className="mx-auto mt-2 max-w-xs text-sm text-haze">
              {note ?? "After you bet, the coin spins until ORAO's oracle posts randomness on-chain. Then you settle to see where it lands."}
            </p>
          </>
        )}

        {active && phase === "unconfirmed" && (
          <>
            <p className="text-2xl font-bold">Placing your bet</p>
            <p className="mt-2 text-sm text-haze">Approve the transaction in your wallet.</p>
          </>
        )}

        {active && phase === "waiting" && (
          <>
            <p className="text-2xl font-bold">Waiting for randomness</p>
            <p className="mt-2 text-sm text-haze">
              {formatUnits(BigInt(active.amount), base.decimals)} {base.symbol} on {sideName(active.side)}
              {status.data?.quoteAmount !== undefined && (
                <> ({formatUnits(status.data.quoteAmount, quote.decimals)} {quote.symbol})</>
              )}
              {elapsed > 0 && <> · {elapsed}s</>}
            </p>
          </>
        )}

        {active && phase === "fulfilled" && (
          <>
            <p className="text-2xl font-bold">The coin has landed</p>
            <p className="mt-2 text-sm text-haze">Settle the bet to reveal it and collect any winnings.</p>
            <Button className="mt-4 w-full sm:w-auto" onClick={settle} busy={settling}>
              Settle bet
            </Button>
          </>
        )}

        {result && !active && (
          <>
            <p className={`text-3xl font-extrabold ${result.won ? "text-win" : "text-loss"}`}>
              {result.won ? `+${formatUnits(result.payout, quote.decimals)} ${quote.symbol}` : "Not this time"}
            </p>
            <p className="mt-2 text-sm text-haze">
              {result.won ? `It landed on ${sideName(result.side)}. Winnings are in your wallet.` : `It landed on ${sideName((1 - result.side) as BetSide)}.`}{" "}
              <a className="text-brass underline underline-offset-2" href={txLink(result.signature)} target="_blank" rel="noreferrer">
                View settlement
              </a>
            </p>
            <Button variant="ghost" className="mt-4" onClick={() => setResult(null)}>
              Flip again
            </Button>
          </>
        )}
      </div>

      {active && betPda && (
        <p className="mt-4 border-t border-ink-3 pt-4 text-center text-xs text-haze">
          Bet #{active.nonce} is saved in this browser until it's settled.{" "}
          <a className="underline underline-offset-2 hover:text-paper" href={accountLink(betPda)} target="_blank" rel="noreferrer">
            Bet account
          </a>
          {active.placeSig && (
            <>
              {" · "}
              <a className="underline underline-offset-2 hover:text-paper" href={txLink(active.placeSig)} target="_blank" rel="noreferrer">
                Bet transaction
              </a>
            </>
          )}
        </p>
      )}
    </section>
  );
}
