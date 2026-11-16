import { useState } from "react";
import { useHelpers } from "../hooks/useHelpers";
import { useTokenBalance } from "../hooks/useBalances";
import type { Protocol } from "../hooks/useProtocol";
import { useActivity } from "../lib/activity";
import { formatUnits, parseUnits } from "../lib/format";
import { AmountInput, Button, FieldError, Step } from "./ui";

const SWAP_MODE_PARTIAL_FILL = 1;

export function SwapStep({ protocol }: { protocol: Protocol }) {
  const { helpers, owner } = useHelpers();
  const { run } = useActivity();
  const quoteBal = useTokenBalance(protocol.quote);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { quote, base } = protocol;

  async function swap() {
    setError(undefined);
    let amount: bigint;
    try {
      amount = parseUnits(value, quote.decimals);
    } catch (e) {
      return setError((e as Error).message);
    }
    if (amount <= 0n) return setError("Enter an amount above zero.");
    if (quoteBal.data !== undefined && amount > quoteBal.data) {
      return setError(`You have ${formatUnits(quoteBal.data, quote.decimals)} ${quote.symbol}.`);
    }

    setBusy(true);
    const res = await run(`Swap ${value} ${quote.symbol} → ${base.symbol}`, () =>
      helpers.dbc.trySwap(base.address, quote.address, protocol.dbcConfig, {
        swapParameters2: { swapMode: SWAP_MODE_PARTIAL_FILL, amount0: Number(amount), amount1: 0 },
      })
    );
    if (res.ok) setValue("");
    setBusy(false);
  }

  return (
    <Step
      n={2}
      title={`Swap ${quote.symbol} for ${base.symbol}`}
      hint={`Bets are placed in ${base.symbol}. This buys it on the Meteora bonding curve.`}
    >
      <div className="flex max-w-md flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <AmountInput
            id="swap-amount"
            label={`Amount of ${quote.symbol} to swap`}
            value={value}
            onChange={setValue}
            symbol={quote.symbol}
            onMax={quoteBal.data ? () => setValue(formatUnits(quoteBal.data!, quote.decimals, quote.decimals).replace(/,/g, "")) : undefined}
          />
        </div>
        <Button onClick={swap} busy={busy} disabled={!owner || !value}>
          Swap
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </Step>
  );
}
