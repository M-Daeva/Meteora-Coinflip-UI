import { Cluster } from "./common";

export const CLUSTER = Cluster.Devnet;

/** Public devnet RPC is rate-limited; set VITE_RPC_URL (e.g. a free Helius devnet key) for deploys. */
export const RPC_URL: string =
  import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";

/** Polling interval while waiting for ORAO VRF fulfillment */
export const VRF_POLL_MS = 1_000;

/** Unsent/never-landed bets are forgotten after this long */
export const PLACE_BET_GRACE_MS = 120_000;

export const txLink = (sig: string) => `https://solscan.io/tx/${sig}?cluster=devnet`;
export const accountLink = (addr: string) => `https://solscan.io/account/${addr}?cluster=devnet`;
