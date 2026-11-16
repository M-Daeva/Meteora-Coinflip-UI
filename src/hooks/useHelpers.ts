import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getHelperSet, readonlyAnchorProvider, RpcProvider, type TxSigner } from "../common";
import { CLUSTER } from "../config";

export type Helpers = ReturnType<typeof getHelperSet>;

/** Used while no wallet is connected: reads work, signing throws. */
const READONLY_SIGNER: TxSigner = {
  publicKey: PublicKey.default,
  async signAllTransactions() {
    throw new Error("Wallet not connected");
  },
};

/**
 * Wires the `common` helper set to the current RPC connection and wallet.
 * wallet-adapter's AnchorWallet already matches common's TxSigner shape.
 */
export function useHelpers() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    const signer: TxSigner = wallet ?? READONLY_SIGNER;
    const provider = new RpcProvider(connection, signer, CLUSTER);
    const helpers = getHelperSet(provider, readonlyAnchorProvider(connection, signer.publicKey));
    return { helpers, provider, connection, owner: wallet?.publicKey };
  }, [connection, wallet]);
}

/** Read-only helpers that don't rebuild on wallet changes (for protocol-wide queries). */
export function useReadonlyHelpers() {
  const { connection } = useConnection();
  return useMemo(() => {
    const provider = new RpcProvider(connection, READONLY_SIGNER, CLUSTER);
    return getHelperSet(provider, readonlyAnchorProvider(connection, PublicKey.default));
  }, [connection]);
}
