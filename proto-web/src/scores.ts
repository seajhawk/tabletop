import { DIFFICULTIES, WAVE_COUNTS, type Difficulty } from './types';

/** Local-only best scores: one versioned localStorage key, no network. */
export const SCORE_STORAGE_KEY = 'galactic-defense:best-scores:v1';
export const SCORE_VERSION = 1;
export const MAX_SCORE = 10_000_000;
export const PLAYER_COUNTS = [1, 2, 4] as const;

/** Transparent formula: kills*10 + remaining lives*100 + 1000 for a win. */
export function computeScore(kills: number, lives: number, won: boolean): number {
  return kills * 10 + Math.max(0, lives) * 100 + (won ? 1000 : 0);
}

export interface BestRecord { score: number; won: boolean }

export interface ScoreResult {
  runId: number;
  mapId: string;
  difficulty: Difficulty;
  players: number;
  waveCount?: number;
  score: number;
  best: number;
  /** True when this run beat the previous record (or set the first non-zero one). */
  improved: boolean;
  /** True only when the record was actually written to storage; false = kept for this session only. */
  persisted: boolean;
}

/** The slice of Game the recorder needs (keeps tests independent of the simulation). */
export interface ScoreSource {
  runId: number;
  mode: 'normal' | 'stress';
  over: 'won' | 'lost' | null;
  difficulty: Difficulty;
  playerCount: number;
  waveCount?: number;
  lives: number;
  currentMap: { id: string };
  stats: { kills: number };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const scoreKey = (mapId: string, d: string, p: number, waveCount = 10): string =>
  waveCount === 10 ? `${mapId}|${d}|${p}` : `${mapId}|${d}|${p}|w${waveCount}`;

export class ScoreBook {
  private records = new Map<string, BestRecord>();
  private loaded = false;
  /** False when storage is unreadable/unwritable-by-design (throwing getter/read, newer schema). */
  private canPersist = true;
  /** True while the in-memory bests include a write that failed. */
  private unsaved = false;
  private lastRunId = -1;
  private last: ScoreResult | null = null;
  private readonly maps: Set<string>;

  /** `getStorage` is called lazily and may throw or return null. */
  constructor(mapIds: readonly string[], private getStorage: () => StorageLike | null | undefined) {
    this.maps = new Set(mapIds);
  }

  /** Record a finished normal game exactly once per runId; returns its result (null if ineligible). */
  observe(g: ScoreSource): ScoreResult | null {
    if (g.mode !== 'normal' || (g.over !== 'won' && g.over !== 'lost')) return null;
    if (g.runId === this.lastRunId) return this.last;
    this.lastRunId = g.runId;
    this.last = null;
    const waveCount = g.waveCount ?? 10;
    if (!this.maps.has(g.currentMap.id) || !Object.prototype.hasOwnProperty.call(DIFFICULTIES, g.difficulty)
      || !(PLAYER_COUNTS as readonly number[]).includes(g.playerCount)
      || !(WAVE_COUNTS as readonly number[]).includes(waveCount)) return null;
    const won = g.over === 'won';
    const score = computeScore(g.stats.kills, g.lives, won);
    if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) return null;
    this.load();
    const key = scoreKey(g.currentMap.id, g.difficulty, g.playerCount, waveCount);
    const prev = this.records.get(key);
    const improved = prev ? score > prev.score : score > 0;
    if (!prev || improved) {
      this.records.set(key, { score, won });
      this.unsaved = !this.save();
    }
    this.last = {
      runId: g.runId, mapId: g.currentMap.id, difficulty: g.difficulty, players: g.playerCount, waveCount,
      score, best: this.records.get(key)!.score, improved, persisted: this.canPersist && !this.unsaved,
    };
    return this.last;
  }

  /** Result for the CURRENT run only; null after any reset/map/layout/difficulty change. */
  result(g: Pick<ScoreSource, 'runId' | 'over' | 'mode'>): ScoreResult | null {
    if (g.mode !== 'normal' || !g.over) return null;
    return this.last && this.last.runId === g.runId ? this.last : null;
  }

  bestFor(mapId: string, difficulty: Difficulty, players: number, waveCount = 10): number | undefined {
    this.load();
    return this.records.get(scoreKey(mapId, difficulty, players, waveCount))?.score;
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    let raw: string | null;
    try {
      const s = this.getStorage();
      if (!s) { this.canPersist = false; return; }
      raw = s.getItem(SCORE_STORAGE_KEY);
    } catch { this.canPersist = false; return; }
    if (raw == null) return;
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return; } // corrupt: start fresh, may overwrite
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
    const obj = data as Record<string, unknown>;
    if (obj.v !== SCORE_VERSION) {
      if (typeof obj.v === 'number' && obj.v > SCORE_VERSION) this.canPersist = false; // do not clobber newer data
      return;
    }
    const recs = obj.records;
    if (typeof recs !== 'object' || recs === null || Array.isArray(recs)) return;
    for (const m of this.maps) {
      for (const d of Object.keys(DIFFICULTIES)) {
        for (const p of PLAYER_COUNTS) {
          for (const w of WAVE_COUNTS) {
            const k = scoreKey(m, d, p, w);
            if (!Object.prototype.hasOwnProperty.call(recs, k)) continue;
            const r = (recs as Record<string, unknown>)[k];
            if (typeof r !== 'object' || r === null) continue;
            const { score, won } = r as Record<string, unknown>;
            if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) continue;
            this.records.set(k, { score, won: won === true });
          }
        }
      }
    }
  }

  /** One write attempt per improved match; failure downgrades to session-only without retry loops. */
  private save(): boolean {
    if (!this.canPersist) return false;
    try {
      const s = this.getStorage();
      if (!s) { this.canPersist = false; return false; }
      const records: Record<string, BestRecord> = {};
      for (const [k, v] of this.records) records[k] = v;
      s.setItem(SCORE_STORAGE_KEY, JSON.stringify({ v: SCORE_VERSION, records }));
      return true;
    } catch {
      return false; // quota/denied: keep session record; next improved match may try again
    }
  }
}

/** Safe lazy accessor: window.localStorage getter itself may throw. */
export function browserStorage(): StorageLike | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** Short summary-card copy. Second line is empty when there is nothing extra to say. */
export function scoreLines(r: ScoreResult): [string, string] {
  const extra: string[] = [];
  if (r.improved) extra.push('New best');
  if (!r.persisted) extra.push('Best this session only');
  return [`Score ${r.score} · Best ${r.best}`, extra.join(' · ')];
}
