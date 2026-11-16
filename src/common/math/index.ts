import { numberFrom } from "../utils";

const ZERO = numberFrom(0);
const ONE = numberFrom(1);
const TEN = numberFrom(10);
export const DECIMAL_PLACES_HEALTH = 4;

// Health (Collateralization Ratio)
// CR = (TotalCollateralValue × LiquidationThreshold) / TotalDebtValue
// CR = CurrentPrice / LiquidationPrice
export function calcHealth(
  liquidationPrice: number,
  currentPrice: number
): number {
  const cr = liquidationPrice
    ? numberFrom(currentPrice).div(liquidationPrice)
    : TEN;
  return cr.toDecimalPlaces(DECIMAL_PLACES_HEALTH).toNumber();
}

export function calcRemainingDelayMs(
  timestampStartMs: number,
  cyclePeriodS: number
): number {
  const timestampEndMs = Date.now();
  const delayMs = timestampEndMs - timestampStartMs;
  return Math.max(1_000 * cyclePeriodS - delayMs, 0);
}
