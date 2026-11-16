import { formatUnits, isAddress, JsonRpcProvider } from "ethers";
import { PoolImpl, PoolImpl__factory } from "../schema";
import { getErc20 } from "./erc20";
import { AssetInfo, Chain, LendingPosition, TokenLabel } from "../interfaces";
import { li, numberFrom } from "../utils";
import { MulticallProvider } from "ethers-multicall-provider";
import { getChainByProvider } from "./helpers";
import { DECIMAL_PLACES_HEALTH } from "../math";
import {
  CONTRACT,
  getTokenByAddr,
  getTokenByLabel,
  getTokensByChain,
  isStablecoin,
} from "../config";

const HEALTH_FACTOR_BASE = 18;
const DECIMALS_USD = 8;

export function getAavePoolImpl(
  provider: MulticallProvider<JsonRpcProvider>,
  chain: Chain
): PoolImpl {
  const address = (CONTRACT.AAVE as any)?.[chain.toUpperCase()]?.POOL as string;
  return PoolImpl__factory.connect(address, provider);
}

export async function queryAavePositions(
  pool: PoolImpl,
  userAddress: string
): Promise<LendingPosition[]> {
  if (!isAddress(userAddress)) {
    throw new Error(`${userAddress} isn't a valid EVM address`);
  }

  const provider = pool.runner?.provider as MulticallProvider<JsonRpcProvider>;
  const chain = await getChainByProvider(provider);
  const [accountData, positions] = await Promise.all([
    pool.getUserAccountData(userAddress),
    getUserCompletePositions(provider, pool, chain, userAddress),
  ]);
  if (!positions.length) {
    return [];
  }

  // Separate collateral and loans
  const collateral: AssetInfo[] = [];
  const loans: AssetInfo[] = [];

  for (const position of positions) {
    const supplyAmount = Number(
      formatUnits(position.supplyBalance, position.decimals)
    );
    const debtAmount = Number(
      formatUnits(position.debtBalance, position.decimals)
    );

    if (supplyAmount > 0) {
      collateral.push({
        label: position.symbol as TokenLabel,
        uiAmount: supplyAmount,
      });
    }

    if (debtAmount > 0) {
      loans.push({
        label: position.symbol as TokenLabel,
        uiAmount: debtAmount,
      });
    }
  }

  // Convert health factor
  const healthFactor = Number(
    formatUnits(accountData.healthFactor, HEALTH_FACTOR_BASE)
  );

  // Get net worth
  const totalCollateralUSD = Number(
    formatUnits(accountData.totalCollateralBase, DECIMALS_USD)
  );
  const totalDebtUSD = Number(
    formatUnits(accountData.totalDebtBase, DECIMALS_USD)
  );
  const netWorth = totalCollateralUSD - totalDebtUSD;

  // Calculate liquidation and current prices when collateral is 1 non-stable token, loan is all stables
  let liquidationPrice: number | undefined;
  let currentPrice: number | undefined;

  if (collateral.length === 1 && loans.length >= 1) {
    const collateralToken = collateral[0];
    const isCollateralStable = isStablecoin(collateralToken.label);
    const allLoansStable = loans.every((l) => isStablecoin(l.label));

    if (!isCollateralStable && allLoansStable) {
      // Current price = total collateral USD / collateral token amount
      currentPrice = totalCollateralUSD / collateralToken.uiAmount;

      // Liquidation price:
      // healthFactor = (collateral * LTV_liquidation) / debt
      // At liquidation, HF = 1, so: collateral_usd = debt / LTV_liquidation
      // price_liquidation = debt / (LTV_liquidation * token_amount)
      //
      // Aave calls this "liquidationThreshold" (not LTV)
      const reserveData = await pool.getReserveData(
        getTokenByLabel(chain, collateralToken.label).address
      );
      const liquidationThreshold =
        Number((reserveData.configuration.data >> 16n) & 0xffffn) / 10_000;

      liquidationPrice =
        totalDebtUSD / (liquidationThreshold * collateralToken.uiAmount);
    }
  }

  const lendingPosition: LendingPosition = {
    chain,
    market: "AAVE",
    user: userAddress,
    collateral,
    loan: loans,
    netWorth,
    quality: {
      healthFactor: numberFrom(healthFactor)
        .toDecimalPlaces(DECIMAL_PLACES_HEALTH)
        .toNumber(),
      liquidationPrice,
      currentPrice,
    },
  };

  return [lendingPosition];
}

async function getUserCompletePositions(
  provider: MulticallProvider<JsonRpcProvider>,
  pool: PoolImpl,
  chain: Chain,
  userAddress: string
) {
  // Get all reserves
  const reserves = await pool.getReservesList();

  // Use intersection of wl and market tokens
  const tokenWhitelist = getTokensByChain(chain).map((x) => x.address);
  const tokenList = tokenWhitelist.filter((x) => reserves.includes(x));
  // li({ tokenList });

  // Get reserve data and check balances in parallel
  const positionChecks = await Promise.all(
    tokenList.map(async (assetAddress) => {
      try {
        // TODO: use wl for aToken, debtToken
        const reserveData = await pool.getReserveData(assetAddress);

        // Skip if no aToken address
        if (
          reserveData.aTokenAddress ===
          "0x0000000000000000000000000000000000000000"
        ) {
          return null;
        }

        const aToken = getErc20(provider, reserveData.aTokenAddress);
        const debtToken = getErc20(
          provider,
          reserveData.variableDebtTokenAddress
        );

        // Get balances in parallel
        const [supplyBalance, debtBalance] = await Promise.all([
          aToken.balanceOf(userAddress),
          debtToken.balanceOf(userAddress),
        ]);

        // Return null if no balance
        if (supplyBalance === 0n && debtBalance === 0n) {
          return null;
        }

        const { label, decimals } = getTokenByAddr(chain, assetAddress);
        // li({ label, supplyBalance, debtBalance });

        return {
          asset: assetAddress,
          symbol: label,
          decimals,
          supplyBalance,
          debtBalance,
          aTokenAddress: reserveData.aTokenAddress,
          debtTokenAddress: reserveData.variableDebtTokenAddress,
        };
      } catch (error) {
        li(error);
        return null;
      }
    })
  );

  // Filter out nulls
  return positionChecks.filter((p) => p !== null);
}
