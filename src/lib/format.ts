/** atomics → decimal string, trimmed */
export function formatUnits(amount: bigint, decimals: number, maxFraction = 4): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction);
  frac = frac.replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  return `${neg ? "-" : ""}${wholeStr}${frac ? "." + frac : ""}`;
}

/** decimal string → atomics; throws on bad input */
export function parseUnits(value: string, decimals: number): bigint {
  const v = value.trim();
  if (!/^\d*\.?\d*$/.test(v) || v === "" || v === ".") throw new Error("Enter a valid amount");
  const [w, f = ""] = v.split(".");
  if (f.length > decimals) throw new Error(`Max ${decimals} decimal places`);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, "0") || "0");
}

export const shortKey = (k: string, n = 4) => `${k.slice(0, n)}…${k.slice(-n)}`;
