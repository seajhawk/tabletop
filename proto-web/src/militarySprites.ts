import { Texture } from 'pixi.js';

export interface MilitaryTextureSet {
  bases: Record<string, Texture>;
  turrets: Record<string, [Texture, Texture, Texture]>;
  enemies: Record<string, Texture>;
  obstacles: Texture[];
  crater: Texture;
  destroy(): void;
}

const TURRET_KEYS = ['pulse', 'plasma', 'stasis', 'railgun', 'swarm'] as const;
const ENEMY_KEYS = ['scout', 'swarmer', 'cruiser', 'frigate', 'phase', 'dreadnought'] as const;

const INK_OUTLINE = '#0d100d';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintCanvas(
  size: number,
  painter: (ctx: CanvasRenderingContext2D, size: number) => void,
): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.EMPTY;
  painter(ctx, size);
  return Texture.from(canvas);
}

function withGroundShadow(
  ctx: CanvasRenderingContext2D,
  fn: () => void,
  blur = 5,
  ox = -2.5,
  oy = 2.5,
  alpha = 0.62,
): void {
  ctx.save();
  ctx.shadowColor = `rgba(4, 6, 4, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = ox;
  ctx.shadowOffsetY = oy;
  fn();
  ctx.restore();
}

function strokeInk(ctx: CanvasRenderingContext2D, width = 1.75): void {
  ctx.save();
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function octagonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawMetalBarrel(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y: number,
  x2: number,
  width: number,
  opts: {
    baseDark?: string;
    baseMid?: string;
    baseLight?: string;
    evacuatorAt?: number;
    muzzleBrake?: boolean;
    heatBlued?: boolean;
    outlineWidth?: number;
  } = {},
): void {
  const dark = opts.baseDark ?? '#202420';
  const mid = opts.baseMid ?? '#4b5249';
  const light = opts.baseLight ?? '#8c9489';
  const grad = ctx.createLinearGradient(0, y - width / 2, 0, y + width / 2);
  grad.addColorStop(0, light);
  grad.addColorStop(0.45, mid);
  grad.addColorStop(1, dark);

  ctx.fillStyle = grad;
  ctx.fillRect(x1, y - width / 2, x2 - x1, width);
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = opts.outlineWidth ?? 1.5;
  ctx.strokeRect(x1, y - width / 2, x2 - x1, width);

  if (opts.evacuatorAt !== undefined) {
    const ex = x1 + (x2 - x1) * opts.evacuatorAt;
    const ew = Math.max(6, (x2 - x1) * 0.2);
    const eh = width * 1.65;
    const eGrad = ctx.createLinearGradient(0, y - eh / 2, 0, y + eh / 2);
    eGrad.addColorStop(0, light);
    eGrad.addColorStop(0.5, mid);
    eGrad.addColorStop(1, dark);
    ctx.fillStyle = eGrad;
    roundedRectPath(ctx, ex - ew / 2, y - eh / 2, ew, eh, 1.5);
    ctx.fill();
    strokeInk(ctx, 1.4);
  }

  if (opts.heatBlued) {
    const tipW = Math.min(8, (x2 - x1) * 0.24);
    const bGrad = ctx.createLinearGradient(x2 - tipW, 0, x2, 0);
    bGrad.addColorStop(0, 'rgba(65, 85, 118, 0)');
    bGrad.addColorStop(1, 'rgba(56, 86, 132, 0.78)');
    ctx.fillStyle = bGrad;
    ctx.fillRect(x2 - tipW, y - width / 2, tipW, width);
  }

  if (opts.muzzleBrake) {
    const mw = Math.max(5.5, width * 0.9);
    const mh = width * 2.1;
    ctx.fillStyle = '#333832';
    roundedRectPath(ctx, x2 - 2, y - mh / 2, mw, mh, 1.2);
    ctx.fill();
    strokeInk(ctx, 1.5);
    ctx.fillStyle = '#121512';
    ctx.fillRect(x2 + mw * 0.28 - 1, y - mh * 0.36, 1.8, mh * 0.72);
  }
}

function drawTrackSponson(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ribCount: number,
): void {
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#3a3e39');
  grad.addColorStop(0.5, '#1e211e');
  grad.addColorStop(1, '#111311');
  ctx.fillStyle = grad;
  roundedRectPath(ctx, x, y, w, h, 2.5);
  ctx.fill();

  ctx.strokeStyle = 'rgba(130, 138, 124, 0.48)';
  ctx.lineWidth = 1.1;
  const step = w / ribCount;
  for (let i = 1; i < ribCount; i++) {
    const rx = x + i * step;
    ctx.beginPath();
    ctx.moveTo(rx, y + 1);
    ctx.lineTo(rx, y + h - 1);
    ctx.stroke();
  }
  roundedRectPath(ctx, x, y, w, h, 2.5);
  strokeInk(ctx, 1.6);
}

function drawWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  grad.addColorStop(0, '#444844');
  grad.addColorStop(0.5, '#1d201d');
  grad.addColorStop(1, '#0d0f0d');
  ctx.fillStyle = grad;
  roundedRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 2);
  ctx.fill();
  strokeInk(ctx, 1.4);
}

function drawHatch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  highlight = '#a6ab92',
): void {
  ctx.fillStyle = '#1b1f19';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.1, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(cx + r * 0.25, cy - r * 0.25, 0.5, cx, cy, r);
  grad.addColorStop(0, highlight);
  grad.addColorStop(0.6, fill);
  grad.addColorStop(1, '#262b21');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#141812';
  ctx.fillRect(cx - r * 0.65, cy - 1, 2.4, 2);
}

function drawRedStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha = 0.96): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#e03535';
  ctx.strokeStyle = '#3b0a0a';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSandbagRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  count: number,
  seed: number,
): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.06;
    const bx = cx + Math.cos(ang) * radius;
    const by = cy + Math.sin(ang) * radius;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang + Math.PI / 2);
    const bw = 11 + rand() * 2.5;
    const bh = 6.2 + rand() * 1.2;
    const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    grad.addColorStop(0, '#cbb486');
    grad.addColorStop(0.5, '#b59e72');
    grad.addColorStop(1, '#7a6845');
    ctx.fillStyle = grad;
    roundedRectPath(ctx, -bw / 2, -bh / 2, bw, bh, 2.6);
    ctx.fill();
    strokeInk(ctx, 1.35);
    ctx.restore();
  }
}

// ============================================================================
// 1. FORTIFIED BASE PADS (96x96)
// ============================================================================

function paintBase(type: (typeof TURRET_KEYS)[number]): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (type === 'railgun') {
      // Rectangular Desert-Tan tracked M1A2 Abrams lower hull
      withGroundShadow(ctx, () => {
        drawTrackSponson(ctx, c - 30, c - 24, 60, 10, 14);
        drawTrackSponson(ctx, c - 30, c + 14, 60, 10, 14);

        const hullGrad = ctx.createLinearGradient(c - 28, c - 16, c + 28, c + 16);
        hullGrad.addColorStop(0, '#e5cf97');
        hullGrad.addColorStop(0.55, '#d6be86');
        hullGrad.addColorStop(1, '#a68f5a');
        ctx.fillStyle = hullGrad;
        roundedRectPath(ctx, c - 28, c - 15, 56, 30, 3);
        ctx.fill();
      }, 6);

      roundedRectPath(ctx, c - 28, c - 15, 56, 30, 3);
      strokeInk(ctx, 1.8);

      // Rear engine deck grilles
      ctx.fillStyle = '#332f22';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(c - 24 + i * 4.5, c - 10, 2.8, 20);
      }

      // Sloped front glacis plates
      ctx.strokeStyle = '#7d6a3e';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(c + 15, c - 13);
      ctx.lineTo(c + 26, c - 9);
      ctx.lineTo(c + 26, c + 9);
      ctx.lineTo(c + 15, c + 13);
      ctx.stroke();

      // Turret ring
      ctx.strokeStyle = '#4a4028';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, 13, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (type === 'pulse') {
      // Round tan sandbag ring around dark AA pad
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#2c302c';
        ctx.beginPath();
        ctx.arc(c, c, 31, 0, Math.PI * 2);
        ctx.fill();
      }, 5);

      const padGrad = ctx.createRadialGradient(c + 4, c - 4, 4, c, c, 28);
      padGrad.addColorStop(0, '#3e443e');
      padGrad.addColorStop(1, '#232723');
      ctx.fillStyle = padGrad;
      ctx.beginPath();
      ctx.arc(c, c, 28, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.6);

      drawSandbagRing(ctx, c, c, 29, 16, 201);

      // Subtle brass/olive ammo crate
      ctx.fillStyle = '#5f6b47';
      ctx.fillRect(c - 18, c + 10, 11, 7);
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(c - 18, c + 10, 11, 7);
    } else if (type === 'plasma') {
      // Octagonal earthy brown-ochre artillery pit with warm orange-brass ammo crates
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#5e472f';
        octagonPath(ctx, c, c, 34);
        ctx.fill();
      }, 5);

      const pitGrad = ctx.createRadialGradient(c + 4, c - 4, 4, c, c, 34);
      pitGrad.addColorStop(0, '#785c3d');
      pitGrad.addColorStop(0.65, '#5e472f');
      pitGrad.addColorStop(1, '#3d2e1e');
      ctx.fillStyle = pitGrad;
      octagonPath(ctx, c, c, 34);
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Inner recessed artillery ring
      ctx.strokeStyle = '#332618';
      ctx.lineWidth = 1.6;
      octagonPath(ctx, c, c, 25);
      ctx.stroke();

      // Warm orange-brass ammo crates at rear
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = '#d98a3b';
        roundedRectPath(ctx, c - 24, c - 14 + i * 16, 10, 11, 1.5);
        ctx.fill();
        strokeInk(ctx, 1.2);
      }
    } else if (type === 'stasis') {
      // Crisp light-slate square concrete helipad/radar pad
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#6f7c78';
        roundedRectPath(ctx, c - 30, c - 30, 60, 60, 4);
        ctx.fill();
      }, 5);

      const padGrad = ctx.createLinearGradient(c - 30, c - 30, c + 30, c + 30);
      padGrad.addColorStop(0, '#85948f');
      padGrad.addColorStop(0.5, '#6f7c78');
      padGrad.addColorStop(1, '#525e5a');
      ctx.fillStyle = padGrad;
      roundedRectPath(ctx, c - 30, c - 30, 60, 60, 4);
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Crisp corner bracket markings
      ctx.strokeStyle = 'rgba(228, 240, 236, 0.65)';
      ctx.lineWidth = 1.8;
      const m = 23;
      const t = 7;
      const corners: [number, number, number, number][] = [
        [-m, -m, 1, 1],
        [m, -m, -1, 1],
        [-m, m, 1, -1],
        [m, m, -1, -1],
      ];
      for (const [ox, oy, dx, dy] of corners) {
        ctx.beginPath();
        ctx.moveTo(c + ox + dx * t, c + oy);
        ctx.lineTo(c + ox, c + oy);
        ctx.lineTo(c + ox, c + oy + dy * t);
        ctx.stroke();
      }
    } else if (type === 'swarm') {
      // Heavy dark-steel concrete pad with diagonal yellow/black hazard corner ticks & steel outrigger legs
      const outriggers: [number, number][] = [
        [c - 28, c - 28],
        [c + 28, c - 28],
        [c - 28, c + 28],
        [c + 28, c + 28],
      ];
      for (const [jx, jy] of outriggers) {
        ctx.strokeStyle = '#1b1f1e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(jx, jy);
        ctx.stroke();

        ctx.fillStyle = '#5a6360';
        roundedRectPath(ctx, jx - 5.5, jy - 5.5, 11, 11, 2);
        ctx.fill();
        strokeInk(ctx, 1.5);
      }

      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#363c3b';
        roundedRectPath(ctx, c - 27, c - 27, 54, 54, 6);
        ctx.fill();
      }, 5);

      const padGrad = ctx.createRadialGradient(c + 5, c - 5, 4, c, c, 32);
      padGrad.addColorStop(0, '#49504f');
      padGrad.addColorStop(1, '#282d2c');
      ctx.fillStyle = padGrad;
      roundedRectPath(ctx, c - 27, c - 27, 54, 54, 6);
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Diagonal yellow/black hazard corner ticks
      const tickOffsets: [number, number][] = [
        [-18, -18],
        [18, -18],
        [-18, 18],
        [18, 18],
      ];
      for (const [tx, ty] of tickOffsets) {
        ctx.fillStyle = '#e6b82e';
        ctx.fillRect(c + tx - 4, c + ty - 4, 8, 8);
        ctx.fillStyle = '#141614';
        ctx.beginPath();
        ctx.moveTo(c + tx - 4, c + ty + 4);
        ctx.lineTo(c + tx + 4, c + ty - 4);
        ctx.lineTo(c + tx + 4, c + ty);
        ctx.lineTo(c + tx, c + ty + 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = INK_OUTLINE;
        ctx.lineWidth = 1;
        ctx.strokeRect(c + tx - 4, c + ty - 4, 8, 8);
      }
    }

    // Center turret ring mount
    ctx.strokeStyle = '#1d211d';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(c, c, 13, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// ============================================================================
// 2. US DEFENDING ROTATING TURRETS (96x96, Tier 0/1/2, facing RIGHT +X)
// ============================================================================

function drawBrassGatlingCluster(
  ctx: CanvasRenderingContext2D,
  x1: number,
  cy: number,
  x2: number,
  spread: number,
  heatBlued: boolean,
): void {
  for (const offset of [-spread, 0, spread]) {
    drawMetalBarrel(ctx, x1, cy + offset, x2, 2.8, {
      baseLight: '#fff0a8',
      baseMid: '#f0cc60',
      baseDark: '#96701c',
      heatBlued,
      outlineWidth: 1.1,
    });
  }
  // Barrel clamp bands
  ctx.fillStyle = '#2d322c';
  ctx.fillRect(x1 + (x2 - x1) * 0.55, cy - spread - 2.2, 3.5, spread * 2 + 4.4);
  ctx.fillRect(x2 - 5, cy - spread - 2.2, 3.5, spread * 2 + 4.4);
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x1 + (x2 - x1) * 0.55, cy - spread - 2.2, 3.5, spread * 2 + 4.4);
  ctx.strokeRect(x2 - 5, cy - spread - 2.2, 3.5, spread * 2 + 4.4);
}

function paintPulseTurret(tier: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    withGroundShadow(ctx, () => {
      if (tier === 0) {
        drawBrassGatlingCluster(ctx, c + 6, c, c + 40, 3.2, false);
      } else {
        drawBrassGatlingCluster(ctx, c + 6, c - 7.5, c + 41, 2.8, tier >= 2);
        drawBrassGatlingCluster(ctx, c + 6, c + 7.5, c + 41, 2.8, tier >= 2);
      }

      // Bright brass ammo drum(s) on side
      const drawDrum = (dx: number, dy: number, w: number, h: number) => {
        const dGrad = ctx.createLinearGradient(0, dy, 0, dy + h);
        dGrad.addColorStop(0, '#ffe896');
        dGrad.addColorStop(0.5, '#f0cc60');
        dGrad.addColorStop(1, '#9c751e');
        ctx.fillStyle = dGrad;
        roundedRectPath(ctx, dx, dy, w, h, 2.5);
        ctx.fill();
        strokeInk(ctx, 1.5);
      };

      drawDrum(c - 14, c + 12, 16, 8);
      if (tier >= 1) {
        drawDrum(c - 14, c - 20, 16, 8);
      }

      // Compact dark gunmetal cupola
      const bodyGrad = ctx.createRadialGradient(c + 3, c - 3, 2, c, c, 20);
      bodyGrad.addColorStop(0, '#5a635e');
      bodyGrad.addColorStop(0.6, '#383e3b');
      bodyGrad.addColorStop(1, '#1e2220');
      ctx.fillStyle = bodyGrad;
      roundedRectPath(ctx, c - 18, c - 14, 30, 28, 7);
      ctx.fill();
    }, 4);

    roundedRectPath(ctx, c - 18, c - 14, 30, 28, 7);
    strokeInk(ctx, 1.8);

    if (tier >= 2) {
      // Reinforced brass-and-steel dual rotary shroud
      ctx.fillStyle = '#d4af48';
      roundedRectPath(ctx, c + 7, c - 14, 10, 28, 2);
      ctx.fill();
      strokeInk(ctx, 1.4);
    }

    // Tracking radar dome on top-left
    ctx.fillStyle = '#d8dfd9';
    ctx.beginPath();
    ctx.arc(c - 6, c - 7, 5, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.3);

    drawHatch(ctx, c - 5, c + 4, 5.2, '#4a524d', '#8c9690');
  });
}

function paintPlasmaTurret(tier: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    withGroundShadow(ctx, () => {
      // MASSIVE unmistakable wide V-shaped splayed stabilizer trails
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 8.2;
      ctx.beginPath();
      ctx.moveTo(c - 4, c - 6);
      ctx.lineTo(c - 34, c - 24);
      ctx.moveTo(c - 4, c + 6);
      ctx.lineTo(c - 34, c + 24);
      ctx.stroke();

      ctx.strokeStyle = '#9e5d2c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(c - 4, c - 6);
      ctx.lineTo(c - 34, c - 24);
      ctx.moveTo(c - 4, c + 6);
      ctx.lineTo(c - 34, c + 24);
      ctx.stroke();

      // Spade anchors at trail tips
      for (const sy of [c - 24, c + 24]) {
        ctx.fillStyle = '#363b36';
        roundedRectPath(ctx, c - 38, sy - 4, 7, 8, 1.5);
        ctx.fill();
        strokeInk(ctx, 1.4);
      }

      // Thick chunky steel artillery barrel with wide T-shaped muzzle brake
      const barrelW = tier >= 1 ? 8 : 6.8;
      drawMetalBarrel(ctx, c - 4, c, c + (tier >= 2 ? 41 : 39), barrelW, {
        baseLight: '#9ca398',
        baseMid: '#5a6058',
        baseDark: '#262a25',
        muzzleBrake: true,
        evacuatorAt: tier >= 2 ? 0.45 : undefined,
      });

      if (tier >= 2) {
        // Bright copper-orange thermal sleeve
        ctx.fillStyle = '#eb8138';
        roundedRectPath(ctx, c + 9, c - barrelW * 0.65, 13, barrelW * 1.3, 2);
        ctx.fill();
        strokeInk(ctx, 1.3);
      }

      // Heavy breech block
      const breechGrad = ctx.createLinearGradient(0, c - 10, 0, c + 10);
      breechGrad.addColorStop(0, '#858a7e');
      breechGrad.addColorStop(1, '#3b3e37');
      ctx.fillStyle = breechGrad;
      roundedRectPath(ctx, c - 15, c - 9, 20, 18, 3);
      ctx.fill();
      strokeInk(ctx, 1.6);

      // Burnt-orange / ochre armored gun shield
      const shieldGrad = ctx.createLinearGradient(0, c - 19, 0, c + 19);
      shieldGrad.addColorStop(0, '#f59f5b');
      shieldGrad.addColorStop(0.5, '#eb8138');
      shieldGrad.addColorStop(1, '#a65018');
      ctx.fillStyle = shieldGrad;
      roundedRectPath(ctx, c + 1, c - 19, 7.5, 38, 2.5);
      ctx.fill();
    }, 4);

    roundedRectPath(ctx, c + 1, c - 19, 7.5, 38, 2.5);
    strokeInk(ctx, 1.8);

    if (tier >= 1) {
      // Twin shell racks on rear trails
      for (const ry of [c - 15, c + 11]) {
        ctx.fillStyle = '#e0a943';
        roundedRectPath(ctx, c - 26, ry, 9, 4.5, 1);
        ctx.fill();
        strokeInk(ctx, 1.1);
      }
    }
  });
}

function paintStasisTurret(tier: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const dishRadius = tier === 0 ? 25 : tier === 1 ? 29 : 31;
    const dishArc = tier >= 1 ? Math.PI * 0.42 : Math.PI * 0.38;

    withGroundShadow(ctx, () => {
      // Armored slate-olive pedestal
      const pedGrad = ctx.createRadialGradient(c - 6, c - 3, 2, c - 8, c, 15);
      pedGrad.addColorStop(0, '#8f9c97');
      pedGrad.addColorStop(1, '#3f4a46');
      ctx.fillStyle = pedGrad;
      roundedRectPath(ctx, c - 22, c - 13, 22, 26, 5);
      ctx.fill();
      strokeInk(ctx, 1.7);

      // Wide gleaming silver-white curved parabolic radar dish facing right (+X)
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = tier >= 2 ? 10 : 8.5;
      ctx.beginPath();
      ctx.arc(c - 8, c, dishRadius, -dishArc, dishArc);
      ctx.stroke();

      ctx.strokeStyle = '#e4eee8';
      ctx.lineWidth = tier >= 2 ? 6.5 : 5.2;
      ctx.beginPath();
      ctx.arc(c - 8, c, dishRadius, -dishArc, dishArc);
      ctx.stroke();
      ctx.restore();
    }, 4);

    // Crisp dark lattice grid lines across dish interior
    ctx.strokeStyle = 'rgba(28, 38, 34, 0.72)';
    ctx.lineWidth = 1.25;
    for (let a = -dishArc * 0.85; a <= dishArc * 0.86; a += dishArc * 0.42) {
      ctx.beginPath();
      ctx.moveTo(c - 4, c);
      ctx.lineTo(c - 8 + Math.cos(a) * dishRadius, c + Math.sin(a) * dishRadius);
      ctx.stroke();
    }

    if (tier >= 1) {
      // Dual-wing silver auxiliary reflector tips
      for (const wy of [-1, 1]) {
        const tipX = c - 8 + Math.cos(dishArc) * dishRadius;
        const tipY = c + wy * Math.sin(dishArc) * dishRadius;
        ctx.fillStyle = '#d4e2da';
        roundedRectPath(ctx, tipX - 3, tipY - 3, 7, 6, 1.5);
        ctx.fill();
        strokeInk(ctx, 1.3);
      }
    }

    // Thin silver tripod struts holding emerald feed horn (NO gun barrel)
    ctx.strokeStyle = '#b4c2ba';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(c + 2, c - 13);
    ctx.lineTo(c + 25, c);
    ctx.moveTo(c + 2, c + 13);
    ctx.lineTo(c + 25, c);
    ctx.stroke();

    // Bright emerald-green central feed horn emitter
    const emRadius = tier >= 2 ? 6.2 : 5;
    const emGrad = ctx.createRadialGradient(c + 24, c - 1, 1, c + 25, c, emRadius);
    emGrad.addColorStop(0, '#c2ffe0');
    emGrad.addColorStop(0.55, '#4ae895');
    emGrad.addColorStop(1, '#12693c');
    ctx.fillStyle = emGrad;
    ctx.beginPath();
    ctx.arc(c + 25, c, emRadius, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.6);

    if (tier >= 2) {
      // Side EW array pods on pedestal
      for (const py of [c - 17, c + 11]) {
        ctx.fillStyle = '#4ae895';
        roundedRectPath(ctx, c - 18, py, 9, 6, 1.5);
        ctx.fill();
        strokeInk(ctx, 1.2);
      }
    }
  });
}

function paintRailgunTurret(tier: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    withGroundShadow(ctx, () => {
      // Extra-long slim dark-steel 120mm cannon (+44px right!) with prominent bore evacuator
      const barrelLen = tier >= 2 ? 45 : 44;
      drawMetalBarrel(ctx, c + 10, c, c + barrelLen, tier >= 2 ? 4.8 : 4.2, {
        baseLight: '#9ca194',
        baseMid: '#52574f',
        baseDark: '#232622',
        evacuatorAt: 0.42,
      });

      // Iconic wide angular sloped Desert-Tan Abrams composite turret
      const turGrad = ctx.createLinearGradient(c - 24, c - 16, c + 18, c + 16);
      turGrad.addColorStop(0, '#f2e3b6');
      turGrad.addColorStop(0.55, '#e2cb92');
      turGrad.addColorStop(1, '#ad955c');
      ctx.fillStyle = turGrad;
      ctx.beginPath();
      ctx.moveTo(c - 23, c - 14);
      ctx.lineTo(c + 5, c - 16);
      ctx.lineTo(c + 19, c - 7);
      ctx.lineTo(c + 19, c + 7);
      ctx.lineTo(c + 5, c + 16);
      ctx.lineTo(c - 23, c + 14);
      ctx.closePath();
      ctx.fill();
    }, 4);

    strokeInk(ctx, 1.8);

    // Subtle NATO steel-blue recognition panel on turret rear
    ctx.fillStyle = '#4c7fb0';
    roundedRectPath(ctx, c - 21, c - 9, 6, 18, 1);
    ctx.fill();
    strokeInk(ctx, 1.1);

    // Reactive cheek/side plates on T1+
    if (tier >= 1) {
      ctx.fillStyle = '#cfb77e';
      ctx.fillRect(c - 15, c - 19, 19, 3.5);
      ctx.fillRect(c - 15, c + 15.5, 19, 3.5);
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(c - 15, c - 19, 19, 3.5);
      ctx.strokeRect(c - 15, c + 15.5, 19, 3.5);
    }
    if (tier >= 2) {
      // Heavy TUSK tan cheek armor + rail-grade blue accent on evacuator
      ctx.fillStyle = '#edd89e';
      ctx.fillRect(c + 5, c - 13, 10, 4.5);
      ctx.fillRect(c + 5, c + 8.5, 10, 4.5);
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(c + 5, c - 13, 10, 4.5);
      ctx.strokeRect(c + 5, c + 8.5, 10, 4.5);
    }

    // Rear bustle stowage rack
    ctx.strokeStyle = '#2b281c';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(c - 27, c - 11, 4, 22);

    // Commander & loader hatches + pintle .50 cal
    drawHatch(ctx, c - 3, c - 6.5, 4.5, '#cbb278', '#f5e8c4');
    drawHatch(ctx, c - 3, c + 6.5, 4.0, '#bfa76e', '#ede0b9');
    drawMetalBarrel(ctx, c - 1, c - 6.5, c + 11, 2, { baseLight: '#737870', outlineWidth: 1 });
  });
}

function paintSwarmTurret(tier: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const boxH = tier === 0 ? 30 : 36;
    const cells = tier === 0 ? 4 : 6;

    withGroundShadow(ctx, () => {
      // Dark steel launcher turntable
      ctx.fillStyle = '#3b4240';
      roundedRectPath(ctx, c - 22, c - 15, 26, 30, 4);
      ctx.fill();
      strokeInk(ctx, 1.6);

      // Bright off-white wide rectangular missile canister box
      const boxGrad = ctx.createLinearGradient(0, c - boxH / 2, 0, c + boxH / 2);
      boxGrad.addColorStop(0, '#ffffff');
      boxGrad.addColorStop(0.5, '#edf2ef');
      boxGrad.addColorStop(1, '#bcc7c1');
      ctx.fillStyle = boxGrad;
      roundedRectPath(ctx, c - 16, c - boxH / 2, 42, boxH, 3);
      ctx.fill();
    }, 4);

    roundedRectPath(ctx, c - 16, c - boxH / 2, 42, boxH, 3);
    strokeInk(ctx, 1.8);

    // Crisp dark cell seams
    ctx.strokeStyle = '#323a36';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < cells; i++) {
      const ly = c - boxH / 2 + (boxH / cells) * i;
      ctx.beginPath();
      ctx.moveTo(c - 15, ly);
      ctx.lineTo(c + 25, ly);
      ctx.stroke();
    }

    // Bright signal-red missile nose/hatch accents along front (+X)
    const cellH = boxH / cells;
    for (let i = 0; i < cells; i++) {
      const cy = c - boxH / 2 + cellH * (i + 0.5);
      ctx.fillStyle = '#ef4b4b';
      roundedRectPath(ctx, c + 18, cy - cellH * 0.32, 6.5, cellH * 0.64, 1.2);
      ctx.fill();
      ctx.strokeStyle = '#631414';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    // Tactical red band across canister body
    ctx.fillStyle = '#ef4b4b';
    ctx.fillRect(c + 8, c - boxH / 2 + 1.5, 3.5, boxH - 3);

    if (tier >= 2) {
      // White fire-control radar dome with signal-red trim
      ctx.fillStyle = '#f5f8f6';
      ctx.beginPath();
      ctx.arc(c - 19, c, 6, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.5);
      ctx.fillStyle = '#ef4b4b';
      ctx.beginPath();
      ctx.arc(c - 19, c, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function paintTurret(type: (typeof TURRET_KEYS)[number], tier: number): Texture {
  switch (type) {
    case 'pulse':
      return paintPulseTurret(tier);
    case 'plasma':
      return paintPlasmaTurret(tier);
    case 'stasis':
      return paintStasisTurret(tier);
    case 'railgun':
      return paintRailgunTurret(tier);
    case 'swarm':
      return paintSwarmTurret(tier);
  }
}

// ============================================================================
// 3. RUSSIAN INVADING FORCES (96x96, dreadnought 128x128, facing RIGHT +X)
// ============================================================================

function paintEnemy(type: (typeof ENEMY_KEYS)[number]): Texture {
  const dim = type === 'dreadnought' ? 128 : 96;

  return paintCanvas(dim, (ctx, size) => {
    const c = size / 2;

    if (type === 'scout') {
      // BTR-82A 8-wheeled APC
      withGroundShadow(ctx, () => {
        for (const wx of [-22, -8, 6, 20]) {
          drawWheel(ctx, c + wx, c - 16, 9, 5);
          drawWheel(ctx, c + wx, c + 16, 9, 5);
        }
        const hullGrad = ctx.createLinearGradient(0, c - 15, 0, c + 15);
        hullGrad.addColorStop(0, '#788c6a');
        hullGrad.addColorStop(0.5, '#5d7052');
        hullGrad.addColorStop(1, '#36422f');
        ctx.fillStyle = hullGrad;
        ctx.beginPath();
        ctx.moveTo(c - 31, c - 13);
        ctx.lineTo(c + 20, c - 14);
        ctx.lineTo(c + 33, c - 6);
        ctx.lineTo(c + 33, c + 6);
        ctx.lineTo(c + 20, c + 14);
        ctx.lineTo(c - 31, c + 13);
        ctx.closePath();
        ctx.fill();
      }, 4);

      strokeInk(ctx, 1.8);

      // Crisp crimson tactical stripe
      ctx.fillStyle = '#e03535';
      ctx.fillRect(c - 22, c - 12, 3.5, 24);

      // Rear engine louvers
      ctx.fillStyle = '#252c20';
      for (let i = 0; i < 3; i++) ctx.fillRect(c - 29 + i * 2.5, c - 8, 1.6, 16);

      // Roof turret + 30mm autocannon
      drawHatch(ctx, c + 3, c, 8, '#5d7052', '#8fa380');
      drawMetalBarrel(ctx, c + 9, c, c + 30, 3, { baseLight: '#8b9687' });
      drawRedStar(ctx, c - 11, c, 4.5);
      return;
    }

    if (type === 'swarmer') {
      // GAZ Tigr-M 4x4 tactical vehicle
      withGroundShadow(ctx, () => {
        for (const wx of [-15, 14]) {
          drawWheel(ctx, c + wx, c - 15, 10, 5);
          drawWheel(ctx, c + wx, c + 15, 10, 5);
        }
        const grad = ctx.createLinearGradient(0, c - 13, 0, c + 13);
        grad.addColorStop(0, '#b5ad7a');
        grad.addColorStop(0.55, '#9c9466');
        grad.addColorStop(1, '#635e3e');
        ctx.fillStyle = grad;
        roundedRectPath(ctx, c - 24, c - 13, 48, 26, 4);
        ctx.fill();
      }, 4);

      roundedRectPath(ctx, c - 24, c - 13, 48, 26, 4);
      strokeInk(ctx, 1.8);

      // Rear spare tire
      drawWheel(ctx, c - 25, c, 4, 11);

      // Tinted windshield + crimson hood stripe
      ctx.fillStyle = '#182224';
      ctx.fillRect(c + 8, c - 10, 5, 20);
      ctx.fillStyle = '#e03535';
      ctx.fillRect(c + 16, c - 8, 2.5, 16);

      // Roof MG turret
      drawHatch(ctx, c - 3, c, 6, '#878056', '#bfb784');
      drawMetalBarrel(ctx, c + 2, c, c + 19, 2.4, { baseLight: '#7b8075' });
      drawRedStar(ctx, c - 14, c, 3.8);
      return;
    }

    if (type === 'cruiser') {
      // T-90M Russian MBT
      withGroundShadow(ctx, () => {
        drawTrackSponson(ctx, c - 29, c - 22, 58, 8.5, 14);
        drawTrackSponson(ctx, c - 29, c + 13.5, 58, 8.5, 14);

        const hullGrad = ctx.createLinearGradient(0, c - 16, 0, c + 16);
        hullGrad.addColorStop(0, '#5a7854');
        hullGrad.addColorStop(0.5, '#445c40');
        hullGrad.addColorStop(1, '#263623');
        ctx.fillStyle = hullGrad;
        roundedRectPath(ctx, c - 27, c - 15, 54, 30, 3);
        ctx.fill();
      }, 5);

      roundedRectPath(ctx, c - 27, c - 15, 54, 30, 3);
      strokeInk(ctx, 1.8);

      // Twin cylindrical rear fuel drums
      for (const fy of [c - 12, c + 2]) {
        ctx.fillStyle = '#334630';
        roundedRectPath(ctx, c - 32, fy, 6, 10, 2);
        ctx.fill();
        strokeInk(ctx, 1.2);
      }

      // ERA bricks along flanks
      ctx.fillStyle = '#536e4e';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(c - 17 + i * 7.5, c - 16, 6, 3.2);
        ctx.fillRect(c - 17 + i * 7.5, c + 12.8, 6, 3.2);
      }

      // Long 125mm cannon
      drawMetalBarrel(ctx, c + 11, c, c + 42, 4.6, {
        baseLight: '#7a8c74',
        baseMid: '#445440',
        baseDark: '#1e261c',
        evacuatorAt: 0.45,
      });

      // Rounded cast turret
      const turGrad = ctx.createRadialGradient(c + 3, c - 3, 2, c, c, 16);
      turGrad.addColorStop(0, '#62805b');
      turGrad.addColorStop(0.7, '#445c40');
      turGrad.addColorStop(1, '#233020');
      ctx.fillStyle = turGrad;
      ctx.beginPath();
      ctx.ellipse(c, c, 16, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Bold bright-crimson V/star emblem
      ctx.strokeStyle = '#e03535';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c - 11, c - 6);
      ctx.lineTo(c - 5, c);
      ctx.lineTo(c - 11, c + 6);
      ctx.stroke();

      drawHatch(ctx, c + 1, c - 5, 3.8, '#4e6949');
      drawHatch(ctx, c + 1, c + 5, 3.5, '#486144');
      drawRedStar(ctx, c - 9, c, 4.2);
      return;
    }

    if (type === 'frigate') {
      // T-14 Armata next-gen MBT
      withGroundShadow(ctx, () => {
        drawTrackSponson(ctx, c - 31, c - 22, 62, 8.5, 15);
        drawTrackSponson(ctx, c - 31, c + 13.5, 62, 8.5, 15);

        const hullGrad = ctx.createLinearGradient(0, c - 16, 0, c + 16);
        hullGrad.addColorStop(0, '#668c85');
        hullGrad.addColorStop(0.5, '#4d6e68');
        hullGrad.addColorStop(1, '#2b403c');
        ctx.fillStyle = hullGrad;
        roundedRectPath(ctx, c - 29, c - 15, 58, 30, 3);
        ctx.fill();
      }, 5);

      roundedRectPath(ctx, c - 29, c - 15, 58, 30, 3);
      strokeInk(ctx, 1.8);

      // Crimson rear tactical stripe
      ctx.fillStyle = '#e03535';
      ctx.fillRect(c - 26, c - 12, 3.5, 24);

      // Long heavy cannon
      drawMetalBarrel(ctx, c + 11, c, c + 44, 4.8, {
        baseLight: '#85a39d',
        baseMid: '#4c6661',
        baseDark: '#222e2c',
        evacuatorAt: 0.4,
      });

      // Low-profile angular unmanned turret
      const turGrad = ctx.createLinearGradient(c - 16, c - 13, c + 16, c + 13);
      turGrad.addColorStop(0, '#6f968e');
      turGrad.addColorStop(1, '#314743');
      ctx.fillStyle = turGrad;
      ctx.beginPath();
      ctx.moveTo(c - 16, c - 12);
      ctx.lineTo(c + 5, c - 13);
      ctx.lineTo(c + 17, c - 6);
      ctx.lineTo(c + 17, c + 6);
      ctx.lineTo(c + 5, c + 13);
      ctx.lineTo(c - 16, c + 12);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Bright ice-blue APS emitter pods on turret cheeks
      for (const py of [c - 10.5, c + 7.5]) {
        ctx.fillStyle = '#7ce8ff';
        ctx.fillRect(c + 9, py, 4, 3);
        ctx.strokeStyle = INK_OUTLINE;
        ctx.lineWidth = 1;
        ctx.strokeRect(c + 9, py, 4, 3);
      }

      drawRedStar(ctx, c - 9, c, 4.0);
      return;
    }

    if (type === 'phase') {
      // Su-57 Felon Strike Jet — NO baked close ground shadow!
      // Bright orange-blue twin afterburner exhausts
      for (const ny of [c - 5.5, c + 5.5]) {
        const glow = ctx.createRadialGradient(c - 32, ny, 0.5, c - 35, ny, 9.5);
        glow.addColorStop(0, 'rgba(140, 220, 255, 0.95)');
        glow.addColorStop(0.45, 'rgba(255, 145, 45, 0.78)');
        glow.addColorStop(1, 'rgba(235, 90, 25, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(c - 35, ny, 9.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Light silver-blue-grey digital-camo stealth fighter
      const jetGrad = ctx.createLinearGradient(c - 34, c - 36, c + 38, c + 36);
      jetGrad.addColorStop(0, '#b5c7d6');
      jetGrad.addColorStop(0.5, '#9eb2c4');
      jetGrad.addColorStop(1, '#72879c');
      ctx.fillStyle = jetGrad;
      ctx.beginPath();
      ctx.moveTo(c + 40, c);
      ctx.lineTo(c + 15, c - 7.5);
      ctx.lineTo(c - 4, c - 37);
      ctx.lineTo(c - 17, c - 35);
      ctx.lineTo(c - 16, c - 13);
      ctx.lineTo(c - 30, c - 22);
      ctx.lineTo(c - 36, c - 17);
      ctx.lineTo(c - 31, c - 7.5);
      ctx.lineTo(c - 31, c + 7.5);
      ctx.lineTo(c - 36, c + 17);
      ctx.lineTo(c - 30, c + 22);
      ctx.lineTo(c - 16, c + 13);
      ctx.lineTo(c - 17, c + 35);
      ctx.lineTo(c - 4, c + 37);
      ctx.lineTo(c + 15, c + 7.5);
      ctx.closePath();
      ctx.fill();

      // Digital-camo splinter patches
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#607487';
      ctx.fillRect(c - 19, c - 30, 13, 15);
      ctx.fillRect(c - 10, c + 9, 15, 16);
      ctx.fillStyle = '#c2d3e0';
      ctx.fillRect(c - 2, c - 18, 11, 10);
      ctx.restore();

      strokeInk(ctx, 1.8);

      // Glossy dark cockpit canopy
      const canGrad = ctx.createLinearGradient(c + 6, c - 3.5, c + 22, c + 3.5);
      canGrad.addColorStop(0, '#304759');
      canGrad.addColorStop(0.5, '#131d26');
      canGrad.addColorStop(1, '#0a0f14');
      ctx.fillStyle = canGrad;
      ctx.beginPath();
      ctx.ellipse(c + 14, c, 9.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(215, 240, 255, 0.65)';
      ctx.beginPath();
      ctx.ellipse(c + 16, c - 1, 3.8, 1, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bold crimson wing stars
      drawRedStar(ctx, c - 7, c - 22, 4.4);
      drawRedStar(ctx, c - 7, c + 22, 4.4);
      return;
    }

    // dreadnought: Kirov Siege Tank (128x128)
    withGroundShadow(ctx, () => {
      drawTrackSponson(ctx, c - 44, c - 36, 88, 13, 19);
      drawTrackSponson(ctx, c - 44, c + 23, 88, 13, 19);

      const hullGrad = ctx.createLinearGradient(0, c - 26, 0, c + 26);
      hullGrad.addColorStop(0, '#5a6063');
      hullGrad.addColorStop(0.5, '#464b4d');
      hullGrad.addColorStop(1, '#26292b');
      ctx.fillStyle = hullGrad;
      roundedRectPath(ctx, c - 41, c - 25, 82, 50, 5);
      ctx.fill();
    }, 6);

    roundedRectPath(ctx, c - 41, c - 25, 82, 50, 5);
    strokeInk(ctx, 2.0);

    // Deep-crimson sponson armor panels
    ctx.fillStyle = '#8c3438';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(c - 26 + i * 11, c - 27, 8.5, 4.5);
      ctx.fillRect(c - 26 + i * 11, c + 22.5, 8.5, 4.5);
    }

    // Rear armored exhaust stacks
    ctx.fillStyle = '#1f2224';
    ctx.fillRect(c - 44, c - 15, 6, 11);
    ctx.fillRect(c - 44, c + 4, 6, 11);
    ctx.strokeStyle = INK_OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(c - 44, c - 15, 6, 11);
    ctx.strokeRect(c - 44, c + 4, 6, 11);

    // Dual massive parallel cannons
    drawMetalBarrel(ctx, c + 12, c - 8.5, c + 58, 6.2, {
      baseLight: '#8e9496',
      baseMid: '#4f5457',
      baseDark: '#202224',
      muzzleBrake: true,
    });
    drawMetalBarrel(ctx, c + 12, c + 8.5, c + 58, 6.2, {
      baseLight: '#8e9496',
      baseMid: '#4f5457',
      baseDark: '#202224',
      muzzleBrake: true,
    });

    // Gold-rimmed crimson command turret
    const turGrad = ctx.createRadialGradient(c + 4, c - 4, 3, c, c, 26);
    turGrad.addColorStop(0, '#a84246');
    turGrad.addColorStop(0.65, '#8c3438');
    turGrad.addColorStop(1, '#521c1e');
    ctx.fillStyle = turGrad;
    roundedRectPath(ctx, c - 24, c - 19, 44, 38, 6);
    ctx.fill();
    strokeInk(ctx, 2.0);

    // Gold command trim border
    ctx.strokeStyle = '#d4af48';
    ctx.lineWidth = 1.8;
    roundedRectPath(ctx, c - 21, c - 16, 38, 32, 4.5);
    ctx.stroke();

    drawRedStar(ctx, c - 10, c, 6);

    // Top command radar mast
    ctx.fillStyle = '#9aa3a6';
    ctx.beginPath();
    ctx.arc(c + 4, c, 6.5, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.6);
  });
}

// ============================================================================
// 4. ILLUSTRATED ALPINE MOUNTAIN OBSTACLES (96x96) & BLAST CRATER (64x64)
// ============================================================================

interface PeakSpec {
  ax: number;
  ay: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  bx: number;
  by: number;
  snowRatio: number;
  leftDark: string;
  leftMid: string;
  rightMid: string;
  rightLight: string;
}

function drawMountainPeak(ctx: CanvasRenderingContext2D, p: PeakSpec): void {
  // Left shadowed alpine rock face
  const lGrad = ctx.createLinearGradient(p.lx, p.ly, p.bx, p.by);
  lGrad.addColorStop(0, p.leftDark);
  lGrad.addColorStop(1, p.leftMid);
  ctx.fillStyle = lGrad;
  ctx.beginPath();
  ctx.moveTo(p.ax, p.ay);
  ctx.lineTo(p.lx, p.ly);
  ctx.lineTo(p.bx, p.by);
  ctx.closePath();
  ctx.fill();

  // Right sunlit warm rocky tan-grey face
  const rGrad = ctx.createLinearGradient(p.ax, p.ay, p.rx, p.ry);
  rGrad.addColorStop(0, p.rightLight);
  rGrad.addColorStop(1, p.rightMid);
  ctx.fillStyle = rGrad;
  ctx.beginPath();
  ctx.moveTo(p.ax, p.ay);
  ctx.lineTo(p.bx, p.by);
  ctx.lineTo(p.rx, p.ry);
  ctx.closePath();
  ctx.fill();

  // Snow-dusted summit cap & sunlit ridgeline
  if (p.snowRatio > 0) {
    const s = p.snowRatio;
    const slx = p.ax + (p.lx - p.ax) * s;
    const sly = p.ay + (p.ly - p.ay) * s;
    const sbx = p.ax + (p.bx - p.ax) * (s * 1.12);
    const sby = p.ay + (p.by - p.ay) * (s * 1.12);
    const srx = p.ax + (p.rx - p.ax) * (s * 1.05);
    const sry = p.ay + (p.ry - p.ay) * (s * 1.05);

    // Shadowed left snow facet
    ctx.fillStyle = '#dce2dc';
    ctx.beginPath();
    ctx.moveTo(p.ax, p.ay);
    ctx.lineTo(slx, sly);
    ctx.lineTo((slx + sbx) * 0.5, (sly + sby) * 0.5 + 2.5);
    ctx.lineTo(sbx, sby);
    ctx.closePath();
    ctx.fill();

    // Sunlit right snow facet
    ctx.fillStyle = '#f0f3ee';
    ctx.beginPath();
    ctx.moveTo(p.ax, p.ay);
    ctx.lineTo(sbx, sby);
    ctx.lineTo((sbx + srx) * 0.5, (sby + sry) * 0.5 - 2);
    ctx.lineTo(srx, sry);
    ctx.closePath();
    ctx.fill();
  }

  // Crisp dark cartographic ink outer & central ridge lines
  ctx.save();
  ctx.strokeStyle = '#141614';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.lx, p.ly);
  ctx.lineTo(p.ax, p.ay);
  ctx.lineTo(p.rx, p.ry);
  ctx.moveTo(p.ax, p.ay);
  ctx.lineTo(p.bx, p.by);
  ctx.stroke();
  ctx.restore();
}

function paintObstacle(variant: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const rand = mulberry32(700 + variant * 131);

    // Soft alpine base shadow & subtle no-build ground wash
    const baseGrad = ctx.createRadialGradient(c - 2, c + 4, 8, c, c + 2, 40);
    baseGrad.addColorStop(0, 'rgba(20, 22, 18, 0.42)');
    baseGrad.addColorStop(0.72, 'rgba(26, 26, 22, 0.24)');
    baseGrad.addColorStop(1, 'rgba(26, 26, 22, 0)');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(c, c + 2, 40, 0, Math.PI * 2);
    ctx.fill();

    // Subtle thin dashed amber-ochre tactical no-build perimeter contour
    ctx.save();
    ctx.beginPath();
    const pts = 12;
    for (let i = 0; i < pts; i++) {
      const ang = (i / pts) * Math.PI * 2 + variant * 0.35;
      const rad = 34 + (rand() - 0.5) * 4.5;
      const px = c + Math.cos(ang) * rad;
      const py = c + Math.sin(ang) * (rad * 0.88) + 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(222, 174, 88, 0.72)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();

    const formations: PeakSpec[][] = [
      // Variant 0: Tall central alpine massif with flanking left shoulder & right spur
      [
        {
          ax: 28, ay: 27, lx: 11, ly: 63, rx: 46, ry: 60, bx: 29, by: 62,
          snowRatio: 0.36, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
        {
          ax: 68, ay: 30, lx: 49, ly: 63, rx: 85, ry: 62, bx: 66, by: 63,
          snowRatio: 0.34, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
        {
          ax: 48, ay: 14, lx: 22, ly: 72, rx: 75, ry: 71, bx: 50, by: 73,
          snowRatio: 0.42, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
      ],
      // Variant 1: Twin jagged Sierra/Rockies spires with lower foreground crag
      [
        {
          ax: 35, ay: 17, lx: 12, ly: 65, rx: 58, ry: 64, bx: 37, by: 66,
          snowRatio: 0.42, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
        {
          ax: 63, ay: 20, lx: 41, ly: 67, rx: 85, ry: 66, bx: 61, by: 68,
          snowRatio: 0.40, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
        {
          ax: 49, ay: 40, lx: 26, ly: 75, rx: 74, ry: 74, bx: 48, by: 75,
          snowRatio: 0.28, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
      ],
      // Variant 2: Broad rugged triple-ridge massif
      [
        {
          ax: 64, ay: 22, lx: 40, ly: 64, rx: 85, ry: 63, bx: 62, by: 65,
          snowRatio: 0.38, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
        {
          ax: 37, ay: 16, lx: 12, ly: 68, rx: 62, ry: 67, bx: 39, by: 69,
          snowRatio: 0.43, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
        {
          ax: 56, ay: 38, lx: 34, ly: 74, rx: 81, ry: 72, bx: 55, by: 74,
          snowRatio: 0.26, leftDark: '#2b2c28', leftMid: '#38342c', rightMid: '#7c725e', rightLight: '#998e76',
        },
      ],
    ];

    const peaks = formations[variant % formations.length];

    // Soft dark ground shadow to lower-left beneath the mountain massif
    withGroundShadow(ctx, () => {
      ctx.fillStyle = '#2b2c28';
      for (const p of peaks) {
        ctx.beginPath();
        ctx.moveTo(p.ax, p.ay);
        ctx.lineTo(p.lx, p.ly);
        ctx.lineTo(p.rx, p.ry);
        ctx.closePath();
        ctx.fill();
      }
    }, 5, -3, 3, 0.65);

    // Paint faceted alpine peaks back-to-front
    for (const p of peaks) {
      drawMountainPeak(ctx, p);
    }
  });
}

function paintCrater(): Texture {
  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;
    const rand = mulberry32(991);

    const grad = ctx.createRadialGradient(c, c, 2, c, c, 29);
    grad.addColorStop(0, 'rgba(22, 18, 16, 0.94)');
    grad.addColorStop(0.42, 'rgba(32, 26, 21, 0.82)');
    grad.addColorStop(0.68, 'rgba(43, 35, 27, 0.56)');
    grad.addColorStop(1, 'rgba(43, 35, 27, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 29, 0, Math.PI * 2);
    ctx.fill();

    // Subtle radial blast streaks
    ctx.strokeStyle = 'rgba(20, 16, 14, 0.52)';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const r1 = 6 + rand() * 5;
      const r2 = 18 + rand() * 9;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(ang) * r1, c + Math.sin(ang) * r1);
      ctx.lineTo(c + Math.cos(ang) * r2, c + Math.sin(ang) * r2);
      ctx.stroke();
    }
  });
}

// ============================================================================
// PUBLIC BUILDER
// ============================================================================

export function buildMilitaryTextures(): MilitaryTextureSet {
  if (typeof document === 'undefined') {
    const bases: Record<string, Texture> = {};
    const turrets: Record<string, [Texture, Texture, Texture]> = {};
    const enemies: Record<string, Texture> = {};

    for (const key of TURRET_KEYS) {
      bases[key] = Texture.EMPTY;
      turrets[key] = [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY];
    }
    for (const key of ENEMY_KEYS) {
      enemies[key] = Texture.EMPTY;
    }

    return {
      bases,
      turrets,
      enemies,
      obstacles: [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
      crater: Texture.EMPTY,
      destroy() {},
    };
  }

  const created: Texture[] = [];
  const track = (tex: Texture): Texture => {
    if (tex !== Texture.EMPTY) created.push(tex);
    return tex;
  };

  const bases: Record<string, Texture> = {};
  const turrets: Record<string, [Texture, Texture, Texture]> = {};
  const enemies: Record<string, Texture> = {};

  for (const key of TURRET_KEYS) {
    bases[key] = track(paintBase(key));
    turrets[key] = [
      track(paintTurret(key, 0)),
      track(paintTurret(key, 1)),
      track(paintTurret(key, 2)),
    ];
  }

  for (const key of ENEMY_KEYS) {
    enemies[key] = track(paintEnemy(key));
  }

  const obstacles = [
    track(paintObstacle(0)),
    track(paintObstacle(1)),
    track(paintObstacle(2)),
  ];
  const crater = track(paintCrater());

  return {
    bases,
    turrets,
    enemies,
    obstacles,
    crater,
    destroy() {
      for (const tex of created) {
        tex.destroy(true);
      }
      created.length = 0;
    },
  };
}
