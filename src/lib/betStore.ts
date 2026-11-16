import { useCallback, useSyncExternalStore } from "react";
import { BetSide } from "../common/interfaces/coinflip";

/**
 * Bets are identified on-chain by (user, nonce). The nonce is written to
 * localStorage *before* the place-bet tx is sent and removed only after the
 * bet is settled, so a reload at any moment can resume the flow.
 */
export interface PendingBet {
  nonce: number;
  side: BetSide;
  /** base-mint atomics, as string */
  amount: string;
  createdAt: number;
  placeSig?: string;
}

const EVENT = "coinflip:bets";
const keyFor = (owner: string) => `coinflip:bets:v1:${owner}`;
const EMPTY: PendingBet[] = [];
const cache = new Map<string, { raw: string | null; value: PendingBet[] }>();

function read(owner: string): PendingBet[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(keyFor(owner));
  } catch {
    return EMPTY;
  }
  const hit = cache.get(owner);
  if (hit && hit.raw === raw) return hit.value; // stable reference for useSyncExternalStore
  let value: PendingBet[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) value = parsed.filter((b) => Number.isSafeInteger(b?.nonce));
  } catch {
    /* corrupted entry → treat as empty */
  }
  cache.set(owner, { raw, value });
  return value;
}

function write(owner: string, bets: PendingBet[]) {
  try {
    if (bets.length) localStorage.setItem(keyFor(owner), JSON.stringify(bets));
    else localStorage.removeItem(keyFor(owner));
  } catch {
    /* storage full / disabled */
  }
  window.dispatchEvent(new Event(EVENT));
}

export const betStore = {
  list: read,
  add(owner: string, bet: PendingBet) {
    write(owner, [...read(owner).filter((b) => b.nonce !== bet.nonce), bet]);
  },
  update(owner: string, nonce: number, patch: Partial<PendingBet>) {
    write(owner, read(owner).map((b) => (b.nonce === nonce ? { ...b, ...patch } : b)));
  },
  remove(owner: string, nonce: number) {
    write(owner, read(owner).filter((b) => b.nonce !== nonce));
  },
};

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePendingBets(owner: string | undefined): PendingBet[] {
  const getSnapshot = useCallback(() => (owner ? read(owner) : EMPTY), [owner]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
