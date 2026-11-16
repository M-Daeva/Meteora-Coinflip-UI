import { useWallet } from "@solana/wallet-adapter-react";
import { useSolBalance, useTokenBalance } from "../hooks/useBalances";
import type { MintInfo, Protocol } from "../hooks/useProtocol";
import { accountLink } from "../config";
import { formatUnits } from "../lib/format";

function Amount({ value, decimals, symbol, href, loading }: { value?: bigint; decimals: number; symbol: string; href?: string; loading: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-haze">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="hover:text-paper hover:underline">
            {symbol}
          </a>
        ) : (
          symbol
        )}
      </dt>
      <dd className="truncate text-2xl font-bold sm:text-3xl" title={value !== undefined ? formatUnits(value, decimals, decimals) : undefined}>
        {loading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-ink-3 align-middle" /> : value !== undefined ? formatUnits(value, decimals) : "—"}
      </dd>
    </div>
  );
}

function TokenAmount({ mint }: { mint: MintInfo }) {
  const q = useTokenBalance(mint);
  return <Amount value={q.data} decimals={mint.decimals} symbol={mint.symbol} href={accountLink(mint.address.toBase58())} loading={q.isLoading && q.fetchStatus !== "idle"} />;
}

/** Live balances: updated from account subscriptions, no reload needed. */
export function Balances({ protocol }: { protocol: Protocol }) {
  const { publicKey } = useWallet();
  const sol = useSolBalance();
  return (
    <dl className="grid grid-cols-3 gap-4 border-y border-ink-3 py-5 sm:gap-8" aria-label="Wallet balances">
      <TokenAmount mint={protocol.quote} />
      <TokenAmount mint={protocol.base} />
      <Amount value={publicKey ? sol.data : undefined} decimals={9} symbol="SOL" loading={sol.isLoading && sol.fetchStatus !== "idle"} />
    </dl>
  );
}
