import { Texture } from 'pixi.js';
import type { MilitaryTextureSet } from './militarySprites';

export interface TheaterTextureSet extends MilitaryTextureSet {
  mine?: Texture;
  boost?: Texture;
  base?: Texture;
  moleMound?: Texture;
  knight?: Texture;
  roomba?: Texture;
}

export type TheaterTheme = 'naval' | 'mars' | 'medieval' | 'kitchen' | 'lawn';
export type TheaterSpriteTheme = TheaterTheme;

const TURRET_KEYS = ['pulse', 'plasma', 'stasis', 'railgun', 'swarm'] as const;
const ENEMY_KEYS = ['scout', 'swarmer', 'cruiser', 'frigate', 'phase', 'dreadnought'] as const;

type TurretKey = (typeof TURRET_KEYS)[number];
type EnemyKey = (typeof ENEMY_KEYS)[number];

const INK_OUTLINE = '#0d100d';

// ============================================================================
// SHARED CANVAS HELPERS
// ============================================================================

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
  alpha = 0.58,
): void {
  ctx.save();
  ctx.shadowColor = `rgba(4, 6, 8, ${alpha})`;
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

function polygonPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  sides: number,
  offsetAngle = 0,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const ang = (i / sides) * Math.PI * 2 + offsetAngle;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawGradBarrel(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y: number,
  x2: number,
  width: number,
  light: string,
  mid: string,
  dark: string,
  outlineWidth = 1.6,
): void {
  const grad = ctx.createLinearGradient(0, y - width / 2, 0, y + width / 2);
  grad.addColorStop(0, light);
  grad.addColorStop(0.45, mid);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fillRect(x1, y - width / 2, x2 - x1, width);
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = outlineWidth;
  ctx.strokeRect(x1, y - width / 2, x2 - x1, width);
}

function drawWakeArcs(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color = 'rgba(225, 245, 255, 0.45)',
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 0.85, Math.PI * 0.85);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(225, 245, 255, 0.22)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, -Math.PI * 0.72, Math.PI * 0.72);
  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// 1. NAVAL THEATER (PACIFIC FLEET — SEA BATTLE)
// ============================================================================

function paintNavalBase(key: TurretKey): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'pulse') {
      // Round steel sea-platform / floating AA gun platform with subtle water ring
      drawWakeArcs(ctx, c, c, 37);
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#3c4d5e';
        ctx.beginPath();
        ctx.arc(c, c, 31, 0, Math.PI * 2);
        ctx.fill();
      });
      const grad = ctx.createRadialGradient(c - 6, c - 6, 4, c, c, 31);
      grad.addColorStop(0, '#7e93a8');
      grad.addColorStop(0.65, '#4b5f73');
      grad.addColorStop(1, '#2b3947');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c, c, 31, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Deck grating & bolt ring
      ctx.strokeStyle = '#9bb0c4';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(c, c, 24, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.fillStyle = '#dbe6f0';
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 27, c + Math.sin(a) * 27, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (key === 'plasma') {
      // Wide dark-steel barge deck with yellow/black hazard trim & spare mines
      drawWakeArcs(ctx, c, c, 39, 'rgba(205, 235, 250, 0.35)');
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 11, 16, 74, 64, 8);
        ctx.fillStyle = '#2e3842';
        ctx.fill();
      });
      const grad = ctx.createLinearGradient(11, 16, 85, 80);
      grad.addColorStop(0, '#4f5d6b');
      grad.addColorStop(1, '#252e38');
      roundedRectPath(ctx, 11, 16, 74, 64, 8);
      ctx.fillStyle = grad;
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Hazard yellow/black trim strips top & bottom
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#f5b727' : '#181c20';
        ctx.fillRect(18 + i * 10, 19, 10, 5);
        ctx.fillRect(18 + i * 10, 72, 10, 5);
      }
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(18, 19, 60, 5);
      ctx.strokeRect(18, 72, 60, 5);

      // Two spare mini-mines on aft corners
      for (const py of [29, 67]) {
        ctx.fillStyle = '#1b2026';
        ctx.beginPath();
        ctx.arc(21, py, 4.2, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.2);
      }
      return;
    }

    if (key === 'stasis') {
      // Octagonal white-and-cyan floating sonar buoy rig with wave ripples
      ctx.save();
      ctx.strokeStyle = 'rgba(110, 235, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c, c, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      withGroundShadow(ctx, () => {
        polygonPath(ctx, c, c, 32, 8, Math.PI / 8);
        ctx.fillStyle = '#d9ecf5';
        ctx.fill();
      });
      const grad = ctx.createRadialGradient(c - 6, c - 6, 4, c, c, 32);
      grad.addColorStop(0, '#f4fbff');
      grad.addColorStop(0.65, '#c2dfee');
      grad.addColorStop(1, '#79a8bf');
      polygonPath(ctx, c, c, 32, 8, Math.PI / 8);
      ctx.fillStyle = grad;
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Cyan inner ring
      polygonPath(ctx, c, c, 21, 8, Math.PI / 8);
      ctx.fillStyle = '#149bb8';
      ctx.fill();
      strokeInk(ctx, 1.4);
      return;
    }

    if (key === 'railgun') {
      // Sleek steel-blue/grey Allied Destroyer warship hull (DDG) pointing RIGHT
      // Bow wave wake
      ctx.save();
      ctx.strokeStyle = 'rgba(235, 248, 255, 0.72)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(89, c);
      ctx.quadraticCurveTo(72, c - 24, 24, c - 29);
      ctx.moveTo(89, c);
      ctx.quadraticCurveTo(72, c + 24, 24, c + 29);
      ctx.stroke();
      ctx.restore();

      const drawHull = () => {
        ctx.beginPath();
        ctx.moveTo(88, c);
        ctx.quadraticCurveTo(72, c - 17, 46, c - 19);
        ctx.lineTo(12, c - 16);
        ctx.lineTo(10, c + 16);
        ctx.lineTo(46, c + 19);
        ctx.quadraticCurveTo(72, c + 17, 88, c);
        ctx.closePath();
      };
      withGroundShadow(ctx, () => {
        drawHull();
        ctx.fillStyle = '#4e6378';
        ctx.fill();
      });
      const hullGrad = ctx.createLinearGradient(10, c - 19, 10, c + 19);
      hullGrad.addColorStop(0, '#8ca4bc');
      hullGrad.addColorStop(0.45, '#597088');
      hullGrad.addColorStop(1, '#314254');
      drawHull();
      ctx.fillStyle = hullGrad;
      ctx.fill();
      strokeInk(ctx, 1.9);

      // Helipad aft (left)
      ctx.fillStyle = '#2d3a47';
      ctx.beginPath();
      ctx.arc(23, c, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#dce8f2';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#dce8f2';
      ctx.fillRect(19, c - 4, 2, 8);
      ctx.fillRect(25, c - 4, 2, 8);
      ctx.fillRect(19, c - 1, 8, 2);

      // Bridge superstructure center-fore
      roundedRectPath(ctx, 40, c - 10, 18, 20, 3);
      ctx.fillStyle = '#9bb1c7';
      ctx.fill();
      strokeInk(ctx, 1.4);
      return;
    }

    // swarm: wider navy-grey cruiser hull deck with white-trimmed VLS missile deck
    drawWakeArcs(ctx, c, c, 40);
    withGroundShadow(ctx, () => {
      roundedRectPath(ctx, 10, 14, 76, 68, 12);
      ctx.fillStyle = '#415263';
      ctx.fill();
    });
    const grad = ctx.createLinearGradient(10, 14, 86, 82);
    grad.addColorStop(0, '#788da3');
    grad.addColorStop(0.5, '#4b5e73');
    grad.addColorStop(1, '#2a3745');
    roundedRectPath(ctx, 10, 14, 76, 68, 12);
    ctx.fillStyle = grad;
    ctx.fill();
    strokeInk(ctx, 1.85);

    // White-trimmed VLS deck
    roundedRectPath(ctx, 18, 22, 60, 52, 6);
    ctx.fillStyle = '#334252';
    ctx.fill();
    ctx.strokeStyle = '#eef6fc';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function paintNavalTurret(key: TurretKey, tier: 0 | 1 | 2): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'pulse') {
      // Phalanx CIWS — bright brass/white: white R2D2-style dome + gleaming brass-gold rotary barrel
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#eef4f8';
        ctx.beginPath();
        ctx.arc(c - 6, c, 19, 0, Math.PI * 2);
        ctx.fill();
      });

      // Rotary brass barrels
      const offsets = tier === 0 ? [0] : tier === 1 ? [-5, 5] : [-6, 0, 6];
      for (const oy of offsets) {
        drawGradBarrel(ctx, c, c + oy, 85, tier === 2 ? 4.4 : 4.8, '#ffe799', '#d4a12a', '#7c580e', 1.5);
        // Brass muzzle clamp
        ctx.fillStyle = '#e3b846';
        ctx.fillRect(77, c + oy - 3.2, 5, 6.4);
        ctx.strokeStyle = INK_OUTLINE;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(77, c + oy - 3.2, 5, 6.4);
      }

      // White Phalanx dome
      const domeGrad = ctx.createRadialGradient(c - 10, c - 6, 3, c - 6, c, 20);
      domeGrad.addColorStop(0, '#ffffff');
      domeGrad.addColorStop(0.65, '#d6e2ec');
      domeGrad.addColorStop(1, '#8ea3b5');
      ctx.fillStyle = domeGrad;
      ctx.beginPath();
      ctx.arc(c - 6, c, 19, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Radar stripe / T2 armored collar
      ctx.fillStyle = tier === 2 ? '#e0a928' : '#2d4a66';
      roundedRectPath(ctx, c - 15, c - 6, 12, 12, 3);
      ctx.fill();
      strokeInk(ctx, 1.3);
      return;
    }

    if (key === 'plasma') {
      // Mine Layer — bright hazard amber/black crane & rail rack loaded with spiky black naval mines
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 22, 24, 48, 48, 7);
        ctx.fillStyle = '#e59a1a';
        ctx.fill();
      });
      const housingGrad = ctx.createLinearGradient(22, 24, 70, 72);
      housingGrad.addColorStop(0, '#ffc745');
      housingGrad.addColorStop(0.6, '#de8a14');
      housingGrad.addColorStop(1, '#8f4d08');
      roundedRectPath(ctx, 22, 24, 48, 48, 7);
      ctx.fillStyle = housingGrad;
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Rail racks extending right
      const racks = tier === 0 ? [c] : [c - 11, c + 11];
      for (const ry of racks) {
        drawGradBarrel(ctx, 48, ry, 83, 7, '#75828f', '#3d464f', '#1c2126', 1.5);
        // Spiky black naval mine on rack
        ctx.fillStyle = '#181c20';
        ctx.beginPath();
        ctx.arc(73, ry, 6.5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.4);
        ctx.fillStyle = tier === 2 ? '#ff3b2f' : '#ff9f1c';
        ctx.beginPath();
        ctx.arc(73, ry, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (tier === 2) {
        // Red deep-charge crane arm
        drawGradBarrel(ctx, 32, c, 66, 8, '#ff7366', '#d62c22', '#70120d', 1.5);
      }
      return;
    }

    if (key === 'stasis') {
      // Sonar Array — bright cyan/white: rotating twin hydrophone sonar dish/emitter rings (no gun barrel!)
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#dff7ff';
        ctx.beginPath();
        ctx.arc(c, c, 24, 0, Math.PI * 2);
        ctx.fill();
      });

      // Twin hydrophone dishes (top & bottom)
      for (const dy of [-14, 14]) {
        ctx.fillStyle = '#eefaff';
        ctx.beginPath();
        ctx.arc(c + 4, c + dy, 10, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.6);
        ctx.fillStyle = '#12d2e8';
        ctx.beginPath();
        ctx.arc(c + 5, c + dy, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Central emitter core
      const coreGrad = ctx.createRadialGradient(c - 4, c - 4, 2, c, c, 17);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.55, '#66ebff');
      coreGrad.addColorStop(1, '#0d7e94');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(c, c, 17, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.85);

      if (tier >= 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = tier === 2 ? 2.4 : 1.7;
        ctx.beginPath();
        ctx.arc(c, c, 25, -0.9, 0.9);
        ctx.stroke();
      }
      return;
    }

    if (key === 'railgun') {
      // ASW Destroyer Turret — crisp steel-blue & bright white + twin/quad ASW torpedo launcher tubes
      const tubes = tier === 0 ? [-7, 7] : tier === 1 ? [-10, 10] : [-13, -4.5, 4.5, 13];
      for (const ty of tubes) {
        drawGradBarrel(ctx, c - 4, c + ty, 85, tier === 2 ? 5.2 : 6.2, '#f5f9fc', '#9eb5c9', '#4a6075', 1.5);
        // Bright white torpedo tip cap
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(80, c + ty - 2, 4, 4);
      }

      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 22, c - 17, 36, 34, 8);
        ctx.fillStyle = '#5a738c';
        ctx.fill();
      });
      const tGrad = ctx.createLinearGradient(22, c - 17, 58, c + 17);
      tGrad.addColorStop(0, '#b5cae0');
      tGrad.addColorStop(0.55, '#6b859e');
      tGrad.addColorStop(1, '#394c5e');
      roundedRectPath(ctx, 22, c - 17, 36, 34, 8);
      ctx.fillStyle = tGrad;
      ctx.fill();
      strokeInk(ctx, 1.85);

      // White identification hatch
      roundedRectPath(ctx, 29, c - 8, 16, 16, 3);
      ctx.fillStyle = '#eef5fb';
      ctx.fill();
      strokeInk(ctx, 1.3);
      return;
    }

    // swarm: Aegis SAM Pod — crisp white & signal red angled missile box
    withGroundShadow(ctx, () => {
      roundedRectPath(ctx, 20, 22, 54, 52, 7);
      ctx.fillStyle = '#eef4f8';
      ctx.fill();
    });
    const boxGrad = ctx.createLinearGradient(20, 22, 74, 74);
    boxGrad.addColorStop(0, '#ffffff');
    boxGrad.addColorStop(0.7, '#d4e0ea');
    boxGrad.addColorStop(1, '#93a7b8');
    roundedRectPath(ctx, 20, 22, 54, 52, 7);
    ctx.fillStyle = boxGrad;
    ctx.fill();
    strokeInk(ctx, 1.85);

    const cols = tier === 2 ? 3 : 2;
    const rows = 2;
    const cellW = cols === 3 ? 12 : 17;
    const cellH = 16;
    const startX = cols === 3 ? 27 : 28;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * (cellW + 4);
        const y = 29 + r * (cellH + 6);
        roundedRectPath(ctx, x, y, cellW, cellH, 2.5);
        ctx.fillStyle = '#e52b2b';
        ctx.fill();
        strokeInk(ctx, 1.3);
        ctx.fillStyle = '#ff9a8a';
        ctx.fillRect(x + 2, y + 2, cellW - 4, 3);
      }
    }
  });
}

function paintNavalEnemy(key: EnemyKey): Texture {
  if (key === 'dreadnought') {
    // Typhoon Super-Carrier Boss (128x128) — dark-steel & crimson angled-deck carrier
    return paintCanvas(128, (ctx, size) => {
      const c = size / 2;
      drawWakeArcs(ctx, 40, c, 46, 'rgba(225, 246, 255, 0.55)');

      const drawCarrierHull = () => {
        ctx.beginPath();
        ctx.moveTo(118, c - 4);
        ctx.lineTo(106, c - 26);
        ctx.lineTo(30, c - 34);
        ctx.lineTo(10, c - 22);
        ctx.lineTo(10, c + 24);
        ctx.lineTo(36, c + 34);
        ctx.lineTo(104, c + 24);
        ctx.closePath();
      };
      withGroundShadow(ctx, () => {
        drawCarrierHull();
        ctx.fillStyle = '#252d36';
        ctx.fill();
      }, 7, -3.5, 3.5);

      const deckGrad = ctx.createLinearGradient(10, c - 34, 118, c + 34);
      deckGrad.addColorStop(0, '#4d5866');
      deckGrad.addColorStop(0.5, '#333b45');
      deckGrad.addColorStop(1, '#1d2229');
      drawCarrierHull();
      ctx.fillStyle = deckGrad;
      ctx.fill();
      strokeInk(ctx, 2.1);

      // Angled flight deck runway stripe (white/crimson)
      ctx.save();
      ctx.strokeStyle = '#e6eef5';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(20, c + 12);
      ctx.lineTo(108, c - 8);
      ctx.stroke();
      ctx.restore();

      // Crimson bow stripe
      ctx.fillStyle = '#cc2929';
      ctx.beginPath();
      ctx.moveTo(114, c - 4);
      ctx.lineTo(100, c - 20);
      ctx.lineTo(92, c - 19);
      ctx.lineTo(104, c - 3);
      ctx.closePath();
      ctx.fill();

      // Island tower on starboard (bottom-right)
      roundedRectPath(ctx, 50, c + 10, 26, 14, 3);
      ctx.fillStyle = '#6c7a8a';
      ctx.fill();
      strokeInk(ctx, 1.5);

      // Twin heavy deck guns fore
      drawGradBarrel(ctx, 84, c - 14, 102, 4.5, '#a3b1bf', '#5a6673', '#23282e', 1.3);
      drawGradBarrel(ctx, 84, c + 12, 102, 4.5, '#a3b1bf', '#5a6673', '#23282e', 1.3);
    });
  }

  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'scout') {
      // Patrol Boat: sleek narrow olive-grey torpedo boat with white wake & red deck stripe
      drawWakeArcs(ctx, 32, c, 24, 'rgba(230, 248, 255, 0.5)');
      const drawHull = () => {
        ctx.beginPath();
        ctx.moveTo(84, c);
        ctx.quadraticCurveTo(64, c - 13, 20, c - 12);
        ctx.lineTo(14, c);
        ctx.lineTo(20, c + 12);
        ctx.quadraticCurveTo(64, c + 13, 84, c);
        ctx.closePath();
      };
      withGroundShadow(ctx, () => {
        drawHull();
        ctx.fillStyle = '#535e54';
        ctx.fill();
      });
      drawHull();
      ctx.fillStyle = '#6c7a6d';
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Red deck stripe
      ctx.fillStyle = '#d9382e';
      ctx.fillRect(42, c - 3, 26, 6);
      // Cabin
      roundedRectPath(ctx, 28, c - 6, 16, 12, 3);
      ctx.fillStyle = '#9aa89b';
      ctx.fill();
      strokeInk(ctx, 1.3);
      return;
    }

    if (key === 'swarmer') {
      // Fast Attack Craft: tiny nimble dark-red/grey gunboat with sharp bow
      const drawHull = () => {
        ctx.beginPath();
        ctx.moveTo(78, c);
        ctx.lineTo(52, c - 10);
        ctx.lineTo(20, c - 8);
        ctx.lineTo(18, c + 8);
        ctx.lineTo(52, c + 10);
        ctx.closePath();
      };
      withGroundShadow(ctx, () => {
        drawHull();
        ctx.fillStyle = '#474d54';
        ctx.fill();
      });
      drawHull();
      ctx.fillStyle = '#5c646e';
      ctx.fill();
      strokeInk(ctx, 1.7);

      ctx.fillStyle = '#c92a2a';
      ctx.beginPath();
      ctx.moveTo(74, c);
      ctx.lineTo(54, c - 6);
      ctx.lineTo(54, c + 6);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (key === 'cruiser') {
      // Battleship / Heavy Cruiser: wide heavy dark-slate hull, twin triple-gun turrets, smokestack, crimson bow chevron
      drawWakeArcs(ctx, 36, c, 32, 'rgba(220, 245, 255, 0.45)');
      const drawHull = () => {
        ctx.beginPath();
        ctx.moveTo(88, c);
        ctx.quadraticCurveTo(68, c - 22, 24, c - 20);
        ctx.lineTo(10, c - 15);
        ctx.lineTo(10, c + 15);
        ctx.lineTo(24, c + 20);
        ctx.quadraticCurveTo(68, c + 22, 88, c);
        ctx.closePath();
      };
      withGroundShadow(ctx, () => {
        drawHull();
        ctx.fillStyle = '#333d47';
        ctx.fill();
      });
      const grad = ctx.createLinearGradient(10, c - 20, 10, c + 20);
      grad.addColorStop(0, '#627180');
      grad.addColorStop(0.5, '#3d4854');
      grad.addColorStop(1, '#222930');
      drawHull();
      ctx.fillStyle = grad;
      ctx.fill();
      strokeInk(ctx, 1.9);

      // Crimson bow chevron
      ctx.fillStyle = '#d12e2e';
      ctx.beginPath();
      ctx.moveTo(84, c);
      ctx.lineTo(68, c - 9);
      ctx.lineTo(62, c - 9);
      ctx.lineTo(76, c);
      ctx.lineTo(62, c + 9);
      ctx.lineTo(68, c + 9);
      ctx.closePath();
      ctx.fill();

      // Twin turrets (fore & aft)
      for (const tx of [26, 60]) {
        drawGradBarrel(ctx, tx, c - 3.5, tx + 16, 3.2, '#b8c4d0', '#697785', '#2a3138', 1.1);
        drawGradBarrel(ctx, tx, c + 3.5, tx + 16, 3.2, '#b8c4d0', '#697785', '#2a3138', 1.1);
        ctx.fillStyle = '#7c8b99';
        ctx.beginPath();
        ctx.arc(tx, c, 7.5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.4);
      }

      // Smokestack
      ctx.fillStyle = '#1b2026';
      ctx.beginPath();
      ctx.arc(43, c, 5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);
      return;
    }

    if (key === 'frigate') {
      // Attack Submarine: sleek cigar-shaped dark-navy-charcoal hull, bow dive planes, conning tower sail, red stripe
      // Bow dive planes
      ctx.fillStyle = '#2b3642';
      ctx.fillRect(62, c - 17, 7, 34);
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(62, c - 17, 7, 34);

      const drawSub = () => {
        ctx.beginPath();
        ctx.ellipse(c, c, 38, 12, 0, 0, Math.PI * 2);
      };
      withGroundShadow(ctx, () => {
        drawSub();
        ctx.fillStyle = '#1e2730';
        ctx.fill();
      });
      const subGrad = ctx.createLinearGradient(10, c - 12, 10, c + 12);
      subGrad.addColorStop(0, '#465666');
      subGrad.addColorStop(0.5, '#25303b');
      subGrad.addColorStop(1, '#12181f');
      drawSub();
      ctx.fillStyle = subGrad;
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Subtle red stripe near bow
      ctx.fillStyle = '#cc2e2e';
      ctx.fillRect(70, c - 6, 4, 12);

      // Conning tower sail + periscope glint
      roundedRectPath(ctx, 38, c - 5, 18, 10, 4);
      ctx.fillStyle = '#596b7d';
      ctx.fill();
      strokeInk(ctx, 1.4);
      ctx.fillStyle = '#9be8ff';
      ctx.beginPath();
      ctx.arc(48, c, 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // phase: Naval Strike Bomber (NO close shadow; renderer draws offset sea shadow)
    // Swept-wing light-silver-grey carrier jet with crimson wing markings & twin engines
    ctx.beginPath();
    ctx.moveTo(86, c);
    ctx.lineTo(54, c - 9);
    ctx.lineTo(24, c - 36);
    ctx.lineTo(14, c - 34);
    ctx.lineTo(26, c - 8);
    ctx.lineTo(10, c - 12);
    ctx.lineTo(16, c);
    ctx.lineTo(10, c + 12);
    ctx.lineTo(26, c + 8);
    ctx.lineTo(14, c + 34);
    ctx.lineTo(24, c + 36);
    ctx.lineTo(54, c + 9);
    ctx.closePath();

    const jetGrad = ctx.createLinearGradient(10, c - 36, 86, c + 36);
    jetGrad.addColorStop(0, '#e8eff5');
    jetGrad.addColorStop(0.6, '#b8c5d1');
    jetGrad.addColorStop(1, '#7e8e9e');
    ctx.fillStyle = jetGrad;
    ctx.fill();
    strokeInk(ctx, 1.85);

    // Crimson wing markings
    ctx.fillStyle = '#d62828';
    ctx.fillRect(24, c - 26, 10, 5);
    ctx.fillRect(24, c + 21, 10, 5);

    // Canopy
    ctx.fillStyle = '#38c7f0';
    ctx.beginPath();
    ctx.ellipse(62, c, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.3);
  });
}

function paintNavalMine(): Texture {
  return paintCanvas(48, (ctx, size) => {
    const c = size / 2;
    withGroundShadow(ctx, () => {
      ctx.fillStyle = '#1b2026';
      ctx.beginPath();
      ctx.arc(c, c, 13, 0, Math.PI * 2);
      ctx.fill();
    }, 4, -1.5, 1.5);

    // 6 protruding contact horns
    ctx.strokeStyle = INK_OUTLINE;
    ctx.lineWidth = 3.2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 11, c + Math.sin(a) * 11);
      ctx.lineTo(c + Math.cos(a) * 19, c + Math.sin(a) * 19);
      ctx.stroke();
      ctx.fillStyle = '#4e5863';
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * 19, c + Math.sin(a) * 19, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const grad = ctx.createRadialGradient(c - 4, c - 4, 2, c, c, 13);
    grad.addColorStop(0, '#5a6570');
    grad.addColorStop(0.55, '#2b323a');
    grad.addColorStop(1, '#12151a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 13, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.6);

    // Bright glowing red-orange top indicator dot
    ctx.fillStyle = '#ff3d24';
    ctx.beginPath();
    ctx.arc(c, c, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(c - 1, c - 1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function paintNavalObstacle(variant: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const rand = mulberry32(3100 + variant * 97);

    // Subtle translucent coastal shoal/volcanic reef contour overlay
    const drawReef = (r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const rad = r * (0.82 + rand() * 0.3);
        const px = c + Math.cos(a) * rad;
        const py = c + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    ctx.fillStyle = 'rgba(64, 196, 180, 0.22)';
    drawReef(36);
    ctx.fill();
    ctx.strokeStyle = 'rgba(210, 248, 255, 0.58)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(34, 48, 42, 0.55)';
    drawReef(22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(13, 16, 13, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function paintNavalCrater(): Texture {
  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 3, c, c, 28);
    grad.addColorStop(0, 'rgba(235, 252, 255, 0.75)');
    grad.addColorStop(0.5, 'rgba(110, 220, 245, 0.45)');
    grad.addColorStop(1, 'rgba(70, 180, 220, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(240, 252, 255, 0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(c, c, 17, 0.2, Math.PI * 1.7);
    ctx.stroke();
  });
}

// ============================================================================
// 2. MARS THEATER (MARS OUTPOST — RED PLANET COLONY)
// ============================================================================

function paintMarsBase(key: TurretKey): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const palette: Record<TurretKey, [string, string, string]> = {
      pulse: ['#eef7fc', '#b9d4e3', '#15d4f0'],
      plasma: ['#4b474a', '#262326', '#ff6d1f'],
      stasis: ['#e3f6ff', '#8bc2de', '#3be0ff'],
      railgun: ['#d8dde3', '#7f8a96', '#f2b729'],
      swarm: ['#f2f4f7', '#b2bcc7', '#e82cb8'],
    };
    const [light, mid, accent] = palette[key];

    withGroundShadow(ctx, () => {
      polygonPath(ctx, c, c, 33, key === 'swarm' ? 6 : 8, Math.PI / 8);
      ctx.fillStyle = mid;
      ctx.fill();
    });

    const grad = ctx.createRadialGradient(c - 8, c - 8, 4, c, c, 33);
    grad.addColorStop(0, light);
    grad.addColorStop(1, mid);
    polygonPath(ctx, c, c, 33, key === 'swarm' ? 6 : 8, Math.PI / 8);
    ctx.fillStyle = grad;
    ctx.fill();
    strokeInk(ctx, 1.85);

    // Accent trim ring
    polygonPath(ctx, c, c, 24, key === 'swarm' ? 6 : 8, Math.PI / 8);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  });
}

function paintMarsTurret(key: TurretKey, tier: 0 | 1 | 2): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'pulse') {
      // Pulse Blaster: crisp white-and-cyan colony pad + twin glowing cyan laser emitters
      const offsets = tier === 0 ? [-6, 6] : tier === 1 ? [-9, 9] : [-10, 0, 10];
      for (const oy of offsets) {
        drawGradBarrel(ctx, c, c + oy, 85, 5, '#ffffff', '#8be8ff', '#0b7b94', 1.5);
        ctx.fillStyle = '#47f3ff';
        ctx.beginPath();
        ctx.arc(84, c + oy, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      withGroundShadow(ctx, () => {
        polygonPath(ctx, c - 4, c, 20, 8, Math.PI / 8);
        ctx.fillStyle = '#e8f5fa';
        ctx.fill();
      });
      polygonPath(ctx, c - 4, c, 20, 8, Math.PI / 8);
      ctx.fillStyle = '#eef8fc';
      ctx.fill();
      strokeInk(ctx, 1.85);
      ctx.fillStyle = '#14d9f5';
      ctx.beginPath();
      ctx.arc(c - 4, c, 7, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);
      return;
    }

    if (key === 'plasma') {
      // Magma Mortar: dark basalt-iron bunker + glowing molten-orange wide thermal mortar barrel
      drawGradBarrel(ctx, c - 4, c, 84, tier === 2 ? 18 : 14, '#ffb259', '#d95314', '#541b06', 1.7);
      ctx.fillStyle = '#ff981f';
      ctx.beginPath();
      ctx.arc(81, c, tier === 2 ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fill();

      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 20, 24, 38, 48, 8);
        ctx.fillStyle = '#332f33';
        ctx.fill();
      });
      roundedRectPath(ctx, 20, 24, 38, 48, 8);
      ctx.fillStyle = '#474247';
      ctx.fill();
      strokeInk(ctx, 1.85);

      ctx.fillStyle = '#ff6a14';
      ctx.beginPath();
      ctx.arc(38, c, 8, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);
      return;
    }

    if (key === 'stasis') {
      // Cryo-Seismic Thumper: gleaming ice-blue & silver circular rig with 3 cryogenic coils (no barrel!)
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#cdeeff';
        ctx.beginPath();
        ctx.arc(c, c, 24, 0, Math.PI * 2);
        ctx.fill();
      });
      const grad = ctx.createRadialGradient(c - 5, c - 5, 3, c, c, 24);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#75dfff');
      grad.addColorStop(1, '#197599');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c, c, 24, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.85);

      // 3 cryogenic coils
      const coils = tier === 2 ? 4 : 3;
      for (let i = 0; i < coils; i++) {
        const a = (i / coils) * Math.PI * 2;
        ctx.fillStyle = '#e8fbff';
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 14, c + Math.sin(a) * 14, 5.5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.4);
      }
      return;
    }

    if (key === 'railgun') {
      // Mass Driver: bright titanium-silver & gold-striped long dual-rail electromagnetic accelerator
      for (const oy of [-6, 6]) {
        drawGradBarrel(ctx, c - 4, c + oy, 88, 5.5, '#ffffff', '#a9b5c2', '#47525e', 1.5);
      }
      // Gold EM coil bands
      ctx.fillStyle = '#f5bc2c';
      for (const bx of [56, 70]) {
        ctx.fillRect(bx, c - 10, 5, 20);
        ctx.strokeStyle = INK_OUTLINE;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(bx, c - 10, 5, 20);
      }
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 18, c - 18, 36, 36, 6);
        ctx.fillStyle = '#cfd8e0';
        ctx.fill();
      });
      roundedRectPath(ctx, 18, c - 18, 36, 36, 6);
      ctx.fillStyle = '#dce4ec';
      ctx.fill();
      strokeInk(ctx, 1.85);
      return;
    }

    // swarm: Orbital Drone Pod — sleek white & magenta-trimmed hexagonal bay with 4 micro-drone pads
    withGroundShadow(ctx, () => {
      polygonPath(ctx, c, c, 24, 6, 0);
      ctx.fillStyle = '#edf2f7';
      ctx.fill();
    });
    polygonPath(ctx, c, c, 24, 6, 0);
    ctx.fillStyle = '#f5f8fc';
    ctx.fill();
    strokeInk(ctx, 1.85);

    const pads = tier === 2 ? 6 : 4;
    for (let i = 0; i < pads; i++) {
      const a = (i / pads) * Math.PI * 2 + Math.PI / 4;
      const px = c + Math.cos(a) * 11;
      const py = c + Math.sin(a) * 11;
      ctx.fillStyle = '#e82cb8';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.2);
    }
  });
}

function paintMarsEnemy(key: EnemyKey): Texture {
  if (key === 'dreadnought') {
    // Olympus Behemoth (128x128): huge 6-legged metallic crimson boss
    return paintCanvas(128, (ctx, size) => {
      const c = size / 2;
      // 6 heavy mechanical legs
      withGroundShadow(ctx, () => {
        ctx.strokeStyle = '#3d1515';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        for (const lx of [36, 64, 92]) {
          ctx.beginPath();
          ctx.moveTo(lx, c - 46);
          ctx.lineTo(lx, c + 46);
          ctx.stroke();
        }
      }, 6, -3, 3);

      for (const lx of [36, 64, 92]) {
        ctx.strokeStyle = INK_OUTLINE;
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lx, c - 45);
        ctx.lineTo(lx, c + 45);
        ctx.stroke();

        ctx.strokeStyle = '#852424';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(lx, c - 45);
        ctx.lineTo(lx, c + 45);
        ctx.stroke();
      }

      // Armored crimson-steel carapace
      const bodyGrad = ctx.createLinearGradient(18, c - 30, 112, c + 30);
      bodyGrad.addColorStop(0, '#e04838');
      bodyGrad.addColorStop(0.55, '#991f1b');
      bodyGrad.addColorStop(1, '#4a0d0d');
      roundedRectPath(ctx, 20, c - 28, 86, 56, 16);
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      strokeInk(ctx, 2.2);

      // Twin heavy cannons
      drawGradBarrel(ctx, 84, c - 12, 118, 7, '#f0a899', '#992b24', '#380c09', 1.6);
      drawGradBarrel(ctx, 84, c + 12, 118, 7, '#f0a899', '#992b24', '#380c09', 1.6);
    });
  }

  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'scout') {
      // Sand Skimmer: sandy-metallic sleek hover skimmer
      const drawHull = () => {
        ctx.beginPath();
        ctx.moveTo(84, c);
        ctx.lineTo(44, c - 16);
        ctx.lineTo(16, c - 10);
        ctx.lineTo(22, c);
        ctx.lineTo(16, c + 10);
        ctx.lineTo(44, c + 16);
        ctx.closePath();
      };
      withGroundShadow(ctx, () => {
        drawHull();
        ctx.fillStyle = '#d4b483';
        ctx.fill();
      });
      drawHull();
      ctx.fillStyle = '#e0c496';
      ctx.fill();
      strokeInk(ctx, 1.8);
      ctx.fillStyle = '#29d8f0';
      ctx.beginPath();
      ctx.ellipse(54, c, 9, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.2);
      return;
    }

    if (key === 'swarmer') {
      // Burrow Mite: spider-like chitinous 6-legged mite
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 3.2;
      for (const ang of [-0.9, -0.35, 0.35, 0.9, 2.3, -2.3]) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(ang) * 24, c + Math.sin(ang) * 24);
        ctx.stroke();
      }
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#c46a25';
        ctx.beginPath();
        ctx.ellipse(c, c, 15, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#e0852b';
      ctx.beginPath();
      ctx.ellipse(c, c, 15, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.7);
      return;
    }

    if (key === 'cruiser') {
      // Regolith Juggernaut: heavy tracked crimson-iron juggernaut
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 16, c - 22, 62, 44, 6);
        ctx.fillStyle = '#382a2a';
        ctx.fill();
      });
      // Treads
      ctx.fillStyle = '#262124';
      roundedRectPath(ctx, 16, c - 24, 58, 10, 3);
      ctx.fill();
      strokeInk(ctx, 1.5);
      roundedRectPath(ctx, 16, c + 14, 58, 10, 3);
      ctx.fill();
      strokeInk(ctx, 1.5);

      // Crimson body + armored plow
      roundedRectPath(ctx, 20, c - 17, 56, 34, 6);
      ctx.fillStyle = '#b5312a';
      ctx.fill();
      strokeInk(ctx, 1.85);
      ctx.fillStyle = '#d9b44a';
      ctx.fillRect(72, c - 15, 7, 30);
      strokeInk(ctx, 1.3);
      return;
    }

    if (key === 'frigate') {
      // Shield-Crawler: crystalline glowing-blue faceted crawler
      withGroundShadow(ctx, () => {
        polygonPath(ctx, c, c, 26, 6, 0);
        ctx.fillStyle = '#1f88b8';
        ctx.fill();
      });
      const grad = ctx.createRadialGradient(c - 4, c - 4, 2, c, c, 26);
      grad.addColorStop(0, '#c4f5ff');
      grad.addColorStop(0.6, '#2bb8f0');
      grad.addColorStop(1, '#105780');
      polygonPath(ctx, c, c, 26, 6, 0);
      ctx.fillStyle = grad;
      ctx.fill();
      strokeInk(ctx, 1.85);
      return;
    }

    // phase: Dust Wasp Drone (NO close shadow)
    ctx.beginPath();
    ctx.moveTo(82, c);
    ctx.lineTo(48, c - 8);
    ctx.lineTo(28, c - 34);
    ctx.lineTo(22, c - 28);
    ctx.lineTo(34, c - 6);
    ctx.lineTo(16, c);
    ctx.lineTo(34, c + 6);
    ctx.lineTo(22, c + 28);
    ctx.lineTo(28, c + 34);
    ctx.lineTo(48, c + 8);
    ctx.closePath();
    ctx.fillStyle = '#ff9f1c';
    ctx.fill();
    strokeInk(ctx, 1.8);
    ctx.fillStyle = '#e82cb8';
    ctx.beginPath();
    ctx.arc(54, c, 6, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.3);
  });
}

function paintMarsBoost(): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const glow = ctx.createRadialGradient(c, c, 4, c, c, 40);
    glow.addColorStop(0, 'rgba(255, 250, 210, 0.95)');
    glow.addColorStop(0.35, 'rgba(255, 178, 45, 0.85)');
    glow.addColorStop(0.75, 'rgba(220, 82, 18, 0.35)');
    glow.addColorStop(1, 'rgba(220, 82, 18, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c, c, 40, 0, Math.PI * 2);
    ctx.fill();

    // Fissure ring & heat rays
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 14, c + Math.sin(a) * 14);
      ctx.lineTo(c + Math.cos(a) * 32, c + Math.sin(a) * 32);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff5cc';
    ctx.beginPath();
    ctx.arc(c, c, 12, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.6);
  });
}

function paintMarsObstacle(variant: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const rand = mulberry32(4200 + variant * 131);
    const drawRock = (r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const rad = r * (0.76 + rand() * 0.34);
        const px = c + Math.cos(a) * rad;
        const py = c + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    withGroundShadow(ctx, () => {
      drawRock(33);
      ctx.fillStyle = '#2d2323';
      ctx.fill();
    });
    const grad = ctx.createLinearGradient(16, 16, 80, 80);
    grad.addColorStop(0, '#8c4435');
    grad.addColorStop(0.55, '#47302e');
    grad.addColorStop(1, '#241a1a');
    drawRock(33);
    ctx.fillStyle = grad;
    ctx.fill();
    strokeInk(ctx, 1.9);

    // Dashed no-build rim
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 130, 80, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(c, c, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

function paintMarsCrater(): Texture {
  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 2, c, c, 28);
    grad.addColorStop(0, 'rgba(26, 12, 10, 0.92)');
    grad.addColorStop(0.55, 'rgba(64, 26, 18, 0.68)');
    grad.addColorStop(1, 'rgba(64, 26, 18, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 28, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ============================================================================
// 3. MEDIEVAL THEATER (IRONHOLD KEEP — CASTLE SIEGE)
// ============================================================================

function paintMedievalBase(key: TurretKey): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'pulse') {
      // Round cut-stone tower base + wooden parapet
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#73767a';
        ctx.beginPath();
        ctx.arc(c, c, 32, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#9aa0a6';
      ctx.beginPath();
      ctx.arc(c, c, 32, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.9);

      ctx.fillStyle = '#8a5a32';
      ctx.beginPath();
      ctx.arc(c, c, 24, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.5);
      return;
    }

    if (key === 'plasma') {
      // Square timber fortification
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 14, 14, 68, 68, 6);
        ctx.fillStyle = '#6e4522';
        ctx.fill();
      });
      roundedRectPath(ctx, 14, 14, 68, 68, 6);
      ctx.fillStyle = '#946133';
      ctx.fill();
      strokeInk(ctx, 1.9);
      ctx.strokeStyle = '#472b13';
      ctx.lineWidth = 1.4;
      for (const y of [28, 42, 56, 70]) {
        ctx.beginPath();
        ctx.moveTo(16, y);
        ctx.lineTo(80, y);
        ctx.stroke();
      }
      return;
    }

    if (key === 'stasis') {
      // Pale cut-stone octagonal wizard tower base
      withGroundShadow(ctx, () => {
        polygonPath(ctx, c, c, 32, 8, Math.PI / 8);
        ctx.fillStyle = '#c5d2dc';
        ctx.fill();
      });
      polygonPath(ctx, c, c, 32, 8, Math.PI / 8);
      ctx.fillStyle = '#dbe7f0';
      ctx.fill();
      strokeInk(ctx, 1.85);
      polygonPath(ctx, c, c, 22, 8, Math.PI / 8);
      ctx.strokeStyle = '#3bd6ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    if (key === 'railgun') {
      // Pale limestone + bright gold-iron trim
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 14, 16, 68, 64, 10);
        ctx.fillStyle = '#cfc8b8';
        ctx.fill();
      });
      roundedRectPath(ctx, 14, 16, 68, 64, 10);
      ctx.fillStyle = '#e3dccb';
      ctx.fill();
      strokeInk(ctx, 1.85);
      roundedRectPath(ctx, 21, 23, 54, 50, 6);
      ctx.strokeStyle = '#d9a426';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      return;
    }

    // swarm: Warm rustic timber & cobblestone Horse Paddock Courtyard with fence rails, hay bales, and arched gateway facing +X
    withGroundShadow(ctx, () => {
      roundedRectPath(ctx, 12, 14, 72, 68, 8);
      ctx.fillStyle = '#5c4d3c';
      ctx.fill();
    });
    roundedRectPath(ctx, 12, 14, 72, 68, 8);
    ctx.fillStyle = '#8b7d6b';
    ctx.fill();
    strokeInk(ctx, 1.9);

    // Cobblestone courtyard paving
    ctx.fillStyle = '#736657';
    for (const [cx, cy, r] of [
      [28, 28, 5],
      [44, 24, 4.5],
      [60, 30, 5],
      [34, 48, 5.5],
      [52, 46, 5],
      [68, 48, 5.5],
      [30, 66, 5],
      [48, 68, 4.5],
      [64, 65, 5],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Golden hay bales in rear corners
    for (const hy of [19, 65]) {
      roundedRectPath(ctx, 18, hy, 16, 12, 2.5);
      ctx.fillStyle = '#e6bc47';
      ctx.fill();
      strokeInk(ctx, 1.3);
      ctx.strokeStyle = '#9e6b1b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(23, hy + 1);
      ctx.lineTo(23, hy + 11);
      ctx.moveTo(29, hy + 1);
      ctx.lineTo(29, hy + 11);
      ctx.stroke();
    }

    // Wooden paddock fence rails (top, bottom, rear)
    ctx.fillStyle = '#7d4b24';
    ctx.fillRect(14, 15, 62, 5);
    strokeInk(ctx, 1.3);
    ctx.fillStyle = '#7d4b24';
    ctx.fillRect(14, 76, 62, 5);
    strokeInk(ctx, 1.3);
    ctx.fillStyle = '#6b3e1c';
    ctx.fillRect(14, 15, 5, 66);
    strokeInk(ctx, 1.3);

    // Arched stone/timber gateway posts on right (+X)
    for (const gy of [22, 62]) {
      roundedRectPath(ctx, 73, gy, 11, 12, 3);
      ctx.fillStyle = '#a3998b';
      ctx.fill();
      strokeInk(ctx, 1.5);
    }
  });
}

function paintMedievalTurret(key: TurretKey, tier: 0 | 1 | 2): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'pulse') {
      // Archer Tower: drawn longbow + bright silver-tipped arrow volley
      withGroundShadow(ctx, () => {
        ctx.strokeStyle = '#8c5528';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(c - 4, c, 24, -1.1, 1.1);
        ctx.stroke();
      });
      // Bowstring
      ctx.strokeStyle = '#f0ead8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(c + 7, c - 21);
      ctx.lineTo(c - 10, c);
      ctx.lineTo(c + 7, c + 21);
      ctx.stroke();
      // Bow limb
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 7.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(c - 4, c, 24, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = '#b57238';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(c - 4, c, 24, -1.1, 1.1);
      ctx.stroke();

      // Silver-tipped arrows
      const arrows = tier === 0 ? [0] : tier === 1 ? [-6, 6] : [-8, 0, 8];
      for (const ay of arrows) {
        drawGradBarrel(ctx, c - 10, c + ay, 82, 3.2, '#f5e2c4', '#b5783a', '#613c18', 1.2);
        ctx.fillStyle = '#eef6fc';
        ctx.beginPath();
        ctx.moveTo(88, c + ay);
        ctx.lineTo(78, c + ay - 4.5);
        ctx.lineTo(78, c + ay + 4.5);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.2);
      }
      return;
    }

    if (key === 'plasma') {
      // Trebuchet / Catapult: wooden throwing arm, counterweight box, glowing flaming stone boulder
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 20, 28, 22, 40, 4);
        ctx.fillStyle = '#5c3818';
        ctx.fill();
      });
      // Throwing arm
      drawGradBarrel(ctx, 28, c, 78, 8, '#c78748', '#8a5422', '#47280d', 1.6);
      // Counterweight box
      roundedRectPath(ctx, 20, 28, 20, 40, 4);
      ctx.fillStyle = '#754720';
      ctx.fill();
      strokeInk(ctx, 1.7);

      if (tier === 2) {
        // Tier 2 Max-Power Flaming Trebuchet: burning braziers on frame + blazing fiery pitch fireball
        for (const by of [23, 73]) {
          ctx.fillStyle = '#3c424a';
          ctx.beginPath();
          ctx.arc(30, by, 6, 0, Math.PI * 2);
          ctx.fill();
          strokeInk(ctx, 1.3);

          const brazier = ctx.createRadialGradient(30, by, 1, 30, by, 7.5);
          brazier.addColorStop(0, '#fff9c4');
          brazier.addColorStop(0.5, '#ff8f1c');
          brazier.addColorStop(1, 'rgba(217, 38, 11, 0)');
          ctx.fillStyle = brazier;
          ctx.beginPath();
          ctx.arc(30, by, 7.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Outer blazing flame aura
        const aura = ctx.createRadialGradient(74, c, 4, 74, c, 21);
        aura.addColorStop(0, 'rgba(255, 240, 140, 0.95)');
        aura.addColorStop(0.45, 'rgba(255, 115, 18, 0.85)');
        aura.addColorStop(1, 'rgba(184, 24, 8, 0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(74, c, 21, 0, Math.PI * 2);
        ctx.fill();

        // Flame tongues licking backward/outward around the cradle
        ctx.fillStyle = '#ff6a12';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rOuter = i % 2 === 0 ? 16 : 12;
          const px = 74 + Math.cos(a) * rOuter;
          const py = c + Math.sin(a) * rOuter;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
          const aMid = a + Math.PI / 8;
          ctx.lineTo(74 + Math.cos(aMid) * 9, c + Math.sin(aMid) * 9);
        }
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.4);

        // Molten white-gold pitch fireball core
        const core = ctx.createRadialGradient(73, c - 1, 1.5, 74, c, 10.5);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.45, '#fff08a');
        core.addColorStop(0.85, '#ff7b14');
        core.addColorStop(1, '#c92a0a');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(74, c, 10.5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.3);
      } else {
        // Glowing flaming boulder in sling
        const flame = ctx.createRadialGradient(74, c, 2, 74, c, 11);
        flame.addColorStop(0, '#fff7c2');
        flame.addColorStop(0.55, '#ff7b14');
        flame.addColorStop(1, '#b8250b');
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.arc(74, c, 9.5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.6);
      }
      return;
    }

    if (key === 'stasis') {
      // Frost Mage Spire: brilliant glowing cyan-white frost crystal orb (no barrel!)
      withGroundShadow(ctx, () => {
        polygonPath(ctx, c, c, 22, 6, 0);
        ctx.fillStyle = '#8eeaff';
        ctx.fill();
      });
      const orbGrad = ctx.createRadialGradient(c - 4, c - 4, 3, c, c, 22);
      orbGrad.addColorStop(0, '#ffffff');
      orbGrad.addColorStop(0.55, '#7af0ff');
      orbGrad.addColorStop(1, '#1488b8');
      polygonPath(ctx, c, c, 22, tier === 2 ? 8 : 6, 0);
      ctx.fillStyle = orbGrad;
      ctx.fill();
      strokeInk(ctx, 1.85);
      return;
    }

    if (key === 'railgun') {
      // Heavy Ballista: curved wooden & steel giant crossbow limbs + taut string + heavy iron siege bolt
      ctx.strokeStyle = '#f2ecdc';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(56, 16);
      ctx.lineTo(26, c);
      ctx.lineTo(56, 80);
      ctx.stroke();

      // Curved crossbow limbs
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(56, 16);
      ctx.quadraticCurveTo(68, c, 56, 80);
      ctx.stroke();
      ctx.strokeStyle = '#c98838';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(56, 16);
      ctx.quadraticCurveTo(68, c, 56, 80);
      ctx.stroke();

      // Stock & heavy iron siege bolt
      drawGradBarrel(ctx, 22, c, 84, tier === 2 ? 7 : 5.5, '#f2d379', '#a68129', '#4a360d', 1.6);
      ctx.fillStyle = '#dce7f2';
      ctx.beginPath();
      ctx.moveTo(90, c);
      ctx.lineTo(76, c - 7);
      ctx.lineTo(76, c + 7);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.5);
      return;
    }

    // swarm: Knight Stable (T0: Timber Stable, T1: Squiring Yard, T2: Royal Cavalry Keep)
    // Cobble exit lane on right (+X)
    ctx.fillStyle = '#685e52';
    ctx.fillRect(62, c - 13, 24, 26);
    strokeInk(ctx, 1.3);

    if (tier === 0) {
      // Lv 1 Stable (1 Knight): Warm pitched timber barn roof with horseshoe crest over dark oak beam doorway
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 20, 22, 46, 52, 5);
        ctx.fillStyle = '#5c3314';
        ctx.fill();
      });
      // Dark oak beam doorway facing +X
      ctx.fillStyle = '#381e0c';
      ctx.fillRect(62, c - 11, 9, 22);
      strokeInk(ctx, 1.4);

      // Pitched timber barn roof
      roundedRectPath(ctx, 20, 22, 46, 52, 5);
      ctx.fillStyle = '#995829';
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Shingle/plank lines
      ctx.strokeStyle = '#6b3a17';
      ctx.lineWidth = 1.4;
      for (const py of [31, 40, 56, 65]) {
        ctx.beginPath();
        ctx.moveTo(22, py);
        ctx.lineTo(64, py);
        ctx.stroke();
      }
      // Ridge beam
      drawGradBarrel(ctx, 19, c, 67, 5.5, '#c47b41', '#874c1f', '#4a260c', 1.4);

      // Horseshoe crest
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(43, c, 7.5, -Math.PI * 0.72, Math.PI * 0.72);
      ctx.stroke();
      return;
    }

    if (tier === 1) {
      // Lv 2 Squiring Yard (3 Knights): Reinforced stone-and-timber twin-gable stable with royal blue & silver pennants + steel shield
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, 18, 18, 50, 60, 5);
        ctx.fillStyle = '#4e545c';
        ctx.fill();
      });
      // Oak doorway
      ctx.fillStyle = '#331c0b';
      ctx.fillRect(64, c - 12, 10, 24);
      strokeInk(ctx, 1.4);

      // Stone base walls
      roundedRectPath(ctx, 18, 18, 50, 60, 5);
      ctx.fillStyle = '#949aa1';
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Twin timber gables
      for (const gy of [22, 51]) {
        roundedRectPath(ctx, 22, gy, 42, 23, 3.5);
        ctx.fillStyle = '#874f24';
        ctx.fill();
        strokeInk(ctx, 1.6);
        drawGradBarrel(ctx, 21, gy + 11.5, 65, 4, '#b87138', '#7d471d', '#47250b', 1.2);
      }

      // Royal blue & silver knight pennants
      for (const py of [21, 71]) {
        ctx.fillStyle = '#2255b8';
        ctx.beginPath();
        ctx.moveTo(64, py);
        ctx.lineTo(82, py - 3.5);
        ctx.lineTo(77, py + 2);
        ctx.lineTo(82, py + 6.5);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.3);
        ctx.fillStyle = '#dce5f0';
        ctx.fillRect(66, py + 0.5, 8, 2.2);
      }

      // Steel shield emblem in center
      ctx.fillStyle = '#d4dde8';
      ctx.beginPath();
      ctx.moveTo(49, c - 7);
      ctx.lineTo(49, c + 7);
      ctx.lineTo(39, c);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.3);
      return;
    }

    // Lv 3 Royal Cavalry (5 Knights): Grand stone fortress stable with royal cobalt-and-gold crenellated gable, twin golden lion banners & gilded lance rack
    withGroundShadow(ctx, () => {
      roundedRectPath(ctx, 16, 16, 54, 64, 6);
      ctx.fillStyle = '#484f59';
      ctx.fill();
    });
    // Grand archway exit
    ctx.fillStyle = '#2b180a';
    ctx.fillRect(66, c - 13, 10, 26);
    strokeInk(ctx, 1.5);

    // Grand cut-stone fortress roof
    roundedRectPath(ctx, 16, 16, 54, 64, 6);
    ctx.fillStyle = '#adb4bd';
    ctx.fill();
    strokeInk(ctx, 1.9);

    // Royal cobalt-and-gold pitched inner roof
    roundedRectPath(ctx, 22, 22, 42, 52, 4);
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
    strokeInk(ctx, 1.6);

    // Crenellated gold trim & ridge
    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(24, 24, 38, 48);
    drawGradBarrel(ctx, 20, c, 66, 5.5, '#ffe27a', '#f5c542', '#9e7316', 1.4);

    // Twin golden lion banners
    for (const py of [20, 72]) {
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.moveTo(66, py);
      ctx.lineTo(86, py - 4);
      ctx.lineTo(80, py + 2);
      ctx.lineTo(86, py + 7);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.3);
      ctx.fillStyle = '#f5c542';
      ctx.beginPath();
      ctx.arc(73, py + 1.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gilded lance rack on front-left parapet
    for (const ly of [33, 41, 55, 63]) {
      drawGradBarrel(ctx, 14, ly, 36, 2.6, '#fff0a6', '#f2c138', '#8c6311', 1);
    }
  });
}

function paintMedievalEnemy(key: EnemyKey): Texture {
  if (key === 'dreadnought') {
    // Siege Troll King Boss (128x128): tattered crimson war-banners, leather-strapped armored torso,
    // layered spiked iron pauldrons, horned spiked golden crown over snarling tusked face, rune-etched warhammer
    return paintCanvas(128, (ctx, size) => {
      const c = size / 2;

      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, c - 34, c - 34, 62, 68, 18);
        ctx.fillStyle = '#263822';
        ctx.fill();
      }, 7, -3.5, 3.5);

      // Tattered crimson war-banners on back (left)
      for (const by of [c - 28, c + 17]) {
        ctx.fillStyle = '#b81d24';
        ctx.beginPath();
        ctx.moveTo(34, by);
        ctx.lineTo(10, by - 2);
        ctx.lineTo(16, by + 5.5);
        ctx.lineTo(10, by + 13);
        ctx.lineTo(34, by + 11);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.5);
      }

      // Colossal rune-etched iron warhammer extending right (+X)
      drawGradBarrel(ctx, c + 4, c + 16, 114, 7.5, '#b57b3c', '#734a1e', '#38220c', 1.7);
      roundedRectPath(ctx, 94, c - 3, 22, 38, 4);
      ctx.fillStyle = '#6c7785';
      ctx.fill();
      strokeInk(ctx, 1.9);
      // Glowing etched runes on warhammer head
      ctx.strokeStyle = '#ff9d2e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(100, c + 6);
      ctx.lineTo(110, c + 16);
      ctx.lineTo(100, c + 26);
      ctx.moveTo(105, c + 4);
      ctx.lineTo(105, c + 28);
      ctx.stroke();

      // Muscular olive-green arms & neck base
      ctx.fillStyle = '#48733c';
      ctx.beginPath();
      ctx.ellipse(c - 2, c, 30, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 2.0);

      // Leather-strapped iron cuirass torso (NOT a plain green oval!)
      roundedRectPath(ctx, c - 26, c - 26, 48, 52, 12);
      ctx.fillStyle = '#49525c';
      ctx.fill();
      strokeInk(ctx, 1.9);
      // Crossed leather straps & brass buckle
      ctx.strokeStyle = '#6e421f';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(c - 20, c - 21);
      ctx.lineTo(c + 16, c + 21);
      ctx.moveTo(c - 20, c + 21);
      ctx.lineTo(c + 16, c - 21);
      ctx.stroke();
      ctx.fillStyle = '#d9a426';
      ctx.beginPath();
      ctx.arc(c - 2, c, 5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);

      // Layered dark-iron shoulder plates with silver spikes
      for (const side of [-1, 1] as const) {
        const py = c + side * 29;
        // Silver spikes
        ctx.fillStyle = '#dce5f0';
        for (const sx of [-7, 5]) {
          ctx.beginPath();
          ctx.moveTo(c + sx - 4, py);
          ctx.lineTo(c + sx, py + side * 17);
          ctx.lineTo(c + sx + 4, py);
          ctx.closePath();
          ctx.fill();
          strokeInk(ctx, 1.3);
        }
        // Layered iron plate
        ctx.fillStyle = '#535d69';
        ctx.beginPath();
        ctx.ellipse(c - 2, py, 16, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.7);
        ctx.fillStyle = '#758291';
        ctx.beginPath();
        ctx.ellipse(c + 2, py - side * 2, 11, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.3);
      }

      // Snarling tusked troll head + glowing red eyes
      ctx.fillStyle = '#528544';
      ctx.beginPath();
      ctx.ellipse(c + 11, c, 15, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Ivory boar tusks jutting forward (+X)
      for (const ty of [c - 7, c + 7]) {
        ctx.fillStyle = '#f5ecd5';
        ctx.beginPath();
        ctx.moveTo(c + 20, ty - 2.5);
        ctx.lineTo(c + 32, ty);
        ctx.lineTo(c + 20, ty + 2.5);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.3);
      }

      // Horned spiked golden crown
      ctx.fillStyle = '#f5c542';
      polygonPath(ctx, c + 7, c, 13, 6, 0);
      ctx.fill();
      strokeInk(ctx, 1.7);
      for (const cy of [c - 10, c + 10]) {
        ctx.fillStyle = '#ffe17d';
        ctx.beginPath();
        ctx.moveTo(c + 5, cy);
        ctx.lineTo(c - 4, cy + (cy < c ? -10 : 10));
        ctx.lineTo(c + 11, cy);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.3);
      }

      // Glowing red eyes
      for (const ey of [c - 5, c + 5]) {
        ctx.fillStyle = '#ff2e2e';
        ctx.beginPath();
        ctx.arc(c + 17, ey, 2.7, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'scout') {
      // Goblin Raider (96x96): dark brown leather-armored shoulders/torso, iron-studded round wooden buckler (c - 15),
      // gleaming steel-tipped spear (+X), crimson-trimmed pointed iron helmet, olive-green head, pointed goblin ears, yellow eyes
      // Spear shaft + gleaming steel tip on right arm (+X)
      drawGradBarrel(ctx, c - 8, c + 12, 82, 3.4, '#d19852', '#8a5b26', '#4a2e10', 1.3);
      ctx.fillStyle = '#e8f1fa';
      ctx.beginPath();
      ctx.moveTo(91, c + 12);
      ctx.lineTo(79, c + 7.5);
      ctx.lineTo(79, c + 16.5);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.3);

      // Dark brown leather-armored shoulders/torso
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, c - 17, c - 17, 28, 34, 9);
        ctx.fillStyle = '#472a14';
        ctx.fill();
      });
      roundedRectPath(ctx, c - 17, c - 17, 28, 34, 9);
      ctx.fillStyle = '#6b401f';
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Leather shoulder straps & brass studs
      ctx.strokeStyle = '#422510';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(c - 12, c - 15);
      ctx.lineTo(c + 5, c - 8);
      ctx.moveTo(c - 12, c + 15);
      ctx.lineTo(c + 5, c + 8);
      ctx.stroke();

      // Strapped iron-studded round wooden buckler on left arm (c - 15)
      ctx.fillStyle = '#9c632c';
      ctx.beginPath();
      ctx.arc(c + 5, c - 15, 9.5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.5);
      ctx.strokeStyle = '#8b96a3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c + 5, c - 15, 7.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#dce5f0';
      ctx.beginPath();
      ctx.arc(c + 5, c - 15, 3, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.1);

      // Two crisp pointed olive-green goblin ears sticking out the sides
      for (const side of [-1, 1] as const) {
        ctx.fillStyle = '#73b839';
        ctx.beginPath();
        ctx.moveTo(c + 1, c + side * 8);
        ctx.lineTo(c - 5, c + side * 19);
        ctx.lineTo(c + 8, c + side * 11);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.4);
      }

      // Olive-green goblin head
      ctx.fillStyle = '#6ca636';
      ctx.beginPath();
      ctx.arc(c + 5, c, 11, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.6);

      // Fierce yellow eyes
      for (const ey of [c - 4, c + 4]) {
        ctx.fillStyle = '#ffe047';
        ctx.beginPath();
        ctx.arc(c + 11, ey, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Crimson-trimmed pointed iron helmet
      ctx.fillStyle = '#7b8794';
      ctx.beginPath();
      ctx.arc(c + 3, c, 9.5, Math.PI * 0.45, Math.PI * 1.55);
      ctx.lineTo(c + 10, c);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.5);
      ctx.strokeStyle = '#c4273b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(c + 3, c, 8.5, Math.PI * 0.55, Math.PI * 1.45);
      ctx.stroke();
      return;
    }

    if (key === 'swarmer') {
      // Goblin Swarmer (96x96): tattered dark-red/brown leather hood & cloak shoulders,
      // sharp pointed lime-green goblin ears poking out from red-banded cowl, glowing golden eyes, two jagged curved steel daggers
      // Two jagged curved steel daggers thrusting forward (+X)
      for (const side of [-1, 1] as const) {
        const dy = c + side * 10;
        ctx.fillStyle = '#dce6f2';
        ctx.beginPath();
        ctx.moveTo(c + 6, dy - side * 2);
        ctx.lineTo(c + 26, dy + side * 1);
        ctx.lineTo(c + 14, dy + side * 4.5);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.3);
      }

      // Tattered dark-red/brown leather cloak shoulders
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#3d1915';
        ctx.beginPath();
        ctx.moveTo(c + 6, c - 13);
        ctx.lineTo(c - 17, c - 15);
        ctx.lineTo(c - 12, c - 4);
        ctx.lineTo(c - 19, c);
        ctx.lineTo(c - 12, c + 4);
        ctx.lineTo(c - 17, c + 15);
        ctx.lineTo(c + 6, c + 13);
        ctx.closePath();
        ctx.fill();
      });
      ctx.fillStyle = '#6e2821';
      ctx.beginPath();
      ctx.moveTo(c + 6, c - 13);
      ctx.lineTo(c - 17, c - 15);
      ctx.lineTo(c - 12, c - 4);
      ctx.lineTo(c - 19, c);
      ctx.lineTo(c - 12, c + 4);
      ctx.lineTo(c - 17, c + 15);
      ctx.lineTo(c + 6, c + 13);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.7);

      // Sharp pointed lime-green goblin ears poking out
      for (const side of [-1, 1] as const) {
        ctx.fillStyle = '#8be83c';
        ctx.beginPath();
        ctx.moveTo(c, c + side * 7);
        ctx.lineTo(c - 6, c + side * 18);
        ctx.lineTo(c + 7, c + side * 9);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.3);
      }

      // Red-banded leather cowl & lime-green face
      ctx.fillStyle = '#4a251c';
      ctx.beginPath();
      ctx.arc(c + 2, c, 10, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.6);

      ctx.strokeStyle = '#c4273b';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(c + 2, c, 8.5, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();

      // Glowing golden eyes
      for (const ey of [c - 3.5, c + 3.5]) {
        ctx.fillStyle = '#ffd836';
        ctx.beginPath();
        ctx.arc(c + 8, ey, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (key === 'cruiser') {
      // Armored Orc Brute (96x96): fluttering dark crimson war-cape, riveted steel breastplate + spiked bronze-and-iron pauldrons,
      // horned dark-steel war-helm with glowing red visor eyes & two ivory boar tusks, huge double-bladed steel battleaxe
      // Huge double-bladed steel battleaxe (+X)
      drawGradBarrel(ctx, c - 2, c + 15, 84, 5, '#b57b3c', '#734a1e', '#38220c', 1.4);
      for (const side of [-1, 1] as const) {
        ctx.fillStyle = '#b4c0cc';
        ctx.beginPath();
        ctx.arc(76, c + 15 + side * 4, 11, side === -1 ? -Math.PI * 0.7 : 0, side === -1 ? 0 : Math.PI * 0.7);
        ctx.lineTo(72, c + 15);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.5);
      }

      // Fluttering dark crimson war-cape behind (left)
      ctx.fillStyle = '#8c1720';
      ctx.beginPath();
      ctx.moveTo(c - 6, c - 18);
      ctx.lineTo(13, c - 21);
      ctx.lineTo(18, c - 6);
      ctx.lineTo(11, c);
      ctx.lineTo(18, c + 6);
      ctx.lineTo(13, c + 21);
      ctx.lineTo(c - 6, c + 18);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.6);

      // Broad riveted steel breastplate
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, c - 19, c - 22, 36, 44, 10);
        ctx.fillStyle = '#404852';
        ctx.fill();
      });
      roundedRectPath(ctx, c - 19, c - 22, 36, 44, 10);
      ctx.fillStyle = '#657280';
      ctx.fill();
      strokeInk(ctx, 1.9);

      // Breastplate rivets
      ctx.fillStyle = '#dce5f0';
      for (const [rx, ry] of [
        [c - 12, c - 14],
        [c - 12, c + 14],
        [c + 8, c - 14],
        [c + 8, c + 14],
      ]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Massive spiked bronze-and-iron pauldrons
      for (const side of [-1, 1] as const) {
        const py = c + side * 21;
        ctx.fillStyle = '#dce5f0';
        ctx.beginPath();
        ctx.moveTo(c - 3, py);
        ctx.lineTo(c, py + side * 13);
        ctx.lineTo(c + 4, py);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.2);

        ctx.fillStyle = '#b37a38';
        ctx.beginPath();
        ctx.arc(c, py, 10.5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.6);
        ctx.fillStyle = '#5f6b78';
        ctx.beginPath();
        ctx.arc(c + 1, py - side * 1, 6.5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.2);
      }

      // Two ivory boar tusks jutting forward (+X)
      for (const ty of [c - 5.5, c + 5.5]) {
        ctx.fillStyle = '#f2ebd4';
        ctx.beginPath();
        ctx.moveTo(c + 12, ty - 2);
        ctx.lineTo(c + 22, ty);
        ctx.lineTo(c + 12, ty + 2);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.2);
      }

      // Horned dark-steel war-helm & glowing red visor eyes
      ctx.fillStyle = '#3b444f';
      ctx.beginPath();
      ctx.arc(c + 5, c, 12, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.7);
      for (const side of [-1, 1] as const) {
        ctx.fillStyle = '#e8dfc5';
        ctx.beginPath();
        ctx.moveTo(c + 3, c + side * 10);
        ctx.lineTo(c - 4, c + side * 19);
        ctx.lineTo(c + 8, c + side * 11);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.2);
      }
      for (const ey of [c - 4, c + 4]) {
        ctx.fillStyle = '#ff3030';
        ctx.beginPath();
        ctx.arc(c + 12, ey, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (key === 'frigate') {
      // Orc Shaman (96x96): dark purple & gold-trimmed hooded robe with ragged mantle hem,
      // pale bone shoulder spikes, crimson hood with glowing violet eyes, gnarled staff topped with blazing magenta-cyan crystal skull
      // Gnarled staff + blazing magenta-cyan crystal skull
      drawGradBarrel(ctx, 24, c + 15, 76, 4, '#8c5a2b', '#593616', '#2e1b0a', 1.3);
      const skullGlow = ctx.createRadialGradient(78, c + 15, 1.5, 78, c + 15, 11);
      skullGlow.addColorStop(0, '#ffffff');
      skullGlow.addColorStop(0.45, '#59f2ff');
      skullGlow.addColorStop(0.8, '#ff4df0');
      skullGlow.addColorStop(1, 'rgba(255, 77, 240, 0)');
      ctx.fillStyle = skullGlow;
      ctx.beginPath();
      ctx.arc(78, c + 15, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2d9ff';
      ctx.beginPath();
      ctx.arc(78, c + 15, 5.5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);
      ctx.fillStyle = '#1cd9ff';
      ctx.fillRect(79, c + 12.5, 2, 2);
      ctx.fillRect(79, c + 15.5, 2, 2);

      // Dark purple & gold-trimmed hooded robe with ragged mantle hem
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#361245';
        ctx.beginPath();
        ctx.arc(c, c, 20, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#4f1b63';
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = i % 2 === 0 ? 22 : 18;
        const px = c - 2 + Math.cos(a) * r;
        const py = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Gold mantle trim
      ctx.strokeStyle = '#e0b038';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c - 1, c, 15, 0, Math.PI * 2);
      ctx.stroke();

      // Pale bone shoulder spikes
      for (const side of [-1, 1] as const) {
        ctx.fillStyle = '#e8dfc5';
        ctx.beginPath();
        ctx.moveTo(c - 3, c + side * 14);
        ctx.lineTo(c - 9, c + side * 26);
        ctx.lineTo(c + 4, c + side * 16);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.3);
      }

      // Crimson hood & glowing violet eyes
      ctx.fillStyle = '#b52236';
      ctx.beginPath();
      ctx.arc(c + 4, c, 10.5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.5);
      for (const ey of [c - 3.5, c + 3.5]) {
        ctx.fillStyle = '#e25cff';
        ctx.beginPath();
        ctx.arc(c + 10, ey, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // phase: FIRE-BREATHING DRAGON! (96x96, NO close ground shadow)
    // Wide scalloped leathery crimson-red bat wings (y: c +/- 40) with dark wing-bones, fiery orange inner membranes, hooked ivory wing-claws
    for (const side of [-1, 1] as const) {
      // Fiery orange-crimson inner wing membrane
      const wingGrad = ctx.createLinearGradient(c, c, c, c + side * 40);
      wingGrad.addColorStop(0, '#c41d26');
      wingGrad.addColorStop(0.55, '#ff6a14');
      wingGrad.addColorStop(1, '#8c141b');
      ctx.fillStyle = wingGrad;
      ctx.beginPath();
      ctx.moveTo(58, c + side * 6);
      ctx.lineTo(42, c + side * 41);
      ctx.quadraticCurveTo(32, c + side * 32, 24, c + side * 36);
      ctx.quadraticCurveTo(22, c + side * 23, 15, c + side * 25);
      ctx.quadraticCurveTo(22, c + side * 12, 34, c + side * 5);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.7);

      // Dark wing-bones
      ctx.strokeStyle = '#3d0c10';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(55, c + side * 6);
      ctx.lineTo(42, c + side * 40);
      ctx.moveTo(49, c + side * 18);
      ctx.lineTo(24, c + side * 35);
      ctx.moveTo(46, c + side * 14);
      ctx.lineTo(16, c + side * 24);
      ctx.stroke();

      // Hooked ivory wing-claw at leading wingtip
      ctx.fillStyle = '#f5ebd0';
      ctx.beginPath();
      ctx.moveTo(44, c + side * 38);
      ctx.lineTo(50, c + side * 44);
      ctx.lineTo(39, c + side * 41);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.2);
    }

    // Long sinuous barbed tail trailing left (x = 6..26)
    ctx.strokeStyle = INK_OUTLINE;
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(32, c);
    ctx.quadraticCurveTo(20, c - 6, 8, c + 2);
    ctx.stroke();
    ctx.strokeStyle = '#9e1920';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(32, c);
    ctx.quadraticCurveTo(20, c - 6, 8, c + 2);
    ctx.stroke();
    // Barbed tail spade
    ctx.fillStyle = '#f5c542';
    ctx.beginPath();
    ctx.moveTo(5, c + 2);
    ctx.lineTo(13, c - 3.5);
    ctx.lineTo(11, c + 2);
    ctx.lineTo(13, c + 7.5);
    ctx.closePath();
    ctx.fill();
    strokeInk(ctx, 1.2);

    // Muscular scaled crimson body
    ctx.fillStyle = '#b81f27';
    ctx.beginPath();
    ctx.ellipse(50, c, 20, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.8);

    // Golden spine ridges along back
    ctx.fillStyle = '#f5c542';
    for (const sx of [36, 44, 52, 60]) {
      ctx.beginPath();
      ctx.moveTo(sx - 3, c);
      ctx.lineTo(sx, c - 3);
      ctx.lineTo(sx + 3, c);
      ctx.lineTo(sx, c + 3);
      ctx.closePath();
      ctx.fill();
    }

    // Glowing molten-orange jaws ready to breathe fire at right (x = 70..90)
    const fireGlow = ctx.createRadialGradient(87, c, 1, 87, c, 7);
    fireGlow.addColorStop(0, '#fff5a8');
    fireGlow.addColorStop(0.55, '#ff7b14');
    fireGlow.addColorStop(1, 'rgba(255, 80, 10, 0)');
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(87, c, 7, 0, Math.PI * 2);
    ctx.fill();

    // Fierce elongated horned dragon head (x = 70..90)
    ctx.fillStyle = '#c9222b';
    ctx.beginPath();
    ctx.moveTo(90, c);
    ctx.lineTo(74, c - 7.5);
    ctx.lineTo(68, c);
    ctx.lineTo(74, c + 7.5);
    ctx.closePath();
    ctx.fill();
    strokeInk(ctx, 1.6);

    // Swept ivory horns & bright amber eyes
    for (const side of [-1, 1] as const) {
      ctx.fillStyle = '#f2e6c8';
      ctx.beginPath();
      ctx.moveTo(74, c + side * 5.5);
      ctx.lineTo(63, c + side * 12);
      ctx.lineTo(70, c + side * 4);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.2);

      ctx.fillStyle = '#ffcc29';
      ctx.beginPath();
      ctx.arc(80, c + side * 3.2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function paintMedievalKnight(): Texture {
  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;

    // Flowing horse tail aft (x = 6..18)
    ctx.strokeStyle = INK_OUTLINE;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(18, c);
    ctx.quadraticCurveTo(11, c - 3, 6, c + 1);
    ctx.stroke();
    ctx.strokeStyle = '#3d1e0d';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(18, c);
    ctx.quadraticCurveTo(11, c - 3, 6, c + 1);
    ctx.stroke();

    // Warhorse body (rich chestnut coat + royal cobalt & gold barding)
    withGroundShadow(ctx, () => {
      ctx.fillStyle = '#4a2511';
      ctx.beginPath();
      ctx.ellipse(c, c, 17, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#7a3f1d';
    ctx.beginPath();
    ctx.ellipse(c, c, 17, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.6);

    // Royal cobalt & gold caparison barding over horse flanks
    roundedRectPath(ctx, c - 13, c - 8.5, 22, 17, 5);
    ctx.fillStyle = '#1f4fb8';
    ctx.fill();
    strokeInk(ctx, 1.4);
    ctx.strokeStyle = '#f2c138';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(c - 11, c - 6.5, 18, 13);

    // Armored warhorse head & gold chamfron facing +X
    ctx.fillStyle = '#7a3f1d';
    ctx.beginPath();
    ctx.ellipse(c + 18, c, 6.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.5);
    ctx.fillStyle = '#d6e0eb';
    ctx.beginPath();
    ctx.moveTo(c + 24, c);
    ctx.lineTo(c + 16, c - 3);
    ctx.lineTo(c + 16, c + 3);
    ctx.closePath();
    ctx.fill();
    strokeInk(ctx, 1.2);

    // Long gleaming steel jousting lance couched forward along +X (right side, y = c + 10)
    drawGradBarrel(ctx, 22, c + 10, 56, 3.2, '#eef5fc', '#a8b6c7', '#4f5a66', 1.2);
    ctx.fillStyle = '#f2c138';
    ctx.beginPath();
    ctx.moveTo(31, c + 6.5);
    ctx.lineTo(36, c + 10);
    ctx.lineTo(31, c + 13.5);
    ctx.closePath();
    ctx.fill();
    strokeInk(ctx, 1.1);
    ctx.fillStyle = '#f5f9ff';
    ctx.beginPath();
    ctx.moveTo(61, c + 10);
    ctx.lineTo(54, c + 7.5);
    ctx.lineTo(54, c + 12.5);
    ctx.closePath();
    ctx.fill();
    strokeInk(ctx, 1.1);

    // Kite shield (cobalt with gold cross) on left side (y = c - 11)
    ctx.fillStyle = '#1f4fb8';
    ctx.beginPath();
    ctx.moveTo(c + 6, c - 15);
    ctx.lineTo(c - 7, c - 13);
    ctx.lineTo(c - 7, c - 8);
    ctx.lineTo(c + 6, c - 6);
    ctx.closePath();
    ctx.fill();
    strokeInk(ctx, 1.4);
    ctx.strokeStyle = '#f2c138';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(c - 5, c - 10.5);
    ctx.lineTo(c + 4, c - 10.5);
    ctx.moveTo(c - 1, c - 14);
    ctx.lineTo(c - 1, c - 7);
    ctx.stroke();

    // Knight in gleaming silver plate armor seated in saddle
    ctx.fillStyle = '#b4c2d1';
    ctx.beginPath();
    ctx.ellipse(c - 1, c, 7.5, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.6);

    // Plumed silver great-helm
    ctx.fillStyle = '#e2ebf5';
    ctx.beginPath();
    ctx.arc(c + 2, c, 5.5, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.5);

    // Cobalt & gold helmet plume trailing aft
    ctx.fillStyle = '#2358c9';
    ctx.beginPath();
    ctx.ellipse(c - 4, c, 4.5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.1);
    ctx.fillStyle = '#f2c138';
    ctx.beginPath();
    ctx.arc(c + 1, c, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function paintMedievalBoost(): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    ctx.fillStyle = '#d4d0c5';
    ctx.beginPath();
    ctx.arc(c, c, 34, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.8);

    ctx.strokeStyle = '#1fe3c8';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(c, c, 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#f2c138';
    ctx.lineWidth = 2;
    polygonPath(ctx, c, c, 19, 6, 0);
    ctx.stroke();
  });
}

function paintMedievalObstacle(variant: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const rand = mulberry32(5300 + variant * 113);

    // Mossy grey boulder + rich dark-emerald pine tree cluster
    withGroundShadow(ctx, () => {
      ctx.fillStyle = '#1b381e';
      ctx.beginPath();
      ctx.arc(c, c, 32, 0, Math.PI * 2);
      ctx.fill();
    });

    const trees = [
      { x: c - 10, y: c - 8, r: 20, col: '#1f5425' },
      { x: c + 12, y: c + 6, r: 19, col: '#26662d' },
      { x: c - 2, y: c + 10, r: 17, col: '#2f7a38' },
    ];
    for (const t of trees) {
      ctx.fillStyle = t.col;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rad = t.r * (0.78 + rand() * 0.35);
        const px = t.x + Math.cos(a) * rad;
        const py = t.y + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.7);
    }
  });
}

function paintMedievalCrater(): Texture {
  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 2, c, c, 27);
    grad.addColorStop(0, 'rgba(20, 18, 16, 0.92)');
    grad.addColorStop(0.55, 'rgba(48, 44, 38, 0.65)');
    grad.addColorStop(1, 'rgba(48, 44, 38, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 27, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ============================================================================
// SHARED KITCHEN & LAWN HELPERS
// ============================================================================

function paintMinimalCornerObstacle(color: string, alpha: number): Texture {
  return paintCanvas(96, (ctx, size) => {
    const pad = 10;
    const arm = 12;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const corners: [number, number, number, number][] = [
      [pad, pad, 1, 1],
      [size - pad, pad, -1, 1],
      [pad, size - pad, 1, -1],
      [size - pad, size - pad, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function paintTransparentHaloRing(
  innerColor: string,
  midColor: string,
  outerColor: string,
  ringStroke: string,
): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const glow = ctx.createRadialGradient(c, c, 18, c, c, 44);
    glow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    glow.addColorStop(0.45, innerColor);
    glow.addColorStop(0.72, midColor);
    glow.addColorStop(1, outerColor);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c, c, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ringStroke;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(c, c, 32, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(c, c, 37, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function paintCoreBracketMarker(
  bracketColor: string,
  glowColor: string,
  accentColor: string,
): Texture {
  return paintCanvas(128, (ctx, size) => {
    const c = size / 2;
    // Soft perimeter glow so the painted map base shines through the center
    const halo = ctx.createRadialGradient(c, c, 30, c, c, 60);
    halo.addColorStop(0, 'rgba(0, 0, 0, 0)');
    halo.addColorStop(0.65, glowColor);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c, c, 60, 0, Math.PI * 2);
    ctx.fill();

    const pad = 12;
    const arm = 22;
    const corners: [number, number, number, number][] = [
      [pad, pad, 1, 1],
      [size - pad, pad, -1, 1],
      [pad, size - pad, 1, -1],
      [size - pad, size - pad, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.save();
      ctx.shadowColor = bracketColor;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();

      ctx.strokeStyle = bracketColor;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(x + dx * 4, y + dy * 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawAntSprite(
  ctx: CanvasRenderingContext2D,
  c: number,
  scale: number,
  bodyLight: string,
  bodyDark: string,
  legColor: string,
): void {
  // 6 crisp legs
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = 3.2 * scale;
  ctx.lineCap = 'round';
  const legPairs = [-4, 1, 6];
  for (const lx of legPairs) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c + lx * scale, c);
      ctx.lineTo(c + (lx - 3) * scale, c + side * 12 * scale);
      ctx.lineTo(c + (lx + 2) * scale, c + side * 17 * scale);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = legColor;
  ctx.lineWidth = 1.5 * scale;
  for (const lx of legPairs) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c + lx * scale, c);
      ctx.lineTo(c + (lx - 3) * scale, c + side * 12 * scale);
      ctx.lineTo(c + (lx + 2) * scale, c + side * 17 * scale);
      ctx.stroke();
    }
  }

  // Abdomen, thorax, head facing +X
  const drawSeg = (ox: number, oy: number, rx: number, ry: number) => {
    const grad = ctx.createRadialGradient(
      c + ox - rx * 0.25,
      c + oy - ry * 0.25,
      1,
      c + ox,
      c + oy,
      Math.max(rx, ry),
    );
    grad.addColorStop(0, bodyLight);
    grad.addColorStop(1, bodyDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(c + ox, c + oy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.8);
  };

  withGroundShadow(ctx, () => {
    drawSeg(-11 * scale, 0, 9.5 * scale, 7 * scale);
    drawSeg(1 * scale, 0, 5.5 * scale, 4.5 * scale);
    drawSeg(11 * scale, 0, 6 * scale, 5.2 * scale);
  });

  // Antennae
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = 1.7 * scale;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(c + 16 * scale, c + side * 2 * scale);
    ctx.quadraticCurveTo(
      c + 22 * scale,
      c + side * 7 * scale,
      c + 25 * scale,
      c + side * 11 * scale,
    );
    ctx.stroke();
  }
}

// ============================================================================
// 4. KITCHEN THEATER (COUNTERTOP — BUGS & RODENTS)
// ============================================================================

function paintKitchenCoreBase(): Texture {
  return paintCoreBracketMarker('#6ef3ff', 'rgba(110, 243, 255, 0.24)', '#e2feff');
}

function paintKitchenBase(key: TurretKey): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'swarm') {
      // Sleek dark-slate charging dock home pad with metallic contacts & cyan floor guide arrows (+X)
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, c - 31, c - 31, 62, 62, 14);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      });

      const padGrad = ctx.createRadialGradient(c - 8, c - 8, 4, c, c, 36);
      padGrad.addColorStop(0, '#334155');
      padGrad.addColorStop(0.65, '#1e293b');
      padGrad.addColorStop(1, '#0f172a');
      roundedRectPath(ctx, c - 31, c - 31, 62, 62, 14);
      ctx.fillStyle = padGrad;
      ctx.fill();
      strokeInk(ctx, 1.9);

      // Subtle inner deck border
      roundedRectPath(ctx, c - 24, c - 24, 48, 48, 10);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Metallic charging contact strips on rear (-X) side
      for (const oy of [-11, 11]) {
        roundedRectPath(ctx, c - 20, c + oy - 3.5, 10, 7, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      // Subtle cyan floor guide arrows pointing right (+X)
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const ox of [2, 12]) {
        ctx.beginPath();
        ctx.moveTo(c + ox - 4, c - 7);
        ctx.lineTo(c + ox + 4, c);
        ctx.lineTo(c + ox - 4, c + 7);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    const palette: Record<TurretKey, [string, string, string]> = {
      pulse: ['#ffffff', '#c7e8f5', '#00bcd4'],
      plasma: ['#7a4d2b', '#472a15', '#ff5722'],
      stasis: ['#fff0b3', '#e09f1f', '#ffb300'],
      railgun: ['#525860', '#2b2f36', '#cfd8dc'],
      swarm: ['#334155', '#0f172a', '#38bdf8'],
    };
    const [light, dark, accent] = palette[key];

    withGroundShadow(ctx, () => {
      roundedRectPath(ctx, c - 31, c - 31, 62, 62, 14);
      ctx.fillStyle = dark;
      ctx.fill();
    });

    const grad = ctx.createRadialGradient(c - 8, c - 8, 4, c, c, 34);
    grad.addColorStop(0, light);
    grad.addColorStop(1, dark);
    roundedRectPath(ctx, c - 31, c - 31, 62, 62, 14);
    ctx.fillStyle = grad;
    ctx.fill();
    strokeInk(ctx, 1.9);

    roundedRectPath(ctx, c - 24, c - 24, 48, 48, 10);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  });
}

function paintKitchenTurret(key: TurretKey, tier: 0 | 1 | 2): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'pulse') {
      // Fly Swatter: cyan/blue mesh paddle on handle; T1 twin paddles; T2 electric bug-zapper grid
      const drawPaddle = (oy: number, electric: boolean) => {
        ctx.save();
        ctx.translate(c, c + oy);
        // Handle
        drawGradBarrel(ctx, -20, 0, 4, 6, '#90a4ae', '#546e7a', '#263238', 1.6);
        // Mesh head
        roundedRectPath(ctx, 2, -14, 28, 28, 6);
        ctx.fillStyle = electric ? '#80f5ff' : '#29b6f6';
        ctx.fill();
        strokeInk(ctx, 1.8);
        // Grid lines
        ctx.strokeStyle = electric ? '#ffffff' : '#01579b';
        ctx.lineWidth = 1.2;
        for (let gx = 8; gx <= 24; gx += 6) {
          ctx.beginPath();
          ctx.moveTo(gx, -12);
          ctx.lineTo(gx, 12);
          ctx.stroke();
        }
        for (let gy = -8; gy <= 8; gy += 6) {
          ctx.beginPath();
          ctx.moveTo(4, gy);
          ctx.lineTo(28, gy);
          ctx.stroke();
        }
        if (electric) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(6, -6);
          ctx.lineTo(14, 2);
          ctx.lineTo(20, -4);
          ctx.lineTo(26, 6);
          ctx.stroke();
        }
        ctx.restore();
      };

      withGroundShadow(ctx, () => {
        if (tier === 0) {
          drawPaddle(0, false);
        } else if (tier === 1) {
          drawPaddle(-11, false);
          drawPaddle(11, false);
        } else {
          drawPaddle(-11, true);
          drawPaddle(11, true);
        }
      });
      // Center pivot cap
      ctx.fillStyle = tier === 2 ? '#00e5ff' : '#cfd8dc';
      ctx.beginPath();
      ctx.arc(c - 12, c, 9, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.8);
      return;
    }

    if (key === 'plasma') {
      // Pepper Mill: walnut & brass grinder; T1 red cayenne ring; T2 blazing chili mortar
      withGroundShadow(ctx, () => {
        drawGradBarrel(ctx, c, c, c + 30, tier === 2 ? 16 : 12, '#ffe082', '#d4a017', '#795548', 1.7);
      });
      if (tier >= 1) {
        ctx.strokeStyle = tier === 2 ? '#ff3d00' : '#d84315';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(c, c, 21, 0, Math.PI * 2);
        ctx.stroke();
      }
      const grad = ctx.createRadialGradient(c - 5, c - 5, 3, c, c, 18);
      grad.addColorStop(0, tier === 2 ? '#ff8a65' : '#8d6e63');
      grad.addColorStop(1, tier === 2 ? '#bf360c' : '#3e2723');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c, c, 18, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.9);

      // Brass crank top
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(c, c, 7, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.5);
      if (tier === 2) {
        ctx.fillStyle = '#fff59d';
        ctx.beginPath();
        ctx.arc(c + 26, c, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (key === 'stasis') {
      // Honey Trap: golden amber honey jar/puddle; T1 maple syrup ring; T2 glossy emerald-gold super-glue coil
      withGroundShadow(ctx, () => {
        ctx.fillStyle = tier === 2 ? '#26a69a' : '#ffb300';
        ctx.beginPath();
        ctx.arc(c, c, 24, 0, Math.PI * 2);
        ctx.fill();
      });
      const grad = ctx.createRadialGradient(c - 6, c - 6, 3, c, c, 24);
      if (tier === 2) {
        grad.addColorStop(0, '#ffe082');
        grad.addColorStop(0.55, '#00bfa5');
        grad.addColorStop(1, '#00695c');
      } else {
        grad.addColorStop(0, '#fff59d');
        grad.addColorStop(0.55, '#ffb300');
        grad.addColorStop(1, tier === 1 ? '#bf360c' : '#e65100');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c, c, 23, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Dripping nozzle & glossy highlight
      drawGradBarrel(ctx, c + 8, c, c + 30, 8, '#ffe082', '#ffb300', '#e65100', 1.5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.ellipse(c - 7, c - 8, 6, 3.2, -0.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (key === 'railgun') {
      // Chef's Knife: brushed steel blade; T1 twin cleavers; T2 glowing violet-steel laser slicer
      const drawBlade = (oy: number, width: number, violet: boolean) => {
        ctx.save();
        ctx.translate(c, c + oy);
        const grad = ctx.createLinearGradient(0, -width, 0, width);
        grad.addColorStop(0, violet ? '#e1bee7' : '#ffffff');
        grad.addColorStop(0.5, violet ? '#ab47bc' : '#b0bec5');
        grad.addColorStop(1, violet ? '#4a148c' : '#546e7a');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-10, -width);
        ctx.lineTo(28, -width * 0.6);
        ctx.lineTo(36, 0);
        ctx.lineTo(28, width * 0.6);
        ctx.lineTo(-10, width);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.8);
        ctx.restore();
      };

      withGroundShadow(ctx, () => {
        if (tier === 0) {
          drawBlade(0, 9, false);
        } else if (tier === 1) {
          drawBlade(-9, 7, false);
          drawBlade(9, 7, false);
        } else {
          drawBlade(-9, 7.5, true);
          drawBlade(9, 7.5, true);
        }
      });

      // Dark knife handle bolster
      roundedRectPath(ctx, c - 22, c - 11, 18, 22, 5);
      ctx.fillStyle = '#212121';
      ctx.fill();
      strokeInk(ctx, 1.8);
      return;
    }

    // swarm: Roomba / Robot Vacuum Charging Dock (T0: Lv1 Dock, T1: Lv2 Turbo Dock, T2: Lv3 Robotic Fleet)
    if (tier === 0) {
      // T0: Sleek matte-black & brushed-steel home base dock + glowing cyan power bar + docked mini vacuum silhouette
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, c - 24, c - 20, 26, 40, 6);
        ctx.fillStyle = '#111827';
        ctx.fill();
      });

      const steelGrad = ctx.createLinearGradient(c - 24, c - 20, c + 2, c + 20);
      steelGrad.addColorStop(0, '#4b5563');
      steelGrad.addColorStop(0.5, '#1f2937');
      steelGrad.addColorStop(1, '#111827');
      roundedRectPath(ctx, c - 24, c - 20, 26, 40, 6);
      ctx.fillStyle = steelGrad;
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Brushed-steel top plate
      roundedRectPath(ctx, c - 20, c - 15, 16, 30, 4);
      ctx.fillStyle = '#374151';
      ctx.fill();
      strokeInk(ctx, 1.2);

      // Glowing cyan power bar
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 7;
      roundedRectPath(ctx, c - 16, c - 10, 4, 20, 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.restore();

      // Docked mini vacuum silhouette on front (+X) pad
      withGroundShadow(ctx, () => {
        ctx.beginPath();
        ctx.arc(c + 9, c, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#18181b';
        ctx.fill();
      });
      const miniGrad = ctx.createRadialGradient(c + 7, c - 3, 2, c + 9, c, 12);
      miniGrad.addColorStop(0, '#3f3f46');
      miniGrad.addColorStop(1, '#18181b');
      ctx.beginPath();
      ctx.arc(c + 9, c, 12, 0, Math.PI * 2);
      ctx.fillStyle = miniGrad;
      ctx.fill();
      strokeInk(ctx, 1.6);

      ctx.beginPath();
      ctx.arc(c + 9, c, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c + 9, c, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#34d399';
      ctx.fill();
      return;
    }

    if (tier === 1) {
      // T1: Wider brushed-chrome turbo dock with twin glowing cyan/mint charge LEDs and brass accent vents
      withGroundShadow(ctx, () => {
        roundedRectPath(ctx, c - 26, c - 26, 36, 52, 8);
        ctx.fillStyle = '#1f2937';
        ctx.fill();
      });

      const chromeGrad = ctx.createLinearGradient(c - 26, c - 26, c + 10, c + 26);
      chromeGrad.addColorStop(0, '#cbd5e1');
      chromeGrad.addColorStop(0.45, '#64748b');
      chromeGrad.addColorStop(1, '#334155');
      roundedRectPath(ctx, c - 26, c - 26, 36, 52, 8);
      ctx.fillStyle = chromeGrad;
      ctx.fill();
      strokeInk(ctx, 1.85);

      // Dark matte turbo core housing
      roundedRectPath(ctx, c - 21, c - 20, 26, 40, 5);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      strokeInk(ctx, 1.4);

      // Brass accent vents along left edge
      for (const oy of [-13, -5, 5, 13]) {
        roundedRectPath(ctx, c - 18, c + oy - 2, 7, 4, 1.2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // Twin glowing cyan/mint charge LEDs + bay pads
      for (const [idx, oy] of [
        [0, -11],
        [1, 11],
      ] as const) {
        const ledColor = idx === 0 ? '#38bdf8' : '#34d399';
        ctx.save();
        ctx.shadowColor = ledColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(c - 3, c + oy, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = ledColor;
        ctx.fill();
        ctx.restore();
        strokeInk(ctx, 1.2);

        // Front charging contact prongs
        roundedRectPath(ctx, c + 9, c + oy - 4, 8, 8, 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fill();
        strokeInk(ctx, 1.2);
      }
      return;
    }

    // T2: High-tech chrome-and-gold triple-bay command dock with vivid glowing emerald/cyan charge rings and antenna beacon
    withGroundShadow(ctx, () => {
      roundedRectPath(ctx, c - 28, c - 29, 44, 58, 9);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
    });

    const fleetGrad = ctx.createLinearGradient(c - 28, c - 29, c + 16, c + 29);
    fleetGrad.addColorStop(0, '#e2e8f0');
    fleetGrad.addColorStop(0.5, '#64748b');
    fleetGrad.addColorStop(1, '#1e293b');
    roundedRectPath(ctx, c - 28, c - 29, 44, 58, 9);
    ctx.fillStyle = fleetGrad;
    ctx.fill();
    strokeInk(ctx, 1.9);

    // Gold command trim rails
    for (const oy of [-25, 20]) {
      roundedRectPath(ctx, c - 24, c + oy, 36, 5, 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    // Dark recessed command deck
    roundedRectPath(ctx, c - 23, c - 17, 34, 34, 5);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    strokeInk(ctx, 1.3);

    // Triple glowing emerald/cyan charge rings
    const ringOffsets = [
      { ox: 6, oy: -12, color: '#38bdf8' },
      { ox: 10, oy: 0, color: '#34d399' },
      { ox: 6, oy: 12, color: '#38bdf8' },
    ];
    for (const ring of ringOffsets) {
      ctx.save();
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(c + ring.ox, c + ring.oy, 5.2, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2.3;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(c + ring.ox, c + ring.oy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();
    }

    // Antenna beacon on rear-left corner
    ctx.beginPath();
    ctx.moveTo(c - 16, c);
    ctx.lineTo(c - 26, c - 10);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(c - 26, c - 10, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#34d399';
    ctx.fill();
    ctx.restore();
    strokeInk(ctx, 1.3);
  });
}

function paintKitchenEnemy(key: EnemyKey): Texture {
  if (key === 'dreadnought') {
    // King Rat (128x128): imposing armored giant rat boss with golden crown & cheese-wedge shoulder plates
    return paintCanvas(128, (ctx, size) => {
      const c = size / 2;
      withGroundShadow(ctx, () => {
        // Long pink tail
        ctx.strokeStyle = '#f48fb1';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(c - 26, c);
        ctx.quadraticCurveTo(c - 48, c - 18, c - 56, c + 10);
        ctx.stroke();
        strokeInk(ctx, 2);

        // Giant rat body
        const grad = ctx.createRadialGradient(c - 6, c - 8, 6, c, c, 36);
        grad.addColorStop(0, '#90a4ae');
        grad.addColorStop(1, '#37474f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(c, c, 34, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 2.2);
      });

      // Cheese-wedge shoulder plates
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.moveTo(c - 8, c + side * 14);
        ctx.lineTo(c + 16, c + side * 26);
        ctx.lineTo(c - 14, c + side * 32);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.8);
        ctx.fillStyle = '#f57f17';
        ctx.beginPath();
        ctx.arc(c - 4, c + side * 24, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Snout & pink nose
      ctx.fillStyle = '#78909c';
      ctx.beginPath();
      ctx.ellipse(c + 28, c, 15, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 2);
      ctx.fillStyle = '#ff80ab';
      ctx.beginPath();
      ctx.arc(c + 41, c, 5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.5);

      // Golden crown
      ctx.fillStyle = '#ffca28';
      ctx.beginPath();
      ctx.moveTo(c + 4, c - 10);
      ctx.lineTo(c + 8, c - 20);
      ctx.lineTo(c + 14, c - 13);
      ctx.lineTo(c + 19, c - 22);
      ctx.lineTo(c + 23, c - 11);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.8);
    });
  }

  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;

    if (key === 'scout') {
      // Kitchen Ant: dark mahogany-red 3-segment ant
      drawAntSprite(ctx, c, 1.0, '#c62828', '#5d0f0f', '#8e1c1c');
      return;
    }

    if (key === 'swarmer') {
      // Sugar Ant: smaller amber-brown scurrying ant
      drawAntSprite(ctx, c, 0.78, '#ffb300', '#8d4e00', '#b26a00');
      return;
    }

    if (key === 'cruiser') {
      // Armored Roach: glossy dark-brown/burgundy oval armored cockroach
      withGroundShadow(ctx, () => {
        const grad = ctx.createRadialGradient(c - 4, c - 4, 3, c, c, 22);
        grad.addColorStop(0, '#8d3b3b');
        grad.addColorStop(1, '#2b0f0f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(c, c, 21, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.9);
      });
      // Segmented carapace & glossy streak
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 1.4;
      for (const sx of [-6, 2, 10]) {
        ctx.beginPath();
        ctx.moveTo(c + sx, c - 11);
        ctx.lineTo(c + sx, c + 11);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 220, 210, 0.5)';
      ctx.beginPath();
      ctx.ellipse(c - 3, c - 5, 10, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Long antennae
      for (const side of [-1, 1]) {
        ctx.strokeStyle = INK_OUTLINE;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(c + 19, c + side * 3);
        ctx.quadraticCurveTo(c + 26, c + side * 12, c + 14, c + side * 22);
        ctx.stroke();
      }
      return;
    }

    if (key === 'frigate') {
      // Pantry Rat: chunky slate-grey rodent with pink ears/tail & pale-blue grease sheen
      withGroundShadow(ctx, () => {
        ctx.strokeStyle = '#f48fb1';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(c - 16, c);
        ctx.quadraticCurveTo(c - 26, c - 8, c - 28, c + 6);
        ctx.stroke();

        const grad = ctx.createRadialGradient(c - 3, c - 4, 2, c, c, 19);
        grad.addColorStop(0, '#b0bec5');
        grad.addColorStop(0.6, '#607d8b');
        grad.addColorStop(1, '#37474f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(c + 1, c, 18, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.9);
      });
      // Pink ears & nose
      ctx.fillStyle = '#f48fb1';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(c + 7, c + side * 9, 4.5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.4);
      }
      ctx.fillStyle = '#ff80ab';
      ctx.beginPath();
      ctx.arc(c + 19, c, 3, 0, Math.PI * 2);
      ctx.fill();
      // Pale-blue grease sheen
      ctx.fillStyle = 'rgba(179, 229, 252, 0.55)';
      ctx.beginPath();
      ctx.ellipse(c - 2, c - 4, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // phase: Fruit Fly (magenta-eyed buzzing fly with wide translucent shimmering wings)
    withGroundShadow(ctx, () => {
      ctx.fillStyle = '#3e2723';
      ctx.beginPath();
      ctx.ellipse(c, c, 11, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.7);
    });
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(178, 255, 255, 0.62)';
      ctx.beginPath();
      ctx.ellipse(c - 3, c + side * 12, 13, 6.5, side * -0.45, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);
      // Bright magenta eyes
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(c + 9, c + side * 3.5, 3, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.2);
    }
  });
}

function paintKitchenBoost(): Texture {
  return paintTransparentHaloRing(
    'rgba(255, 90, 31, 0.72)',
    'rgba(255, 179, 71, 0.58)',
    'rgba(255, 90, 31, 0)',
    '#ff6d00',
  );
}

function paintKitchenRoomba(): Texture {
  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;

    // Soft ground shadow under disc
    withGroundShadow(ctx, () => {
      ctx.beginPath();
      ctx.arc(c, c, 21, 0, Math.PI * 2);
      ctx.fillStyle = '#181c22';
      ctx.fill();
    }, 5, -2, 2.5, 0.55);

    // Two tiny spinning 3-spoke yellow/cyan side sweeper brushes near front-left and front-right edges
    for (const [idx, sy] of [
      [0, -17],
      [1, 17],
    ] as const) {
      const bx = c + 12;
      const by = c + sy;
      ctx.save();
      for (let s = 0; s < 3; s++) {
        const ang = (s * Math.PI * 2) / 3 + (idx === 0 ? 0.35 : -0.35);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(ang) * 7.5, by + Math.sin(ang) * 7.5);
        ctx.strokeStyle = s % 2 === 0 ? '#fde047' : '#38bdf8';
        ctx.lineWidth = 2.0;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#475569';
      ctx.fill();
      strokeInk(ctx, 1.0);
      ctx.restore();
    }

    // Sleek round matte charcoal-gunmetal disc chassis
    const bodyGrad = ctx.createRadialGradient(c - 5, c - 5, 3, c, c, 22);
    bodyGrad.addColorStop(0, '#4b5563');
    bodyGrad.addColorStop(0.55, '#272c35');
    bodyGrad.addColorStop(1, '#15181e');
    ctx.beginPath();
    ctx.arc(c, c, 21, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    strokeInk(ctx, 1.8);

    // Rear dustbin seam arc (-X side)
    ctx.beginPath();
    ctx.arc(c, c, 16.5, Math.PI * 0.62, Math.PI * 1.38);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Curved glossy dark front bumper arc along +X edge
    ctx.beginPath();
    ctx.arc(c, c, 19.2, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.strokeStyle = '#0b0e14';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Specular bumper highlight
    ctx.beginPath();
    ctx.arc(c, c, 19.6, -Math.PI * 0.28, Math.PI * 0.28);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Tiny infrared sensor window at front-most +X nose
    roundedRectPath(ctx, c + 16, c - 3, 4.5, 6, 1.5);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    strokeInk(ctx, 1.0);

    // Glowing bright cyan-emerald circular LED ring
    ctx.save();
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 8;
    const ledGrad = ctx.createLinearGradient(c - 11, c - 11, c + 11, c + 11);
    ledGrad.addColorStop(0, '#38bdf8');
    ledGrad.addColorStop(1, '#34d399');
    ctx.beginPath();
    ctx.arc(c, c, 10.5, 0, Math.PI * 2);
    ctx.strokeStyle = ledGrad;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();

    // Clean center power button
    ctx.beginPath();
    ctx.arc(c, c, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    strokeInk(ctx, 1.2);

    ctx.beginPath();
    ctx.arc(c, c, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#34d399';
    ctx.fill();
  });
}

function paintKitchenObstacle(_variant: number): Texture {
  return paintMinimalCornerObstacle('#5d4037', 0.24);
}

function paintKitchenCrater(): Texture {
  return paintCanvas(48, (ctx, size) => {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 2, c, c, 20);
    grad.addColorStop(0, 'rgba(62, 30, 18, 0.85)');
    grad.addColorStop(0.55, 'rgba(141, 64, 24, 0.52)');
    grad.addColorStop(1, 'rgba(141, 64, 24, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 20, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ============================================================================
// 5. LAWN THEATER (BACKYARD GRASS — GARDEN PESTS)
// ============================================================================

function paintLawnCoreBase(): Texture {
  return paintCoreBracketMarker('#ffca28', 'rgba(255, 193, 7, 0.25)', '#fff8e1');
}

function paintLawnBase(key: TurretKey): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;
    const palette: Record<TurretKey, [string, string, string]> = {
      pulse: ['#b0bec5', '#37474f', '#00e5ff'],
      plasma: ['#e57373', '#8d3b2b', '#ff1744'],
      stasis: ['#ffe082', '#8c6d1f', '#40c4ff'],
      railgun: ['#eceff1', '#607d8b', '#76ff03'],
      swarm: ['#fff176', '#00796b', '#ffeb3b'],
    };
    const [light, dark, accent] = palette[key];

    withGroundShadow(ctx, () => {
      polygonPath(ctx, c, c, 32, 8, Math.PI / 8);
      ctx.fillStyle = dark;
      ctx.fill();
    });

    const grad = ctx.createRadialGradient(c - 7, c - 7, 4, c, c, 32);
    grad.addColorStop(0, light);
    grad.addColorStop(1, dark);
    polygonPath(ctx, c, c, 32, 8, Math.PI / 8);
    ctx.fillStyle = grad;
    ctx.fill();
    strokeInk(ctx, 1.9);

    polygonPath(ctx, c, c, 24, 8, Math.PI / 8);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  });
}

function paintLawnTurret(key: TurretKey, tier: 0 | 1 | 2): Texture {
  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'pulse') {
      // Bug Zapper: glowing cyan/white UV lantern cage; T1 twin cages; T2 Tesla UV coil
      const drawCage = (ox: number, oy: number, r: number) => {
        ctx.fillStyle = '#e0f7fa';
        ctx.beginPath();
        ctx.arc(c + ox, c + oy, r, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.7);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(c + ox, c + oy, r * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      };
      withGroundShadow(ctx, () => {
        if (tier === 0) {
          drawCage(0, 0, 17);
        } else if (tier === 1) {
          drawCage(-4, -10, 12);
          drawCage(-4, 10, 12);
        } else {
          drawCage(0, 0, 20);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(c + Math.cos(a) * 10, c + Math.sin(a) * 10);
            ctx.lineTo(c + Math.cos(a) * 26, c + Math.sin(a) * 26);
            ctx.stroke();
          }
        }
      });
      return;
    }

    if (key === 'plasma') {
      // Garden Gnome: bright scarlet pointed hat + white beard + mortar pot; T1 gold trim; T2 firecracker gnome
      withGroundShadow(ctx, () => {
        // White beard
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(c + 4, c, 15, -Math.PI * 0.65, Math.PI * 0.65);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.7);

        // Scarlet pointed hat pointing +X
        ctx.fillStyle = '#e53935';
        ctx.beginPath();
        ctx.moveTo(c - 18, c - 14);
        ctx.lineTo(c + 24, c);
        ctx.lineTo(c - 18, c + 14);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.9);
      });
      if (tier >= 1) {
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c - 14, c - 12);
        ctx.lineTo(c - 14, c + 12);
        ctx.stroke();
      }
      if (tier === 2) {
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(c + 24, c, 5, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.4);
      }
      return;
    }

    if (key === 'stasis') {
      // Lawn Thumper: brass & sky-blue spinning sprinkler / seismic thumper
      const arms = tier === 0 ? 2 : tier === 1 ? 3 : 4;
      withGroundShadow(ctx, () => {
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * Math.PI * 2;
          ctx.save();
          ctx.translate(c, c);
          ctx.rotate(a);
          drawGradBarrel(ctx, 4, 0, 28, 6, '#81d4fa', '#0288d1', '#01579b', 1.5);
          ctx.restore();
        }
      });
      if (tier === 2) {
        ctx.strokeStyle = '#40c4ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c, c, 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(c, c, 12, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.85);
      return;
    }

    if (key === 'railgun') {
      // Mole Crusher: silver-steel garden spade / mower blade; T1 double spades; T2 chrome mower-rail
      const drawSpade = (oy: number, w: number) => {
        ctx.save();
        ctx.translate(c, c + oy);
        const grad = ctx.createLinearGradient(0, -w, 0, w);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#b0bec5');
        grad.addColorStop(1, '#455a64');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-12, -w);
        ctx.lineTo(24, -w * 0.8);
        ctx.lineTo(34, 0);
        ctx.lineTo(24, w * 0.8);
        ctx.lineTo(-12, w);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.8);
        ctx.restore();
      };
      withGroundShadow(ctx, () => {
        if (tier === 0) {
          drawSpade(0, 10);
        } else {
          drawSpade(-9, 7);
          drawSpade(9, 7);
        }
      });
      ctx.fillStyle = tier === 2 ? '#76ff03' : '#37474f';
      ctx.beginPath();
      ctx.arc(c - 10, c, 10, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.8);
      return;
    }

    // swarm: Hose Turret (yellow & teal hose reel with brass spray nozzle)
    const nozzles = tier === 0 ? [0] : tier === 1 ? [-8, 8] : [-13, -4, 4, 13];
    withGroundShadow(ctx, () => {
      for (const oy of nozzles) {
        drawGradBarrel(ctx, c + 4, c + oy, c + 30, 5.5, '#ffe082', '#ffb300', '#8c6d1f', 1.5);
      }
    });
    ctx.fillStyle = '#00897b';
    ctx.beginPath();
    ctx.arc(c - 2, c, 17, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.85);
    ctx.strokeStyle = '#ffee58';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c - 2, c, 10, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function paintLawnEnemy(key: EnemyKey): Texture {
  if (key === 'dreadnought') {
    // Millipede Queen (128x128): massive multi-segmented crimson/violet boss with bright orange legs & mandibles
    return paintCanvas(128, (ctx, size) => {
      const c = size / 2;
      // Bright orange legs along both sides
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let sx = -36; sx <= 28; sx += 12) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(c + sx, c + side * 12);
          ctx.lineTo(c + sx - 4, c + side * 32);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = '#ff9100';
      ctx.lineWidth = 2.6;
      for (let sx = -36; sx <= 28; sx += 12) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(c + sx, c + side * 12);
          ctx.lineTo(c + sx - 4, c + side * 32);
          ctx.stroke();
        }
      }

      withGroundShadow(ctx, () => {
        for (let i = 0; i < 6; i++) {
          const sx = -34 + i * 13;
          const r = i === 5 ? 16 : 15 - Math.abs(i - 2.5) * 1.2;
          const grad = ctx.createRadialGradient(c + sx - 3, c - 4, 2, c + sx, c, r);
          grad.addColorStop(0, i % 2 === 0 ? '#ff5252' : '#ce93d8');
          grad.addColorStop(1, i % 2 === 0 ? '#880e4f' : '#4a148c');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(c + sx, c, r, 0, Math.PI * 2);
          ctx.fill();
          strokeInk(ctx, 2);
        }
      });

      // Mandibles
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#ff9100';
        ctx.beginPath();
        ctx.moveTo(c + 38, c + side * 6);
        ctx.lineTo(c + 52, c + side * 12);
        ctx.lineTo(c + 44, c + side * 2);
        ctx.closePath();
        ctx.fill();
        strokeInk(ctx, 1.6);
      }
    });
  }

  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;

    if (key === 'scout') {
      // Fire Ant: bright fiery red-orange ant
      drawAntSprite(ctx, c, 1.0, '#ff7043', '#bf360c', '#ff5722');
      return;
    }

    if (key === 'swarmer') {
      // Garden Beetle: shiny metallic amber-copper round beetle
      withGroundShadow(ctx, () => {
        const grad = ctx.createRadialGradient(c - 4, c - 4, 2, c, c, 15);
        grad.addColorStop(0, '#ffe082');
        grad.addColorStop(0.55, '#d87a16');
        grad.addColorStop(1, '#5d2b06');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c, c, 14, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.9);
      });
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c - 13, c);
      ctx.lineTo(c + 13, c);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.ellipse(c - 3, c - 5, 5, 2.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (key === 'cruiser') {
      // Giant Centipede: vivid orange-crimson segmented centipede with bright yellow legs
      ctx.strokeStyle = INK_OUTLINE;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      for (let sx = -16; sx <= 14; sx += 8) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(c + sx, c + side * 6);
          ctx.lineTo(c + sx - 2, c + side * 16);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 1.5;
      for (let sx = -16; sx <= 14; sx += 8) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(c + sx, c + side * 6);
          ctx.lineTo(c + sx - 2, c + side * 16);
          ctx.stroke();
        }
      }
      withGroundShadow(ctx, () => {
        for (let i = 0; i < 5; i++) {
          const sx = -16 + i * 8;
          ctx.fillStyle = i % 2 === 0 ? '#ff5722' : '#d50000';
          ctx.beginPath();
          ctx.arc(c + sx, c, 7.5, 0, Math.PI * 2);
          ctx.fill();
          strokeInk(ctx, 1.7);
        }
      });
      // Curved antennae
      for (const side of [-1, 1]) {
        ctx.strokeStyle = INK_OUTLINE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(c + 20, c + side * 3);
        ctx.quadraticCurveTo(c + 26, c + side * 9, c + 24, c + side * 13);
        ctx.stroke();
      }
      return;
    }

    if (key === 'frigate') {
      // Burrowing Mole: dark-brown fuzzy mole with unmistakable bright pink star-nose & big digging claws
      withGroundShadow(ctx, () => {
        const grad = ctx.createRadialGradient(c - 4, c - 4, 3, c, c, 19);
        grad.addColorStop(0, '#795548');
        grad.addColorStop(1, '#3e2723');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(c - 2, c, 17, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.9);
      });
      // Big digging front claws
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#ffe0b2';
        ctx.beginPath();
        ctx.ellipse(c + 10, c + side * 12, 6, 4, side * 0.3, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.5);
      }
      // Bright pink star-nose
      ctx.fillStyle = '#ff80ab';
      ctx.beginPath();
      ctx.arc(c + 16, c, 5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.5);
      return;
    }

    // phase: Swarm Mosquito (sleek dark-crimson mosquito with long proboscis & translucent white-cyan wings)
    withGroundShadow(ctx, () => {
      ctx.fillStyle = '#b71c1c';
      ctx.beginPath();
      ctx.ellipse(c - 2, c, 11, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.6);
    });
    // Needle proboscis
    ctx.strokeStyle = INK_OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c + 9, c);
    ctx.lineTo(c + 24, c);
    ctx.stroke();
    // Translucent wings
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(224, 247, 250, 0.72)';
      ctx.beginPath();
      ctx.ellipse(c - 3, c + side * 12, 13, 5.5, side * -0.45, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);
    }
  });
}

function paintLawnBoost(): Texture {
  return paintTransparentHaloRing(
    'rgba(232, 255, 102, 0.72)',
    'rgba(255, 210, 63, 0.56)',
    'rgba(232, 255, 102, 0)',
    '#e8ff66',
  );
}

function paintLawnObstacle(_variant: number): Texture {
  return paintMinimalCornerObstacle('#ffffff', 0.22);
}

function paintLawnCrater(): Texture {
  return paintCanvas(48, (ctx, size) => {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 2, c, c, 19);
    grad.addColorStop(0, 'rgba(62, 39, 35, 0.9)');
    grad.addColorStop(0.6, 'rgba(109, 76, 65, 0.55)');
    grad.addColorStop(1, 'rgba(109, 76, 65, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, 19, 0, Math.PI * 2);
    ctx.fill();
  });
}

function paintLawnMoleMound(): Texture {
  return paintCanvas(64, (ctx, size) => {
    const c = size / 2;
    withGroundShadow(ctx, () => {
      const grad = ctx.createRadialGradient(c - 4, c - 4, 4, c, c, 24);
      grad.addColorStop(0, '#8d6e63');
      grad.addColorStop(1, '#4e342e');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(c, c + 3, 23, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.9);
    });
    // Dark tunnel shadow
    ctx.fillStyle = '#1b0f0a';
    ctx.beginPath();
    ctx.ellipse(c, c + 1, 10, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Loose clods
    ctx.fillStyle = '#6d4c41';
    for (const [ox, oy, r] of [
      [-16, 12, 3.5],
      [17, 10, 3.2],
      [-12, -10, 2.8],
    ]) {
      ctx.beginPath();
      ctx.arc(c + ox, c + oy, r, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);
    }
    // Two little digging claws poking out
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ffe0b2';
      ctx.beginPath();
      ctx.ellipse(c + side * 8, c - 4, 4.5, 3, side * 0.4, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.4);
    }
  });
}

// ============================================================================
// PUBLIC BUILDER
// ============================================================================

interface ThemePainters {
  base: (key: TurretKey) => Texture;
  turret: (key: TurretKey, tier: 0 | 1 | 2) => Texture;
  enemy: (key: EnemyKey) => Texture;
  obstacle: (variant: number) => Texture;
  crater: () => Texture;
}

const THEME_PAINTERS: Record<TheaterTheme, ThemePainters> = {
  naval: {
    base: paintNavalBase,
    turret: paintNavalTurret,
    enemy: paintNavalEnemy,
    obstacle: paintNavalObstacle,
    crater: paintNavalCrater,
  },
  mars: {
    base: paintMarsBase,
    turret: paintMarsTurret,
    enemy: paintMarsEnemy,
    obstacle: paintMarsObstacle,
    crater: paintMarsCrater,
  },
  medieval: {
    base: paintMedievalBase,
    turret: paintMedievalTurret,
    enemy: paintMedievalEnemy,
    obstacle: paintMedievalObstacle,
    crater: paintMedievalCrater,
  },
  kitchen: {
    base: paintKitchenBase,
    turret: paintKitchenTurret,
    enemy: paintKitchenEnemy,
    obstacle: paintKitchenObstacle,
    crater: paintKitchenCrater,
  },
  lawn: {
    base: paintLawnBase,
    turret: paintLawnTurret,
    enemy: paintLawnEnemy,
    obstacle: paintLawnObstacle,
    crater: paintLawnCrater,
  },
};

export function buildTheaterTextures(theme: TheaterTheme): TheaterTextureSet {
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

    const result: TheaterTextureSet = {
      bases,
      turrets,
      enemies,
      obstacles: [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
      crater: Texture.EMPTY,
      destroy() {},
    };
    if (theme === 'naval') {
      result.mine = Texture.EMPTY;
    } else {
      result.boost = Texture.EMPTY;
    }
    if (theme === 'kitchen' || theme === 'lawn') {
      result.base = Texture.EMPTY;
    }
    if (theme === 'lawn') {
      result.moleMound = Texture.EMPTY;
    }
    if (theme === 'medieval') {
      result.knight = Texture.EMPTY;
    }
    if (theme === 'kitchen') {
      result.roomba = Texture.EMPTY;
    }
    return result;
  }

  const created: Texture[] = [];
  const track = (tex: Texture): Texture => {
    if (tex !== Texture.EMPTY) created.push(tex);
    return tex;
  };

  const painters = THEME_PAINTERS[theme];

  const bases: Record<string, Texture> = {};
  const turrets: Record<string, [Texture, Texture, Texture]> = {};
  const enemies: Record<string, Texture> = {};

  for (const key of TURRET_KEYS) {
    bases[key] = track(painters.base(key));
    turrets[key] = [
      track(painters.turret(key, 0)),
      track(painters.turret(key, 1)),
      track(painters.turret(key, 2)),
    ];
  }
  for (const key of ENEMY_KEYS) {
    enemies[key] = track(painters.enemy(key));
  }

  const obstacles = [
    track(painters.obstacle(0)),
    track(painters.obstacle(1)),
    track(painters.obstacle(2)),
  ];
  const crater = track(painters.crater());

  const result: TheaterTextureSet = {
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

  if (theme === 'naval') {
    result.mine = track(paintNavalMine());
  } else if (theme === 'mars') {
    result.boost = track(paintMarsBoost());
  } else if (theme === 'medieval') {
    result.boost = track(paintMedievalBoost());
    result.knight = track(paintMedievalKnight());
  } else if (theme === 'kitchen') {
    result.boost = track(paintKitchenBoost());
    result.base = track(paintKitchenCoreBase());
    result.roomba = track(paintKitchenRoomba());
  } else {
    result.boost = track(paintLawnBoost());
    result.base = track(paintLawnCoreBase());
    result.moleMound = track(paintLawnMoleMound());
  }

  return result;
}
