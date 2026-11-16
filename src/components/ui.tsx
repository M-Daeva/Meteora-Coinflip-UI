import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Step({ n, title, hint, children, last }: { n: number; title: string; hint: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <section className="grid grid-cols-[2.25rem_1fr] gap-x-4 sm:grid-cols-[3rem_1fr]">
      <div className="flex flex-col items-center">
        <span className="grid size-9 place-items-center rounded-full border border-brass/60 text-sm font-bold text-brass sm:size-11 sm:text-base">
          {n}
        </span>
        {!last && <span className="mt-2 w-px flex-1 bg-ink-3" />}
      </div>
      <div className={`min-w-0 ${last ? "" : "pb-10"}`}>
        <h2 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h2>
        <p className="mt-1 max-w-prose text-sm text-haze">{hint}</p>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

export function Button({
  busy,
  children,
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: "primary" | "ghost" }) {
  const base =
    "inline-flex h-11 shrink-0 whitespace-nowrap items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  const look =
    variant === "primary"
      ? "bg-brass text-ink hover:bg-[#edc266]"
      : "border border-ink-3 text-paper hover:border-haze";
  return (
    <button className={`${base} ${look} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function AmountInput({
  value,
  onChange,
  symbol,
  onMax,
  id,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  symbol: string;
  onMax?: () => void;
  id: string;
  label: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex h-12 items-center rounded-xl border border-ink-3 bg-ink-2 pr-2 focus-within:border-brass">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg font-semibold outline-none placeholder:text-haze/50"
        />
        {onMax && (
          <button type="button" onClick={onMax} className="rounded-md px-2 py-1 text-xs font-semibold text-brass hover:bg-ink-3">
            Max
          </button>
        )}
        <span className="px-2 text-sm font-semibold text-haze">{symbol}</span>
      </div>
    </div>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-2 text-sm text-loss">{children}</p>;
}
