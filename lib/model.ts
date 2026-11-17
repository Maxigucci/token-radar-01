// The radar's model: the sealed snapshot in, a ranked board of pre-token protocols out.
//
// Every number here comes from the snapshot's own ten fields. A protocol's implied launch value is
//
//   tvl_usd x base_multiple          what the protocol is worth today, at a conservative multiple
//   x growth_multiplier              its seven-day TVL change, rewards up and punishes down
//   x maturity_multiplier            how long the protocol has run with no token to sell
//   x category_multiplier            the market's appetite for that kind of protocol
//   x chain_multiplier               distribution across chains
//   x quality_multiplier             whether DefiLlama's record is complete for it
//
// and nothing else. No protocol is named in the model, so the same function scores every row; the
// dashboard states the constants and repeats the arithmetic in the page so the board and the page
// visibly agree.

/** One protocol as the sealed snapshot holds it: exactly ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: stated in the dashboard, exported so the page and the board share them. */
export interface ModelConstants {
  base_multiple: number;
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  growth_penalty: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_cap: number;
  early_rows: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.22,
  growth_floor: -50,
  growth_cap: 150,
  growth_weight: 0.6,
  growth_penalty: 0.35,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 270,
  chain_step: 0.02,
  chain_cap: 4,
  early_rows: 200,
};

export const MODEL_VERSION = 'radar-2.1';

/** The label the board and the page print beside the model. */
export const MODEL_NOTE = 'derived only from TVL, 7-day change, age, category, chains and record quality';

/** Every multiplied factor behind one protocol's implied value. */
export interface Factors {
  base_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiplier: number;
  chain_multiplier: number;
  quality_multiplier: number;
}

/** One ranked row of board.json. Extra keys are allowed; the gate reads the required ones. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_multiple: number;
  factors: Factors;
  why: string;
  risk: string;
  farm_steps: string[];
}

/** The compact row the dashboard renders; farm steps and factors travel with it so the page and board agree. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  implied_multiple: number;
  factors: Factors;
  why: string;
  risk: string;
  farm_steps: string[];
}

/** A protocol whose token already trades: shown at the market's value, never on the ranked board. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_tvl: number;
}

/** Everything data.js carries. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  model_note: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  tracked_size: number;
  covered_tvl_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;

/** A finite number, else the fallback. */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from the snapshot date back to the listing date; null when the date is missing. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** A protocol is pre-token when DefiLlama records no token for it at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The appetite multiplier for a protocol's category, by keyword; never by protocol name. */
export function categoryMultiplier(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('rwa') || c.includes('real world')) return 1.22;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 1.18;
  if (c.includes('dex') || c.includes('exchange')) return 1.15;
  if (c.includes('prediction')) return 1.12;
  if (c.includes('perpetual') || c.includes('derivative')) return 1.1;
  if (c.includes('yield aggregator')) return 1.06;
  if (c.includes('yield') || c.includes('basis')) return 1.04;
  if (c.includes('restak')) return 1.02;
  if (c.includes('stable')) return 1.0;
  if (c.includes('liquid staking') || c.includes('staking pool')) return 0.95;
  if (c.includes('insurance')) return 0.94;
  if (c.includes('curator') || c.includes('allocator')) return 0.92;
  if (c.includes('bridge') || c.includes('canonical')) return 0.78;
  if (c.includes('cex') || c.includes('centralized')) return 0.6;
  return 1.0;
}

/** The record-quality multiplier: a missing listing date or missing change is less certain. */
export function qualityMultiplier(p: SnapshotProtocol): number {
  let q = 1;
  if (p.listed_at === null) q *= 0.94;
  if (p.change_7d === null) q *= 0.96;
  if (p.chains.length === 0) q *= 0.97;
  return round6(q);
}

/** The six factors and the implied value for one protocol under `model`. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; age: number | null; factors: Factors } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = num(p.change_7d, 0);
  const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMultiplier =
    growth >= 0
      ? 1 + (growth / 100) * model.growth_weight
      : Math.max(0.45, 1 + (growth / 100) * model.growth_weight - (Math.abs(growth) / 100) * model.growth_penalty);
  const ageForModel = age ?? model.unknown_age_days;
  const maturity = Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  const maturityMultiplier = model.maturity_floor + maturity * model.maturity_range;
  const chainMultiplier = 1 + Math.min(Math.max(p.chains.length - 1, 0), model.chain_cap) * model.chain_step;
  const category = categoryMultiplier(p.category);
  const quality = qualityMultiplier(p);
  const base = p.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMultiplier * maturityMultiplier * category * chainMultiplier * quality));
  return {
    implied,
    age,
    factors: {
      base_usd: Math.round(base),
      growth_multiplier: round6(growthMultiplier),
      maturity_multiplier: round6(maturityMultiplier),
      category_multiplier: round6(category),
      chain_multiplier: round6(chainMultiplier),
      quality_multiplier: quality,
    },
  };
}

/** Compact dollars for the human-facing sentence, never for the gate's integer fields. */
function money(value: number): string {
  const n = Math.abs(value);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** A one-line reason the row sits where it does, from the factors, never from a name. */
function whyFor(p: SnapshotProtocol, factors: Factors, implied: number): string {
  const ratio = round2(implied / Math.max(p.tvl_usd, 1));
  const growth = num(p.change_7d, 0);
  const trend = growth >= 8 ? 'TVL is climbing' : growth <= -8 ? 'TVL is falling' : 'TVL is flat';
  return `${trend} at ${money(p.tvl_usd)}, and the model prices it at ${ratio.toFixed(2)}x TVL.`;
}

/** A one-line risk a farmer should know, from the row's own record. */
function riskFor(p: SnapshotProtocol, age: number | null): string {
  const notes: string[] = [];
  const growth = num(p.change_7d, 0);
  if (growth <= -15) notes.push('seven-day TVL is down sharply');
  if (age !== null && age < 180) notes.push('listed recently, so its record is short');
  if (age === null) notes.push('DefiLlama gives no listing date');
  if (p.chains.length >= 6) notes.push('spread across many chains, so activity is harder to track');
  if (p.category === null) notes.push('uncategorised by DefiLlama');
  if (notes.length === 0) notes.push('no token is recorded, but the protocol may still plan one');
  return `Risk: ${notes.join('; ')}.`;
}

const VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;

/** Pre-token, not an exchange, not a versioned pool of another protocol. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The watchlist plus the largest pre-token protocols below the floor, each scored once. */
export function chosenProtocols(snapshot: Snapshot, model: ModelConstants): SnapshotProtocol[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, model.early_rows);
  for (const p of early) chosen.set(p.slug, p);
  return [...chosen.values()];
}

/** The ranked board: strongest implied value first, ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const scored = chosenProtocols(snapshot, model).map((p) => ({ p, ...scoreProtocol(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || a.p.slug.localeCompare(b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_multiple: round2(s.implied / Math.max(s.p.tvl_usd, 1)),
    factors: s.factors,
    why: whyFor(s.p, s.factors, s.implied),
    risk: riskFor(s.p, s.age),
    farm_steps: farmPlan(s.p, s.age, s.factors),
  }));
}

/** A step: an action, what it costs, and how long it takes, as one gate-safe string. */
function step(action: string, cost: string, time: string): string {
  let text = `${action} Cost: ${cost}. Time: ${time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text = `${text} Check the protocol's own page before acting.`;
  return text;
}

/** Capital sized to the protocol's TVL and trend, so a falling protocol asks for less. */
function capitalFor(p: SnapshotProtocol): number {
  const growth = num(p.change_7d, 0);
  const base = p.tvl_usd >= 5_000_000_000 ? 250 : p.tvl_usd >= 1_000_000_000 ? 150 : p.tvl_usd >= 100_000_000 ? 100 : 50;
  if (growth <= -15) return Math.max(25, Math.round(base / 2 / 25) * 25);
  if (growth >= 15) return base;
  return Math.round(base * 0.75 / 25) * 25;
}

/** How long to keep the position: young protocols need a longer record to qualify. */
function holdDays(age: number | null): number {
  if (age === null) return 45;
  if (age < 120) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The main action for the protocol's category, on its first chain. */
function actionFor(p: SnapshotProtocol, capital: number): string {
  const c = (p.category ?? '').toLowerCase();
  const chain = p.chains[0] ?? 'its main chain';
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it and repay it, so both sides of the market count as activity`;
  if (c.includes('dex') || c.includes('exchange')) return `Add $${capital} of USDC to ${name}'s deepest pool on ${chain} and keep the LP position open`;
  if (c.includes('rwa') || c.includes('real world')) return `Mint or deposit $${capital} into ${name}'s yield asset on ${chain} and hold the receipt`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} on ${chain} and place one small position in a market you understand`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s main vault on ${chain} and keep the shares`;
  if (c.includes('restak')) return `Restake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token`;
  if (c.includes('liquid staking') || c.includes('staking pool')) return `Stake $${capital} of the chain's asset through ${name} on ${chain} and keep the liquid receipt`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds inside its own app`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
}

/** A protocol's farm plan: seven concrete steps, each with a cost and a time. */
export function farmPlan(p: SnapshotProtocol, age: number | null, factors: Factors): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const capital = capitalFor(p);
  const hold = holdDays(age);
  const gas = capital >= 150 ? 8 : 4;
  const young = age !== null && age < 180;
  return [
    step(
      `Set up a fresh wallet for ${p.name} only, write its seed phrase on paper, and fund it with $${capital} plus gas from an exchange you already use`,
      `$${capital} of capital and under $3 of first-transaction gas`,
      '10 minutes',
    ),
    step(
      `Confirm on ${p.name}'s official site and DefiLlama page that no token trades yet and that ${chain} is the chain you want; save both links`,
      'nothing but time, and never pay for a link',
      '10 minutes',
    ),
    step(actionFor(p, capital), `$${capital} and about $${gas} of gas`, '20 minutes'),
    step(
      `Return once a week for ${hold} days to make one qualifying action, such as a deposit, a borrow, a swap or a governance vote`,
      'about $2 of gas a week',
      '10 minutes a week',
    ),
    step(
      `Keep a farm log of every transaction hash, date and amount for ${p.name}, and screenshot the position so a snapshot can be matched later`,
      'nothing',
      '5 minutes a week',
    ),
    step(
      `Before withdrawing, read ${p.name}'s own points or rewards page and claim only through the link its official site publishes; never pay to claim`,
      'no fee to check, and never a fee to claim',
      '15 minutes',
    ),
    step(
      young
        ? `Because ${p.name} is young, start with half the position and add the rest only after a second month of stable TVL`
        : `Because ${p.name} has run ${age === null ? 'an unknown time' : `${age} days`}, keep the position for at least ${hold} days and unwind in two steps rather than at once`,
      'the same capital, held longer',
      `${hold} days`,
    ),
  ];
}

/** The live-token protocols, by market cap, for the dashboard's second view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
      mcap_tvl: round2((p.mcap_usd as number) / Math.max(p.tvl_usd, 1)),
    }));
}

/** Data.js: the board, the live set, the model and the headline figures. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const covered = board.reduce((sum, r) => sum + r.tvl_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    model_note: MODEL_NOTE,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    tracked_size: snapshot.protocols.length,
    covered_tvl_usd: covered,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      watchlist: r.watchlist,
      implied_value_usd: r.implied_value_usd,
      implied_multiple: r.implied_multiple,
      factors: r.factors,
      why: r.why,
      risk: r.risk,
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

/** The snapshot's text, refused unless it has the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist');
  const protocols = o.protocols.map((value, i) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = value as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board the gate would refuse, or null. Mirrors the gate's rows so a bad board fails here first. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `missing ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `only ${board.length} rows, the gate wants 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'every row shares one implied value';
  for (const row of board) {
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has an invalid implied value`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const s of row.farm_steps) if (s.length < 20 || s.length > 600) return `${row.slug} has a farm step of ${s.length} characters`;
  }
  return null;
}

/** The one-line data.js the dashboard loads beside itself. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
