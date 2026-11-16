import { BetSide } from "../common/interfaces/coinflip";

interface Props {
  spinning: boolean;
  /** face shown when not spinning */
  side: BetSide;
  className?: string;
}

function Face({ label, glyph, tails }: { label: string; glyph: string; tails?: boolean }) {
  return (
    <div className={`coin-face ${tails ? "tails" : ""}`}>
      <div className="flex flex-col items-center leading-none">
        <span className="font-extrabold" style={{ fontSize: "clamp(2.5rem, 9vw, 4.5rem)" }}>
          {glyph}
        </span>
        <span className="mt-1 text-xs font-bold tracking-wide opacity-80 sm:text-sm">{label}</span>
      </div>
    </div>
  );
}

/** 3D CSS coin. Spins while waiting for VRF; lands on `side` otherwise. */
export function Coin({ spinning, side, className = "" }: Props) {
  const rest = side === BetSide.Head ? "rotateY(0deg)" : "rotateY(180deg)";
  return (
    <div className={className} aria-hidden="true">
      <div className={`coin-scene aspect-square w-full ${spinning ? "coin-hop" : ""}`}>
        <div className={`coin ${spinning ? "spinning" : ""}`} style={spinning ? undefined : { transform: rest }}>
          {[-3, -1.5, 0, 1.5, 3].map((z) => (
            <div key={z} className="coin-edge" style={{ ["--z" as string]: `${z}px` }} />
          ))}
          <Face label="Heads" glyph="☀" />
          <Face label="Tails" glyph="☾" tails />
        </div>
      </div>
      <div className="coin-shadow mt-5" />
    </div>
  );
}
