import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import type { TxResult } from "../common";
import { humanizeError } from "./errors";

export interface ActivityEntry {
  id: number;
  label: string;
  status: "pending" | "success" | "error";
  signature?: string;
  error?: string;
  at: number;
  dismissed?: boolean;
}

export type TxOutcome =
  | { ok: true; signature: string; tx: ParsedTransactionWithMeta }
  | { ok: false; error: string };

interface Ctx {
  entries: ActivityEntry[];
  run: (label: string, send: () => Promise<TxResult>) => Promise<TxOutcome>;
  dismiss: (id: number) => void;
}

const ActivityContext = createContext<Ctx | null>(null);
let nextId = 1;

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  const patch = useCallback((id: number, p: Partial<ActivityEntry>) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...p } : e)));
  }, []);

  const dismiss = useCallback((id: number) => patch(id, { dismissed: true }), [patch]);

  /** Every tx goes through here: result is a solscan link or a readable error. */
  const run = useCallback<Ctx["run"]>(
    async (label, send) => {
      const id = nextId++;
      setEntries((list) => [{ id, label, status: "pending" as const, at: Date.now() }, ...list].slice(0, 30));
      try {
        const result = await send();
        if (typeof result === "string" || Array.isArray(result)) {
          throw new Error("Unexpected result type: expected a broadcasted transaction");
        }
        const signature = result.transaction.signatures[0];
        patch(id, { status: "success", signature });
        setTimeout(() => dismiss(id), 10_000);
        return { ok: true, signature, tx: result };
      } catch (e) {
        console.error(`[${label}]`, e);
        const error = humanizeError(e);
        patch(id, { status: "error", error });
        return { ok: false, error };
      }
    },
    [patch, dismiss]
  );

  const value = useMemo(() => ({ entries, run, dismiss }), [entries, run, dismiss]);
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used inside ActivityProvider");
  return ctx;
}
