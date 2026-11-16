import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as spl from "@solana/spl-token";
import { type AccountInfo, type Connection, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAta } from "../common";
import type { MintInfo } from "./useProtocol";

const FALLBACK_REFETCH_MS = 30_000;

function decodeTokenAmount(ata: PublicKey, info: AccountInfo<Buffer> | null, program: PublicKey): bigint {
  if (!info) return 0n; // ATA not created yet
  try {
    return spl.unpackAccount(ata, info, program).amount;
  } catch {
    return 0n;
  }
}

/**
 * Token balance of the connected wallet, kept live with an account
 * subscription: any change to the ATA (a swap here, or a transfer made
 * from the wallet app) lands in the cache without a page reload.
 */
export function useTokenBalance(mint: MintInfo | undefined) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const qc = useQueryClient();

  const ata = useMemo(
    () =>
      mint && publicKey
        ? getAta({ mint: mint.address, owner: publicKey, tokenProgram: mint.tokenProgram })
        : undefined,
    [mint, publicKey]
  );
  const queryKey = useMemo(() => ["token-balance", ata?.toBase58()], [ata]);

  const query = useQuery({
    queryKey,
    enabled: !!ata && !!mint,
    refetchInterval: FALLBACK_REFETCH_MS, // safety net if the websocket drops
    queryFn: async () => decodeTokenAmount(ata!, await connection.getAccountInfo(ata!, "confirmed"), mint!.tokenProgram),
  });

  useEffect(() => {
    if (!ata || !mint) return;
    const id = connection.onAccountChange(
      ata,
      (info) => qc.setQueryData(queryKey, decodeTokenAmount(ata, info, mint.tokenProgram)),
      { commitment: "confirmed" }
    );
    return () => {
      void connection.removeAccountChangeListener(id);
    };
  }, [connection, ata, mint, qc, queryKey]);

  return query;
}

export function useSolBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["sol-balance", publicKey?.toBase58()], [publicKey]);

  const query = useQuery({
    queryKey,
    enabled: !!publicKey,
    refetchInterval: FALLBACK_REFETCH_MS,
    queryFn: async () => BigInt(await connection.getBalance(publicKey!, "confirmed")),
  });

  useEffect(() => subscribeLamports(connection, publicKey, (l) => qc.setQueryData(queryKey, l)), [
    connection,
    publicKey,
    qc,
    queryKey,
  ]);

  return query;
}

function subscribeLamports(connection: Connection, key: PublicKey | null, cb: (l: bigint) => void) {
  if (!key) return;
  const id = connection.onAccountChange(key, (info) => cb(BigInt(info.lamports)), { commitment: "confirmed" });
  return () => {
    void connection.removeAccountChangeListener(id);
  };
}
