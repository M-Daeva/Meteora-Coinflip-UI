import { queryFluidPositions } from "./fluid";
import { LendingPosition, RequestItem } from "../interfaces";
import { QueryPositionsInput } from "./helpers";
import { queryAavePositions } from "./aave";

export async function queryPositions(
  queryPositionsInput: QueryPositionsInput,
  requestList: RequestItem[],
  batchSize: number,
  logger?: (...args: any[]) => void
): Promise<LendingPosition[]> {
  let resultList: LendingPosition[] = [];

  const fn = async (x: RequestItem) => {
    try {
      let positions: LendingPosition[] = [];

      if (x.market === "Fluid") {
        // TODO: refactor
        const vaultResolver =
          x.chain === "Arbitrum"
            ? queryPositionsInput.vaultResolverArbitrum
            : queryPositionsInput.vaultResolverEthereum;

        const dexResolver =
          x.chain === "Arbitrum"
            ? queryPositionsInput.dexResolverArbitrum
            : queryPositionsInput.dexResolverEthereum;

        positions = await queryFluidPositions(
          vaultResolver,
          dexResolver,
          x.user
        );
      }

      if (x.market === "AAVE") {
        const pool =
          x.chain === "Arbitrum"
            ? queryPositionsInput.poolArbitrum
            : queryPositionsInput.poolEthereum;

        positions = await queryAavePositions(pool, x.user);
      }

      if (!positions.length) {
        throw new Error(`Unsupported chain ${x.chain} or market ${x.market}`);
      }

      resultList = [...resultList, ...positions];
    } catch (error) {
      if (typeof logger !== "undefined") {
        logger("\n❌ " + error);
      }
    }
  };

  for (let i = 0; i < requestList.length; i += batchSize) {
    const batch = requestList.slice(i, i + batchSize);
    const batchStart = i;
    const batchEnd = Math.min(i + batchSize, requestList.length);

    await Promise.all(batch.map(fn));

    if (typeof logger !== "undefined") {
      logger(
        `\n✔️ Position batch ${batchStart}-${batchEnd} completed successfully`
      );
    }
  }

  return resultList;
}
