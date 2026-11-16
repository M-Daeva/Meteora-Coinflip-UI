import { txLink } from "../config";
import { useActivity, type ActivityEntry } from "../lib/activity";

function Line({ e, onClose }: { e: ActivityEntry; onClose?: () => void }) {
  const dot = e.status === "pending" ? "bg-brass animate-pulse" : e.status === "success" ? "bg-win" : "bg-loss";
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{e.label}</p>
        {e.status === "pending" && <p className="text-sm text-haze">Waiting for wallet and confirmation…</p>}
        {e.status === "success" && e.signature && (
          <a className="text-sm text-brass underline underline-offset-2" href={txLink(e.signature)} target="_blank" rel="noreferrer">
            Confirmed · view on Solscan
          </a>
        )}
        {e.status === "error" && <p className="text-sm text-loss">{e.error}</p>}
      </div>
      {onClose && e.status !== "pending" && (
        <button onClick={onClose} className="-m-1 rounded p-1 text-haze hover:text-paper" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

/** Floating notifications for the latest transactions. */
export function Toasts() {
  const { entries, dismiss } = useActivity();
  const visible = entries.filter((e) => !e.dismissed).slice(0, 3);
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96" role="status" aria-live="polite">
      {visible.map((e) => (
        <div key={e.id} className="pointer-events-auto rounded-2xl border border-ink-3 bg-ink-2 p-4 shadow-2xl shadow-black/40">
          <Line e={e} onClose={() => dismiss(e.id)} />
        </div>
      ))}
    </div>
  );
}

/** Session history of all transaction attempts. */
export function ActivityLog() {
  const { entries } = useActivity();
  return (
    <section aria-labelledby="activity-title" className="mt-8">
      <h2 id="activity-title" className="text-lg font-bold">
        Transactions
      </h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-haze">Every transaction you send shows up here with a Solscan link.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-4">
          {entries.slice(0, 8).map((e) => (
            <li key={e.id}>
              <Line e={e} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
