import { useQuery } from "@tanstack/react-query";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { useReadonlyHelpers } from "./useHelpers";

export interface MintInfo {
  address: PublicKey;
  decimals: number;
  tokenProgram: PublicKey;
  symbol: string;
}

export interface Protocol {
  quote: MintInfo;
  base: MintInfo;
  dbcConfig: PublicKey;
  minQuoteBet: bigint;
  maxQuoteBet: bigint;
  faucetAmount: bigint;
  faucetCooldownS: number;
}

async function loadSymbol(
  connection: ReturnType<typeof useConnection>["connection"],
  mint: PublicKey,
  tokenProgram: PublicKey,
  fallback: string
) {
  if (!tokenProgram.equals(spl.TOKEN_2022_PROGRAM_ID)) return fallback;
  try {
    const meta = await spl.getTokenMetadata(connection, mint, "confirmed", tokenProgram);
    return meta?.symbol?.trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Static protocol data: mints, decimals, limits. Fetched once per session. */
export function useProtocol() {
  const helpers = useReadonlyHelpers();
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["protocol", connection.rpcEndpoint],
    staleTime: Infinity,
    retry: 3,
    queryFn: async (): Promise<Protocol> => {
      const [cf, faucet] = await Promise.all([
        helpers.coinflip.queryConfig(),
        helpers.faucet.queryConfig(),
      ]);
      if (!cf) throw new Error("Coinflip config account not found on devnet");
      if (!faucet) throw new Error("Faucet config account not found on devnet");

      const [quoteAcc, baseAcc] = await connection.getMultipleAccountsInfo([cf.quoteMint, cf.baseMint]);
      if (!quoteAcc || !baseAcc) throw new Error("Mint accounts not found on devnet");

      const quoteMint = spl.unpackMint(cf.quoteMint, quoteAcc, quoteAcc.owner);
      const baseMint = spl.unpackMint(cf.baseMint, baseAcc, baseAcc.owner);

      const [quoteSymbol, baseSymbol] = await Promise.all([
        loadSymbol(connection, cf.quoteMint, quoteAcc.owner, "USDC"),
        loadSymbol(connection, cf.baseMint, baseAcc.owner, "BASE"),
      ]);

      return {
        quote: { address: cf.quoteMint, decimals: quoteMint.decimals, tokenProgram: quoteAcc.owner, symbol: quoteSymbol },
        base: { address: cf.baseMint, decimals: baseMint.decimals, tokenProgram: baseAcc.owner, symbol: baseSymbol },
        dbcConfig: cf.dbcConfig,
        minQuoteBet: BigInt(cf.minQuoteBet.toString()),
        maxQuoteBet: BigInt(cf.maxQuoteBet.toString()),
        faucetAmount: BigInt(faucet.claimableAmount.toString()),
        faucetCooldownS: Number(faucet.claimCooldown.toString()),
      };
    },
  });
}
