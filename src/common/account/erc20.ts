import { JsonRpcProvider } from "ethers";
import { Erc20, Erc20__factory } from "../schema";

export function getErc20(provider: JsonRpcProvider, address: string): Erc20 {
  return Erc20__factory.connect(address, provider);
}
