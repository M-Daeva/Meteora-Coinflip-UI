import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ParsedTransactionWithMeta, PublicKey, TokenBalance } from "@solana/web3.js";
import { BetSide } from "../common/interfaces/coinflip";
import { PLACE_BET_GRACE_MS, VRF_POLL_MS } from "../config";
import { betStore, type PendingBet } from "../lib/betStore";
import { useActivity, type TxOutcome } from "../lib/activity";
import { useHelpers } from "./useHelpers";

export type BetPhase =
  | "unconfirmed" // nonce saved, place-bet tx not seen on-chain yet
  | "waiting" // bet exists, VRF request pending
  | "fulfilled" // randomness ready, can settle
  | "gone"; // bet account closed (settled elsewhere) or never landed

export interface BetStatus {
  phase: BetPhase;
  quoteAmount?: bigint;
  randomness?: number[];
}

/** Polls the bet + ORAO randomness accounts until the bet can be settled. */
export function useBetStatus(bet: PendingBet | undefined) {
  const { helpers, owner } = useHelpers();

  return useQuery({
    queryKey: ["bet-status", owner?.toBase58(), bet?.nonce, !!bet?.placeSig],
    enabled: !!bet && !!owner,
    refetchInterval: (q) => {
      const phase = q.state.data?.phase;
      return phase === "fulfilled" || phase === "gone" ? false : VRF_POLL_MS;
    },
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<BetStatus> => {
      const [betPda] = helpers.coinflip.pdaBet(owner!, bet!.nonce);
      const [betAcc, request] = await Promise.all([
        helpers.coinflip.queryBet(owner!, bet!.nonce),
        // queryRequest returns null while the account doesn't exist
        helpers.oraoVrf.queryRequest(betPda.toBuffer()).catch(() => null),
      ]);

      if (!betAcc) {
        const age = Date.now() - bet!.createdAt;
        const grace = bet!.placeSig ? 15_000 : PLACE_BET_GRACE_MS; // RPC lag vs. tx still in flight
        return { phase: age < grace ? "unconfirmed" : "gone" };
      }

      const randomness = request?.request.fulfilled?.[0]?.randomness ?? [];
      return {
        phase: randomness.length ? "fulfilled" : "waiting",
        quoteAmount: BigInt(betAcc.quoteAmount.toString()),
        randomness: randomness.length ? Array.from(randomness) : undefined,
      };
    },
  });
}

/** Net change of `owner`'s balance of `mint` inside a confirmed tx (atomics). */
export function tokenDelta(tx: ParsedTransactionWithMeta, owner: PublicKey, mint: PublicKey): bigint {
  const o = owner.toBase58();
  const m = mint.toBase58();
  const pick = (list?: TokenBalance[] | null) =>
    (list ?? []).find((b) => b.owner === o && b.mint === m)?.uiTokenAmount.amount ?? "0";
  return BigInt(pick(tx.meta?.postTokenBalances)) - BigInt(pick(tx.meta?.preTokenBalances));
}

export function useCoinflipActions() {
  const { helpers, owner } = useHelpers();
  const { run } = useActivity();
  const qc = useQueryClient();

  async function placeBet(amount: bigint, side: BetSide): Promise<TxOutcome & { nonce: number }> {
    if (!owner) return { ok: false, error: "Connect a wallet first.", nonce: 0 };
    const nonce = Date.now();
    const key = owner.toBase58();
    // persist first: a reload during wallet approval / confirmation must not lose the nonce
    betStore.add(key, { nonce, side, amount: amount.toString(), createdAt: nonce });

    const res = await run(`Place bet · ${side === BetSide.Head ? "Heads" : "Tails"}`, () =>
      helpers.coinflip.tryPlaceBet(helpers.dbc, helpers.dammV2, helpers.oraoVrf, {
        betAmount: Number(amount),
        betSide: side,
        betNonce: nonce,
        minQuoteOut: 0,
      })
    );

    if (res.ok) betStore.update(key, nonce, { placeSig: res.signature });
    else betStore.remove(key, nonce); // nothing landed on-chain
    return { ...res, nonce };
  }

  async function settleBet(nonce: number): Promise<TxOutcome> {
    if (!owner) return { ok: false, error: "Connect a wallet first." };
    const res = await run("Settle bet", () =>
      helpers.coinflip.trySettleBet(helpers.oraoVrf, { betNonce: nonce, user: owner })
    );
    if (res.ok) {
      betStore.remove(owner.toBase58(), nonce);
      qc.removeQueries({ queryKey: ["bet-status", owner.toBase58(), nonce] });
    }
    return res;
  }

  return { placeBet, settleBet };
}
