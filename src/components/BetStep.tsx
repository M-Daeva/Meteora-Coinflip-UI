import { useState } from "react";
import { BetSide } from "../common/interfaces/coinflip";
import { useHelpers } from "../hooks/useHelpers";
import { useTokenBalance } from "../hooks/useBalances";
import { useCoinflipActions } from "../hooks/useCoinflip";
import type { Protocol } from "../hooks/useProtocol";
import { formatUnits, parseUnits } from "../lib/format";
import { AmountInput, Button, FieldError, Step } from "./ui";

interface Props {
  protocol: Protocol;
  side: BetSide;
  onSide: (s: BetSide) => void;
  hasActiveBet: boolean;
}

export function BetStep({ protocol, side, onSide, hasActiveBet }: Props) {
  const { owner } = useHelpers();
  const { placeBet } = useCoinflipActions();
  const baseBal = useTokenBalance(protocol.base);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { base, quote } = protocol;

  async function submit() {
    setError(undefined);
    let amount: bigint;
    try {
      amount = parseUnits(value, base.decimals);
    } catch (e) {
      return setError((e as Error).message);
    }
    if (amount <= 0n) return setError("Enter an amount above zero.");
    if (baseBal.data !== undefined && amount > baseBal.data) {
      return setError(`You have ${formatUnits(baseBal.data, base.decimals)} ${base.symbol}. Swap more in step 2.`);
    }
    setBusy(true);
    const res = await placeBet(amount, side);
    if (res.ok) setValue("");
    setBusy(false);
  }

  const sides: [BetSide, string][] = [
    [BetSide.Head, "Heads"],
    [BetSide.Tail, "Tails"],
  ];

  return (
    <Step
      n={3}
      last
      title="Call it and flip"
      hint={
        <>
          Your {base.symbol} is sold for {quote.symbol} at bet time. Allowed bet size is{" "}
          {formatUnits(protocol.minQuoteBet, quote.decimals)}–{formatUnits(protocol.maxQuoteBet, quote.decimals)} {quote.symbol}{" "}
          after the sale. A win pays out in {quote.symbol}.
        </>
      }
    >
      <fieldset className="mb-3">
        <legend className="sr-only">Pick a side</legend>
        <div className="inline-flex rounded-full border border-ink-3 bg-ink-2 p-1">
          {sides.map(([s, label]) => (
            <label
              key={s}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brass ${
                side === s ? "bg-paper text-ink" : "text-haze hover:text-paper"
              }`}
            >
              <input type="radio" name="side" className="sr-only" checked={side === s} onChange={() => onSide(s)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex max-w-md flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <AmountInput
            id="bet-amount"
            label={`Bet amount in ${base.symbol}`}
            value={value}
            onChange={setValue}
            symbol={base.symbol}
            onMax={baseBal.data ? () => setValue(formatUnits(baseBal.data!, base.decimals, base.decimals).replace(/,/g, "")) : undefined}
          />
        </div>
        <Button onClick={submit} busy={busy} disabled={!owner || !value || hasActiveBet}>
          Flip the coin
        </Button>
      </div>
      {hasActiveBet && !busy && <p className="mt-2 text-sm text-haze">Settle your current bet before placing a new one.</p>}
      <FieldError>{error}</FieldError>
    </Step>
  );
}
