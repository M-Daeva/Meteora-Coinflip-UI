import { Chain } from "../interfaces";
import { getChainById } from "../config";
import { JsonRpcProvider } from "ethers";
import { MulticallProvider } from "ethers-multicall-provider";
import { DexResolver, PoolImpl, VaultResolver } from "../schema";

export interface QueryPositionsInput {
  providerArbitrum: MulticallProvider<JsonRpcProvider>;
  poolArbitrum: PoolImpl;
  vaultResolverArbitrum: VaultResolver;
  dexResolverArbitrum: DexResolver;

  providerEthereum: MulticallProvider<JsonRpcProvider>;
  poolEthereum: PoolImpl;
  vaultResolverEthereum: VaultResolver;
  dexResolverEthereum: DexResolver;
}

export async function getChainByProvider(
  provider: MulticallProvider<JsonRpcProvider>
): Promise<Chain> {
  const network = await provider.getNetwork();
  return getChainById(Number(network.chainId));
}
