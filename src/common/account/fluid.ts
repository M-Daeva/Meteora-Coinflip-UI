import { formatUnits, isAddress, JsonRpcProvider } from "ethers";
import { numberFrom } from "../utils";
import { CONTRACT, getTokenByAddr, isStablecoin } from "../config";
import { calcHealth } from "../math";
import { MulticallProvider } from "ethers-multicall-provider";
import { getChainByProvider } from "./helpers";
import {
  AssetInfo,
  Chain,
  LendingPosition,
  PositionQuality,
} from "../interfaces";
import {
  DexResolver,
  DexResolver__factory,
  VaultResolver,
  VaultResolver__factory,
} from "../schema";

const DECIMAL_PLACES_UI = 4;
const DECIMAL_SMART_POS = 18;
const ORACLE_BASE_FLUID = 27;
const SHARES_BASE = BigInt(1e18);

interface DexShareRates {
  token0PerSupplyShare: bigint;
  token1PerSupplyShare: bigint;
  token0PerBorrowShare: bigint;
  token1PerBorrowShare: bigint;
}

export function getFluidVaultResolver(
  provider: MulticallProvider<JsonRpcProvider>,
  chain: Chain
): VaultResolver {
  const address = (CONTRACT.FLUID as any)?.[chain.toUpperCase()]
    ?.VAULT_RESOLVER as string;

  return VaultResolver__factory.connect(address, provider);
}

export function getFluidDexResolver(
  provider: MulticallProvider<JsonRpcProvider>,
  chain: Chain
): DexResolver {
  const address = (CONTRACT.FLUID as any)?.[chain.toUpperCase()]
    ?.DEX_RESOLVER as string;

  return DexResolver__factory.connect(address, provider);
}

/**
 * Fetch per-share token rates from the DexResolver for a given DEX address.
 * Returns token0/token1 amounts per 1e18 supply/borrow shares.
 */
async function fetchDexShareRates(
  dexResolver: DexResolver,
  dexAddress: string
): Promise<DexShareRates> {
  // getDexEntireData is nonpayable (not view) because it updates
  // oracle prices internally. Use staticCall to simulate read-only.
  const { dexState } = await dexResolver.getDexEntireData.staticCall(
    dexAddress
  );

  return {
    token0PerSupplyShare: BigInt(dexState.token0PerSupplyShare),
    token1PerSupplyShare: BigInt(dexState.token1PerSupplyShare),
    token0PerBorrowShare: BigInt(dexState.token0PerBorrowShare),
    token1PerBorrowShare: BigInt(dexState.token1PerBorrowShare),
  };
}

/**
 * Convert shares to human-readable token amounts using per-share rates.
 * shares * tokenPerShare / 1e18 gives raw token amount,
 * then formatUnits converts to human-readable.
 */
function sharesToTokenAmount(
  shares: bigint,
  tokenPerShare: bigint,
  tokenDecimals: number
): number {
  const rawAmount = (shares * tokenPerShare) / SHARES_BASE;
  return Number(formatUnits(rawAmount, tokenDecimals));
}

export async function queryFluidPositions(
  vaultResolver: VaultResolver,
  dexResolver: DexResolver,
  userAddress: string
): Promise<LendingPosition[]> {
  if (!isAddress(userAddress)) {
    throw new Error(`${userAddress} isn't a valid EVM address`);
  }

  const provider = vaultResolver.runner
    ?.provider as MulticallProvider<JsonRpcProvider>;
  const chain = await getChainByProvider(provider);
  const [userPositions, vaultsData] = await vaultResolver.positionsByUser(
    userAddress
  );
  if (!userPositions.length) {
    return [];
  }

  // Collect unique DEX addresses that need share rate lookups
  const dexAddressSet = new Set<string>();
  for (const i in userPositions) {
    const vaultData = vaultsData[i];
    if (vaultData.isSmartCol) {
      dexAddressSet.add(vaultData.constantVariables.supply);
    }
    if (vaultData.isSmartDebt) {
      dexAddressSet.add(vaultData.constantVariables.borrow);
    }
  }

  // Batch-fetch all DEX share rates (multicall provider will batch these)
  const dexRatesMap = new Map<string, DexShareRates>();
  const dexFetchPromises = Array.from(dexAddressSet).map(async (dexAddr) => {
    const rates = await fetchDexShareRates(dexResolver, dexAddr);
    dexRatesMap.set(dexAddr, rates);
  });
  await Promise.all(dexFetchPromises);

  let positionList: LendingPosition[] = [];

  for (const i in userPositions) {
    const position = userPositions[i];
    const vaultData = vaultsData[i];

    // Skip if no collateral
    if (position.supply === 0n) {
      continue;
    }

    const { nftId } = position;
    const isSmartCol = vaultData.isSmartCol;
    const isSmartDebt = vaultData.isSmartDebt;

    const {
      supplyToken: { token0: colToken0Addr, token1: colToken1Addr },
      borrowToken: { token0: loanToken0Addr, token1: loanToken1Addr },
    } = vaultData.constantVariables;

    // --- Build collateral items ---
    const collateralItems: AssetInfo[] = [];

    if (isSmartCol) {
      const dexAddr = vaultData.constantVariables.supply;
      const rates = dexRatesMap.get(dexAddr)!;
      const colToken0 = getTokenByAddr(chain, colToken0Addr);
      const colToken1 = getTokenByAddr(chain, colToken1Addr);

      const amount0 = sharesToTokenAmount(
        position.supply,
        rates.token0PerSupplyShare,
        colToken0.decimals
      );
      const amount1 = sharesToTokenAmount(
        position.supply,
        rates.token1PerSupplyShare,
        colToken1.decimals
      );

      collateralItems.push(
        { uiAmount: amount0, label: colToken0.label },
        { uiAmount: amount1, label: colToken1.label }
      );
    } else {
      const colToken = getTokenByAddr(chain, colToken0Addr);
      const collateral = Number(
        formatUnits(position.supply, colToken.decimals)
      );
      collateralItems.push({ uiAmount: collateral, label: colToken.label });
    }

    // --- Build loan items ---
    const loanItems: AssetInfo[] = [];

    if (isSmartDebt) {
      const dexAddr = vaultData.constantVariables.borrow;
      const rates = dexRatesMap.get(dexAddr)!;
      const loanToken0 = getTokenByAddr(chain, loanToken0Addr);
      const loanToken1 = getTokenByAddr(chain, loanToken1Addr);

      const debt0 = sharesToTokenAmount(
        position.borrow,
        rates.token0PerBorrowShare,
        loanToken0.decimals
      );
      const debt1 = sharesToTokenAmount(
        position.borrow,
        rates.token1PerBorrowShare,
        loanToken1.decimals
      );

      loanItems.push(
        {
          uiAmount: numberFrom(debt0)
            .toDecimalPlaces(DECIMAL_PLACES_UI)
            .toNumber(),
          label: loanToken0.label,
        },
        {
          uiAmount: numberFrom(debt1)
            .toDecimalPlaces(DECIMAL_PLACES_UI)
            .toNumber(),
          label: loanToken1.label,
        }
      );
    } else {
      const loanToken = getTokenByAddr(chain, loanToken0Addr);
      const loan = Number(formatUnits(position.borrow, loanToken.decimals));
      loanItems.push({
        uiAmount: numberFrom(loan)
          .toDecimalPlaces(DECIMAL_PLACES_UI)
          .toNumber(),
        label: loanToken.label,
      });
    }

    // --- Health / liquidation metrics ---
    // For all vault types the oracle already prices the collateral unit
    // (whether single token or smart/DEX share) against the debt unit.
    // token0 decimals are used as representative for decimal adjustment.
    const colToken0 = getTokenByAddr(chain, colToken0Addr);
    const loanToken0 = getTokenByAddr(chain, loanToken0Addr);
    // Key metrics from configs (scaled by 100 for %)
    const liqThresholdPercent =
      Number(vaultData.configs.liquidationThreshold) / 100;

    const allLoansStable = loanItems.every((l) => isStablecoin(l.label));

    let currentPrice: number;
    let approxLiqPrice: number;

    if (!isSmartCol && allLoansStable && isSmartDebt) {
      // For smart debt: oracle prices col against DEX share.
      // 1 DEX share = token0PerBorrowShare + token1PerBorrowShare in USD (both stable ≈ $1)
      // So: colPrice_in_USD = oracle_col_per_share * usd_per_share
      const dexAddr = vaultData.constantVariables.borrow;
      const rates = dexRatesMap.get(dexAddr)!;
      const loanToken1 = getTokenByAddr(chain, loanToken1Addr);

      // USD value of 1 borrow share
      const usdPerBorrowShare =
        Number(formatUnits(rates.token0PerBorrowShare, loanToken0.decimals)) +
        Number(formatUnits(rates.token1PerBorrowShare, loanToken1.decimals));

      // Oracle: col price in borrow-share terms (1e27 base, adjusted for decimals)
      const colPricePerShare =
        Number(vaultData.configs.oraclePriceOperate) /
        10 ** (ORACLE_BASE_FLUID + DECIMAL_SMART_POS - colToken0.decimals);

      currentPrice = colPricePerShare * usdPerBorrowShare;

      const rawRatio = Number(position.borrow) / Number(position.supply);
      approxLiqPrice =
        rawRatio *
        (100 / liqThresholdPercent) *
        10 ** (colToken0.decimals - DECIMAL_SMART_POS) *
        usdPerBorrowShare;
    } else {
      const colDecimals = isSmartCol ? DECIMAL_SMART_POS : colToken0.decimals;
      const debtDecimals = isSmartDebt
        ? DECIMAL_SMART_POS
        : loanToken0.decimals;

      // Oracle price for collateral (WBTC in GHO terms, assuming GHO ~1 USD)
      // Fluid oracle uses 1e27 base, adjusted for token decimal delta (GHO 18 - WBTC 8 = 10)
      currentPrice =
        Number(vaultData.configs.oraclePriceOperate) /
        10 ** (ORACLE_BASE_FLUID + debtDecimals - colDecimals);

      const rawRatio = Number(position.borrow) / Number(position.supply);
      approxLiqPrice =
        rawRatio *
        (100 / liqThresholdPercent) *
        10 ** (colDecimals - debtDecimals);
    }

    // --- USD values & net worth ---
    let collateralUsd: number | undefined;
    let loanUsd: number | undefined;

    if (!isSmartCol && allLoansStable) {
      // Single collateral token priced via oracle against stable debt
      collateralUsd = collateralItems[0].uiAmount * currentPrice;
    } else if (
      isSmartCol &&
      collateralItems.every((c) => isStablecoin(c.label))
    ) {
      // Smart collateral but both tokens are stables
      collateralUsd = collateralItems.reduce((sum, c) => sum + c.uiAmount, 0);
    }

    if (allLoansStable) {
      loanUsd = loanItems.reduce((sum, l) => sum + l.uiAmount, 0);
    }

    const netWorth =
      collateralUsd !== undefined && loanUsd !== undefined
        ? numberFrom(collateralUsd - loanUsd)
            .toDecimalPlaces(DECIMAL_PLACES_UI)
            .toNumber()
        : undefined;

    // --- Position quality ---
    const showPrices =
      !isSmartCol && !isStablecoin(colToken0.label) && allLoansStable;

    const quality: PositionQuality = {
      healthFactor: calcHealth(approxLiqPrice, currentPrice),
      liquidationPrice: showPrices
        ? numberFrom(approxLiqPrice)
            .toDecimalPlaces(DECIMAL_PLACES_UI)
            .toNumber()
        : undefined,
      currentPrice: showPrices
        ? numberFrom(currentPrice).toDecimalPlaces(DECIMAL_PLACES_UI).toNumber()
        : undefined,
    };

    positionList.push({
      chain,
      market: "Fluid",
      user: userAddress,
      nftId: Number(nftId),
      collateral: collateralItems,
      loan: loanItems,
      netWorth,
      quality,
    });
  }

  return positionList;
}
