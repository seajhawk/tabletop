// Pure combat & targeting math helpers (no rendering or mutable game state).
import type { TargetPriority } from '../types';

export interface TargetableEnemy {
  x: number;
  y: number;
  hp: number;
  shield: number;
  rem: number;
  dead: boolean;
  submerged?: boolean;
  revealedT?: number;
  def: { flying: boolean };
}

/**
 * Quadratic intercept lead calculation (Mindustry pattern).
 * Falls back to current target position when discriminant < 0 or target outruns projectile.
 */
export function predictIntercept(
  sx: number,
  sy: number,
  speed: number,
  tx: number,
  ty: number,
  vx: number,
  vy: number,
): { x: number; y: number } {
  const dx = tx - sx;
  const dy = ty - sy;
  const c = dx * dx + dy * dy;
  if (speed <= 0 || c <= 1e-12) return { x: tx, y: ty };

  const a = vx * vx + vy * vy - speed * speed;
  const b = 2 * (dx * vx + dy * vy);

  let t = -1;
  if (Math.abs(a) < 1e-8) {
    if (Math.abs(b) > 1e-8) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return { x: tx, y: ty };
    const sqrtD = Math.sqrt(disc);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
    else if (t1 > 0) t = t1;
    else if (t2 > 0) t = t2;
  }

  if (t <= 0 || !Number.isFinite(t)) return { x: tx, y: ty };
  return { x: tx + vx * t, y: ty + vy * t };
}

/**
 * Bearded.TD-style damage pipeline:
 * 1. Strip flat `shieldStrip` from shield.
 * 2. Apply `rawDamage * shieldMultiplier` to remaining shield; leftover converts back to raw HP damage.
 * 3. Reduce HP damage by armor unless `armorPierce` (minimum 25% of raw HP damage).
 */
export function computeHitDamage(
  rawDamage: number,
  armor: number,
  armorPierce: boolean,
  shield: number,
  shieldMultiplier: number,
  shieldStrip: number,
): { shieldDamage: number; hpDamage: number } {
  const s = Math.max(0, shield);
  const stripped = Math.min(s, Math.max(0, shieldStrip));
  const remShield = s - stripped;

  let shieldDamage = stripped;
  let hpRaw = 0;

  if (remShield > 0) {
    const mult = Math.max(0, shieldMultiplier);
    const effShieldDmg = rawDamage * mult;
    if (effShieldDmg <= remShield) {
      shieldDamage += effShieldDmg;
      hpRaw = 0;
    } else {
      shieldDamage = s;
      const leftover = effShieldDmg - remShield;
      hpRaw = mult > 0 ? leftover / mult : rawDamage;
    }
  } else {
    hpRaw = rawDamage;
  }

  const hpDamage =
    hpRaw > 0
      ? armorPierce
        ? hpRaw
        : Math.max(hpRaw * 0.25, hpRaw - Math.max(0, armor))
      : 0;

  return { shieldDamage, hpDamage };
}

/** Pick the highest-priority live enemy in range respecting `targetsAir`, `priority`, and stealth sub detection. */
export function pickTarget<T extends TargetableEnemy>(
  enemies: ReadonlyArray<T>,
  tx: number,
  ty: number,
  range: number,
  targetsAir: boolean,
  priority: TargetPriority,
  canDetectSub = false,
): T | null {
  const r2 = range * range;
  let best: T | null = null;
  let bestDist2 = Infinity;
  let bestStrength = -Infinity;

  for (const e of enemies) {
    if (e.dead) continue;
    if (e.submerged && (e.revealedT ?? 0) <= 0 && !canDetectSub) continue;
    if (!targetsAir && e.def.flying) continue;
    const dx = e.x - tx;
    const dy = e.y - ty;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;

    if (!best) {
      best = e;
      bestDist2 = d2;
      bestStrength = e.hp + e.shield;
      continue;
    }

    switch (priority) {
      case 'first':
        if (e.rem < best.rem) {
          best = e;
          bestDist2 = d2;
          bestStrength = e.hp + e.shield;
        }
        break;
      case 'strong': {
        const str = e.hp + e.shield;
        if (str > bestStrength || (str === bestStrength && e.rem < best.rem)) {
          best = e;
          bestDist2 = d2;
          bestStrength = str;
        }
        break;
      }
      case 'close':
        if (d2 < bestDist2 || (d2 === bestDist2 && e.rem < best.rem)) {
          best = e;
          bestDist2 = d2;
          bestStrength = e.hp + e.shield;
        }
        break;
      case 'air': {
        const eAir = e.def.flying ? 1 : 0;
        const bAir = best.def.flying ? 1 : 0;
        if (eAir > bAir || (eAir === bAir && e.rem < best.rem)) {
          best = e;
          bestDist2 = d2;
          bestStrength = e.hp + e.shield;
        }
        break;
      }
    }
  }

  return best;
}

/** Segment-circle intersection test for piercing railgun rays. */
export function lineIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-12) {
    const ox = cx - x1;
    const oy = cy - y1;
    return ox * ox + oy * oy <= r * r;
  }
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / len2));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const ex = cx - px;
  const ey = cy - py;
  return ex * ex + ey * ey <= r * r;
}
