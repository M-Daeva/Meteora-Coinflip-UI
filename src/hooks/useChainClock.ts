import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";

// Clock sysvar layout: slot u64 | epoch_start_timestamp i64 | epoch u64 | leader_schedule_epoch u64 | unix_timestamp i64
const UNIX_TIMESTAMP_OFFSET = 32;
const RESYNC_MS = 5 * 60_000;

/**
 * Offset (ms) between the cluster clock and this device's clock.
 * Programs check timestamps against the Clock sysvar, so cooldowns and
 * countdowns must use chain time; the device clock may be off.
 */
export function useChainClockOffset() {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["chain-clock-offset", connection.rpcEndpoint],
    staleTime: RESYNC_MS,
    refetchInterval: RESYNC_MS,
    queryFn: async () => {
      const sentAt = Date.now();
      const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, "confirmed");
      const receivedAt = Date.now();
      if (!info) throw new Error("Clock sysvar not available");
      const chainS = Number(info.data.readBigInt64LE(UNIX_TIMESTAMP_OFFSET));
      // compare with the midpoint of the request to cancel out network latency
      return chainS * 1000 - (sentAt + receivedAt) / 2;
    },
  });
}

/** Current chain time in ms, ticking every second while `active`. Undefined until synced. */
export function useChainNow(active: boolean): number | undefined {
  const { data: offset } = useChainClockOffset();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [active]);
  return offset === undefined ? undefined : now + offset;
}
