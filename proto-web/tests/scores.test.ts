import { describe, expect, it } from 'vitest';
import { loadData } from '../src/data';
import { computeScore, SCORE_STORAGE_KEY, ScoreBook, scoreLines } from '../src/scores';
import { newGame } from './helpers';

const data = loadData();
const mapIds = (data.maps ?? [data.map]).map(m => m.id);

class FakeStorage {
  items = new Map<string, string>();
  writes = 0;
  failWrite = false;
  getItem(k: string) { return this.items.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.failWrite) throw new Error('quota');
    this.writes++;
    this.items.set(k, v);
  }
}

const book = (s: FakeStorage | null | (() => never)) =>
  new ScoreBook(mapIds, typeof s === 'function' ? s : () => s);

function finish(g: ReturnType<typeof newGame>, kills: number, lives: number, over: 'won' | 'lost' = 'lost') {
  g.stats.kills = kills;
  g.lives = lives;
  g.over = over;
}

describe('score formula and eligibility', () => {
  it('is kills*10 + lives*100 + 1000 for a win', () => {
    expect(computeScore(12, 5, true)).toBe(120 + 500 + 1000);
    expect(computeScore(12, 0, false)).toBe(120);
    expect(computeScore(3, -4, false)).toBe(30);
  });

  it('records won and lost normal games only', () => {
    const b = book(new FakeStorage());
    const g = newGame(2);
    expect(b.observe(g)).toBeNull(); // unfinished
    finish(g, 10, 0, 'lost');
    expect(b.observe(g)?.score).toBe(100);
    g.reset();
    finish(g, 10, 3, 'won');
    expect(b.observe(g)?.score).toBe(100 + 300 + 1000);
  });

  it('skips stress mode and unfinished/reset runs', () => {
    const s = new FakeStorage();
    const b = book(s);
    const g = newGame(2);
    g.setupStress();
    finish(g, 99, 5, 'won');
    expect(b.observe(g)).toBeNull();
    expect(b.result(g)).toBeNull();
    g.reset();
    expect(b.observe(g)).toBeNull();
    expect(s.writes).toBe(0);
  });

  it('rejects inherited object names as difficulty values without saving', () => {
    const s = new FakeStorage();
    for (const invalid of ['toString', '__proto__']) {
      const g = newGame(2);
      finish(g, 10, 0);
      g.difficulty = invalid as typeof g.difficulty;
      expect(book(s).observe(g)).toBeNull();
    }
    expect(s.writes).toBe(0);
  });
});

describe('best tracking and isolation', () => {
  it('keeps separate bests per map, difficulty and player count', () => {
    const b = book(new FakeStorage());
    const g = newGame(2);
    finish(g, 10, 1);
    b.observe(g);
    g.reset(4); finish(g, 5, 1); // different player count
    expect(b.observe(g)?.best).toBe(150);
    g.reset(2); g.setDifficulty('hard'); finish(g, 1, 1);
    expect(b.observe(g)?.best).toBe(110);
    g.reset(2, 0); g.setDifficulty('medium');
    expect(b.bestFor(g.currentMap.id, 'medium', 2)).toBe(200);
    if (mapIds.length > 1) {
      g.setMap(1); finish(g, 1, 0);
      expect(b.observe(g)?.best).toBe(10);
    }
  });

  it('ties and worse scores keep the previous record without writing', () => {
    const s = new FakeStorage();
    const b = book(s);
    const g = newGame(2);
    finish(g, 10, 1); b.observe(g);
    expect(s.writes).toBe(1);
    g.reset(); finish(g, 10, 1);
    const tie = b.observe(g)!;
    expect(tie).toMatchObject({ score: 200, best: 200, improved: false, persisted: true });
    g.reset(); finish(g, 2, 1);
    expect(b.observe(g)).toMatchObject({ best: 200, improved: false });
    expect(s.writes).toBe(1);
  });

  it('persists improvements and reloads them in a new book', () => {
    const s = new FakeStorage();
    const g = newGame(2);
    finish(g, 10, 1);
    const r = book(s).observe(g)!;
    expect(r).toMatchObject({ improved: true, persisted: true });
    const b2 = book(s);
    expect(b2.bestFor(g.currentMap.id, 'medium', 2)).toBe(200);
    g.reset(); finish(g, 30, 1);
    expect(b2.observe(g)).toMatchObject({ score: 400, best: 400, improved: true });
    expect(book(s).bestFor(g.currentMap.id, 'medium', 2)).toBe(400);
  });
});

describe('run identity', () => {
  it('records a finished run once, even when observed every frame', () => {
    const s = new FakeStorage();
    const b = book(s);
    const g = newGame(2);
    finish(g, 10, 1);
    for (let i = 0; i < 100; i++) b.observe(g);
    expect(s.writes).toBe(1);
  });

  it('treats an identical replay as a separate match', () => {
    const s = new FakeStorage();
    const b = book(s);
    const g = newGame(2);
    finish(g, 10, 1);
    const first = b.observe(g)!;
    g.reset();
    expect(g.runId).toBeGreaterThan(first.runId);
    finish(g, 10, 1);
    const second = b.observe(g)!;
    expect(second.runId).toBe(g.runId);
    expect(second.improved).toBe(false);
  });

  it('never leaks a result across reset, map, layout or difficulty change', () => {
    const b = book(new FakeStorage());
    const g = newGame(2);
    finish(g, 10, 1);
    b.observe(g);
    expect(b.result(g)).not.toBeNull();
    g.reset();
    expect(b.result(g)).toBeNull();
    finish(g, 10, 1); b.observe(g);
    g.reset(4);
    expect(b.result(g)).toBeNull();
    finish(g, 10, 1); b.observe(g);
    g.setDifficulty('easy');
    expect(b.result(g)).toBeNull();
    finish(g, 10, 1); b.observe(g);
    g.setMap(g.mapIndex + 1);
    expect(b.result(g)).toBeNull();
  });
});

describe('storage robustness', () => {
  const seed = (s: FakeStorage, v: unknown) => s.items.set(SCORE_STORAGE_KEY, typeof v === 'string' ? v : JSON.stringify(v));
  const key = `${mapIds[0]}|medium|2`;

  it('loads valid records and drops malformed ones', () => {
    const s = new FakeStorage();
    seed(s, {
      v: 1,
      records: {
        [key]: { score: 500, won: true },
        [`${mapIds[0]}|hard|2`]: { score: -5 },
        [`${mapIds[0]}|easy|2`]: { score: 1.5 },
        [`${mapIds[0]}|easy|1`]: { score: 'x' },
        [`${mapIds[0]}|easy|4`]: { score: 1e99 },
        [`${mapIds[0]}|hard|1`]: { score: null },
        'nowhere|medium|2': { score: 9 },
        [`${mapIds[0]}|medium|3`]: { score: 9 },
        ['__proto__']: { score: 9 },
      },
    });
    const b = book(s);
    expect(b.bestFor(mapIds[0], 'medium', 2)).toBe(500);
    for (const d of ['hard', 'easy'] as const) for (const p of [1, 2, 4]) {
      expect(b.bestFor(mapIds[0], d, p)).toBeUndefined();
    }
    expect(({} as Record<string, unknown>).score).toBeUndefined();
  });

  it('survives corrupt json and wrong shapes', () => {
    for (const raw of ['{nope', 'null', '[]', '"x"', '{"v":1,"records":[]}', '{"v":1}']) {
      const s = new FakeStorage();
      seed(s, raw);
      const g = newGame(2);
      finish(g, 1, 0);
      expect(book(s).observe(g)).toMatchObject({ score: 10, best: 10 });
    }
  });

  it('does not overwrite a newer schema version and reports session-only', () => {
    const s = new FakeStorage();
    seed(s, { v: 2, records: { [key]: { score: 9999 } } });
    const g = newGame(2);
    finish(g, 1, 0);
    const r = book(s).observe(g)!;
    expect(r).toMatchObject({ best: 10, persisted: false });
    expect(s.writes).toBe(0);
  });

  it('falls back to session records when the storage getter throws', () => {
    const b = book((() => { throw new Error('denied'); }) as () => never);
    const g = newGame(2);
    finish(g, 1, 0);
    const r = b.observe(g)!;
    expect(r).toMatchObject({ best: 10, improved: true, persisted: false });
    g.reset(); finish(g, 5, 0);
    expect(b.observe(g)).toMatchObject({ best: 50, persisted: false });
    expect(scoreLines(r)[1]).toContain('this session');
  });

  it('falls back when getItem throws, without throwing into the game', () => {
    const s = { getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } };
    const b = new ScoreBook(mapIds, () => s);
    const g = newGame(2);
    finish(g, 1, 0);
    expect(b.observe(g)?.persisted).toBe(false);
  });

  it('keeps the session best on write failure, tries once per improved match, and recovers', () => {
    const s = new FakeStorage();
    s.failWrite = true;
    const b = book(s);
    const g = newGame(2);
    finish(g, 10, 0);
    for (let i = 0; i < 50; i++) b.observe(g); // frames: no retry loop
    expect(b.result(g)).toMatchObject({ best: 100, persisted: false });
    g.reset(); finish(g, 1, 0); // worse: still flagged unsaved
    expect(b.observe(g)).toMatchObject({ best: 100, persisted: false });
    s.failWrite = false;
    g.reset(); finish(g, 20, 0);
    expect(b.observe(g)).toMatchObject({ best: 200, persisted: true });
    expect(s.writes).toBe(1);
  });
});

describe('scoreLines copy', () => {
  it('shows score, best and new-best without session note when saved', () => {
    expect(scoreLines({ runId: 1, mapId: 'm', difficulty: 'easy', players: 1, score: 5, best: 5, improved: true, persisted: true }))
      .toEqual(['Score 5 · Best 5', 'New best']);
    expect(scoreLines({ runId: 1, mapId: 'm', difficulty: 'easy', players: 1, score: 3, best: 5, improved: false, persisted: true }))
      .toEqual(['Score 3 · Best 5', '']);
  });
});
