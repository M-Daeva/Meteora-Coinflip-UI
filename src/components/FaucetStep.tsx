import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHelpers } from "../hooks/useHelpers";
import { useSolBalance } from "../hooks/useBalances";
import { useChainNow } from "../hooks/useChainClock";
import type { Protocol } from "../hooks/useProtocol";
import { useActivity } from "../lib/activity";
import { formatUnits } from "../lib/format";
import { Button, Step } from "./ui";

const MIN_SOL_LAMPORTS = 5_000_000n; // 0.005 SOL covers a handful of txs + ATA rent

function fmtWait(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = h ? [h && `${h}h`, m && `${m}m`] : m ? [`${m}m`, sec && `${sec}s`] : [`${sec}s`];
  return parts.filter(Boolean).join(" ");
}

export function FaucetStep({ protocol }: { protocol: Protocol }) {
  const { helpers, owner } = useHelpers();
  const { run } = useActivity();
  const qc = useQueryClient();
  const sol = useSolBalance();
  const [busy, setBusy] = useState(false);

  const userKey = ["faucet-user", owner?.toBase58()];
  const user = useQuery({
    queryKey: userKey,
    enabled: !!owner,
    queryFn: async () => {
      const acc = await helpers.faucet.queryUser(owner!);
      return acc ? Number(acc.claimedAt.toString()) : null; // unix seconds
    },
  });

  // claimed_at is chain time, so the countdown runs on chain time too (device clock may be off)
  const nextClaimAt = user.data ? (user.data + protocol.faucetCooldownS) * 1000 : 0;
  const chainNow = useChainNow(nextClaimAt > 0);
  const syncing = nextClaimAt > 0 && chainNow === undefined;
  const waitS = chainNow === undefined ? 0 : Math.max(0, Math.ceil((nextClaimAt - chainNow) / 1000));
  const lowSol = owner && sol.data !== undefined && sol.data < MIN_SOL_LAMPORTS;

  async function claim() {
    setBusy(true);
    const res = await run(`Claim ${protocol.quote.symbol}`, () => helpers.faucet.tryClaim());
    if (res.ok) await qc.invalidateQueries({ queryKey: userKey });
    setBusy(false);
  }

  return (
    <Step
      n={1}
      title={`Get test ${protocol.quote.symbol}`}
      hint={
        <>
          The faucet sends {formatUnits(protocol.faucetAmount, protocol.quote.decimals)} {protocol.quote.symbol}
          {protocol.faucetCooldownS > 0 && <> once every {fmtWait(protocol.faucetCooldownS)}</>}.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={claim} busy={busy} disabled={!owner || waitS > 0 || syncing}>
          Claim {protocol.quote.symbol}
        </Button>
        {!owner && <span className="text-sm text-haze">Connect a wallet to claim.</span>}
        {owner && waitS > 0 && <span className="text-sm text-haze">Next claim in {fmtWait(waitS)}</span>}
      </div>
      {lowSol && (
        <p className="mt-3 max-w-prose rounded-xl border border-brass/40 bg-brass/10 px-4 py-3 text-sm">
          Your wallet needs devnet SOL for fees. Request some at{" "}
          <a className="font-semibold text-brass underline underline-offset-2" href="https://faucet.solana.com" target="_blank" rel="noreferrer">
            faucet.solana.com
          </a>
          , then come back.
        </p>
      )}
    </Step>
  );
}
