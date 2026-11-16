import { MissingSignersError } from "../common";
import DbcIdl from "../common/schema/dbc/dbc.json";
import DammV2Idl from "../common/schema/damm-v2/damm_v2.json";
import OraoVrfIdl from "../common/schema/orao-vrf/orao_vrf.json";

type IdlLike = { address: string; errors?: { code: number; msg?: string; name: string }[] };

// program id → custom error code → message
const PROGRAM_ERRORS = new Map<string, Map<number, string>>();
for (const idl of [DbcIdl, DammV2Idl, OraoVrfIdl] as IdlLike[]) {
  PROGRAM_ERRORS.set(
    idl.address,
    new Map((idl.errors ?? []).map((e) => [e.code, e.msg || splitCamel(e.name)]))
  );
}

const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PE9fqjFHgr1Tz8TS",
]);
const TOKEN_ERRORS: Record<number, string> = {
  0x1: "Insufficient token balance",
  0x3: "Token mint mismatch",
  0x4: "Token account owner mismatch",
  0x11: "Token account is frozen",
};

// Anchor framework errors that users can actually hit
const ANCHOR_ERRORS: Record<number, string> = {
  2003: "A program constraint was violated",
  2006: "Account seeds mismatch",
  3007: "Account is owned by a different program",
  3012: "Required account isn't initialized yet",
};

function splitCamel(s: string) {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function fromLogs(logs: string[]): string | undefined {
  // Anchor: "... Error Code: X. Error Number: N. Error Message: Something."
  for (const line of logs) {
    const m = line.match(/Error Message: (.+?)\.?$/);
    if (m) return m[1];
  }
  // "Program <id> failed: custom program error: 0x1"
  for (const line of logs) {
    const m = line.match(/Program (\w+) failed: custom program error: 0x([0-9a-f]+)/i);
    if (!m) continue;
    const [, programId, hex] = m;
    const code = parseInt(hex, 16);
    const msg =
      PROGRAM_ERRORS.get(programId)?.get(code) ??
      (TOKEN_PROGRAMS.has(programId) ? TOKEN_ERRORS[code] : undefined) ??
      ANCHOR_ERRORS[code];
    if (msg) return msg;
    return `Program ${programId.slice(0, 6)}… failed with error ${code}`;
  }
  for (const line of logs) {
    if (/insufficient lamports/i.test(line)) return "Not enough SOL to cover rent and fees";
    if (/exceeded CUs meter/i.test(line)) return "Transaction ran out of compute units";
  }
  return undefined;
}

/** Turns anything thrown during build/sign/send into one human-readable sentence. */
export function humanizeError(e: unknown): string {
  if (e instanceof MissingSignersError) return "The wallet didn't sign the transaction.";

  const name = e instanceof Error ? e.name : "";
  const raw = messageOf(e);

  if (
    /WalletSignTransactionError|WalletSendTransactionError/.test(name) ||
    /user rejected|rejected the request|declined|cancelled|canceled/i.test(raw)
  ) {
    return "Transaction was rejected in the wallet.";
  }
  if (/WalletNotConnected|wallet not connected/i.test(name + raw)) return "Connect a wallet first.";

  // web3.js SendTransactionError / our provider's "Simulation failed: <json>\n<logs>"
  const logs: string[] =
    (e as { logs?: string[] })?.logs ??
    (raw.includes("\n") ? raw.split("\n").slice(1) : []);
  const fromLog = fromLogs(logs);
  if (fromLog) return fromLog + ".";

  if (/Attempt to debit an account but found no record of prior credit|AccountNotFound/i.test(raw)) {
    return "Your wallet has no devnet SOL for fees. Get some at faucet.solana.com.";
  }
  if (/insufficient (funds|lamports)/i.test(raw)) return "Not enough SOL to cover rent and fees.";
  if (/Blockhash not found|block height exceeded|has expired/i.test(raw)) {
    return "Transaction expired before it was confirmed. Please try again.";
  }
  if (/429|Too many requests|rate limit/i.test(raw)) {
    return "The RPC node is rate-limiting requests. Wait a few seconds and retry.";
  }
  if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(raw)) {
    return "Network error while talking to the RPC node.";
  }
  if (/tx size \d+ bytes exceeded/i.test(raw)) return "Transaction is too large.";

  const custom = raw.match(/"Custom":(\d+)/);
  if (custom) return `Transaction failed with program error ${custom[1]}.`;

  // first line, trimmed of JSON noise
  const first = raw.split("\n")[0].replace(/^Error:\s*/, "");
  return first.length > 180 ? first.slice(0, 177) + "…" : first || "Unknown error.";
}
