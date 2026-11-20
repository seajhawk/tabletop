import { Texture } from 'pixi.js';
import type { MilitaryTextureSet } from './militarySprites';

export interface TheaterTextureSet extends MilitaryTextureSet {
  mine?: Texture;
  boost?: Texture;
}

export type TheaterTheme = 'naval' | 'mars' | 'medieval';

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

    // swarm: royal purple & gold runed stone plinth
    withGroundShadow(ctx, () => {
      polygonPath(ctx, c, c, 32, 8, 0);
      ctx.fillStyle = '#4d2b6e';
      ctx.fill();
    });
    polygonPath(ctx, c, c, 32, 8, 0);
    ctx.fillStyle = '#6c3c96';
    ctx.fill();
    strokeInk(ctx, 1.85);
    polygonPath(ctx, c, c, 23, 8, 0);
    ctx.strokeStyle = '#f2c138';
    ctx.lineWidth = 2.2;
    ctx.stroke();
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

      // Glowing flaming boulder in sling
      const flame = ctx.createRadialGradient(74, c, 2, 74, c, tier === 2 ? 14 : 11);
      flame.addColorStop(0, '#fff7c2');
      flame.addColorStop(0.55, '#ff7b14');
      flame.addColorStop(1, '#b8250b');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.arc(74, c, tier === 2 ? 12 : 9.5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.6);
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

    // swarm: Arcane Spire — ornate runed stone spire crowned with floating violet-gold magic star orbs
    withGroundShadow(ctx, () => {
      polygonPath(ctx, c, c, 20, 8, Math.PI / 8);
      ctx.fillStyle = '#7e3db8';
      ctx.fill();
    });
    polygonPath(ctx, c, c, 20, 8, Math.PI / 8);
    ctx.fillStyle = '#9752d9';
    ctx.fill();
    strokeInk(ctx, 1.85);

    const orbs = tier === 0 ? 3 : tier === 1 ? 4 : 5;
    for (let i = 0; i < orbs; i++) {
      const a = (i / orbs) * Math.PI * 2;
      ctx.fillStyle = '#ffd447';
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * 14, c + Math.sin(a) * 14, 4.5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.2);
    }
  });
}

function paintMedievalEnemy(key: EnemyKey): Texture {
  if (key === 'dreadnought') {
    // Siege Troll King Boss (128x128): armored war-troll, horned crown, huge warhammer, crimson war banners
    return paintCanvas(128, (ctx, size) => {
      const c = size / 2;
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#2d4727';
        ctx.beginPath();
        ctx.ellipse(c - 4, c, 36, 40, 0, 0, Math.PI * 2);
        ctx.fill();
      }, 7, -3.5, 3.5);

      // Crimson war banners aft
      for (const by of [c - 28, c + 20]) {
        ctx.fillStyle = '#c92020';
        ctx.fillRect(14, by, 22, 9);
        strokeInk(ctx, 1.5);
      }

      // Broad troll shoulders & iron plate armor
      ctx.fillStyle = '#48733c';
      ctx.beginPath();
      ctx.ellipse(c - 4, c, 34, 38, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 2.2);

      // Iron shoulder pauldrons
      for (const py of [c - 26, c + 26]) {
        ctx.fillStyle = '#6c7782';
        ctx.beginPath();
        ctx.arc(c - 2, py, 14, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.7);
      }

      // Huge warhammer extending right
      drawGradBarrel(ctx, c + 6, c + 12, 108, 7, '#b57b3c', '#734a1e', '#38220c', 1.6);
      roundedRectPath(ctx, 96, c - 6, 18, 36, 4);
      ctx.fillStyle = '#8b96a3';
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Horned crown head
      ctx.fillStyle = '#f5c542';
      ctx.beginPath();
      ctx.arc(c + 8, c, 15, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.8);
    });
  }

  return paintCanvas(96, (ctx, size) => {
    const c = size / 2;

    if (key === 'scout') {
      // Goblin Raider: bright-green goblin with pointed helmet/ears, spear & wooden buckler
      drawGradBarrel(ctx, c - 4, c + 10, 84, 3.5, '#d19852', '#8a5b26', '#4a2e10', 1.3);
      ctx.fillStyle = '#dfe8f0';
      ctx.beginPath();
      ctx.moveTo(88, c + 10);
      ctx.lineTo(78, c + 6);
      ctx.lineTo(78, c + 14);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.2);

      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#4aa638';
        ctx.beginPath();
        ctx.arc(c, c, 16, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#5ac744';
      ctx.beginPath();
      ctx.arc(c, c, 16, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.8);

      // Wooden buckler
      ctx.fillStyle = '#9c632c';
      ctx.beginPath();
      ctx.arc(c + 8, c - 13, 8, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.4);
      return;
    }

    if (key === 'swarmer') {
      // Goblin Mob: tiny fast bright-lime-green goblin runner with dagger
      drawGradBarrel(ctx, c + 2, c + 6, 74, 3, '#eef6fc', '#9aa6b2', '#4c545e', 1.2);
      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#74db32';
        ctx.beginPath();
        ctx.arc(c - 2, c, 12, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#84eb38';
      ctx.beginPath();
      ctx.arc(c - 2, c, 12, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.7);
      return;
    }

    if (key === 'cruiser') {
      // Armored Orc Brute: broad hulking dark-green orc in spiked iron pauldrons + huge battleaxe
      drawGradBarrel(ctx, c + 4, c + 12, 82, 5, '#b57b3c', '#734a1e', '#38220c', 1.4);
      ctx.fillStyle = '#9ba6b2';
      ctx.beginPath();
      ctx.arc(76, c + 12, 11, -0.9, 0.9);
      ctx.lineTo(72, c + 12);
      ctx.closePath();
      ctx.fill();
      strokeInk(ctx, 1.5);

      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#336929';
        ctx.beginPath();
        ctx.ellipse(c - 2, c, 22, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#3d7d31';
      ctx.beginPath();
      ctx.ellipse(c - 2, c, 22, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.9);

      for (const py of [c - 18, c + 18]) {
        ctx.fillStyle = '#687380';
        ctx.beginPath();
        ctx.arc(c, py, 9, 0, Math.PI * 2);
        ctx.fill();
        strokeInk(ctx, 1.5);
      }
      return;
    }

    if (key === 'frigate') {
      // Dark Orc Shaman: hooded purple-and-crimson robed orc mystic holding glowing arcane ward staff
      drawGradBarrel(ctx, 26, c + 14, 80, 4, '#b57b3c', '#734a1e', '#38220c', 1.3);
      ctx.fillStyle = '#ff4df0';
      ctx.beginPath();
      ctx.arc(80, c + 14, 5.5, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.3);

      withGroundShadow(ctx, () => {
        ctx.fillStyle = '#5c216b';
        ctx.beginPath();
        ctx.arc(c, c, 19, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#732985';
      ctx.beginPath();
      ctx.arc(c, c, 19, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.85);

      ctx.fillStyle = '#c4273b';
      ctx.beginPath();
      ctx.arc(c + 4, c, 9, 0, Math.PI * 2);
      ctx.fill();
      strokeInk(ctx, 1.4);
      return;
    }

    // phase: Wyvern / Gargoyle (NO close shadow)
    ctx.beginPath();
    ctx.moveTo(86, c);
    ctx.lineTo(58, c - 7);
    ctx.lineTo(36, c - 36);
    ctx.lineTo(22, c - 26);
    ctx.lineTo(36, c - 7);
    ctx.lineTo(10, c);
    ctx.lineTo(36, c + 7);
    ctx.lineTo(22, c + 26);
    ctx.lineTo(36, c + 36);
    ctx.lineTo(58, c + 7);
    ctx.closePath();
    ctx.fillStyle = '#9e2028';
    ctx.fill();
    strokeInk(ctx, 1.85);

    ctx.fillStyle = '#383034';
    ctx.beginPath();
    ctx.ellipse(50, c, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeInk(ctx, 1.4);
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
// PUBLIC BUILDER
// ============================================================================

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
    return result;
  }

  const created: Texture[] = [];
  const track = (tex: Texture): Texture => {
    if (tex !== Texture.EMPTY) created.push(tex);
    return tex;
  };

  const paintBase = theme === 'naval' ? paintNavalBase : theme === 'mars' ? paintMarsBase : paintMedievalBase;
  const paintTurret =
    theme === 'naval' ? paintNavalTurret : theme === 'mars' ? paintMarsTurret : paintMedievalTurret;
  const paintEnemy = theme === 'naval' ? paintNavalEnemy : theme === 'mars' ? paintMarsEnemy : paintMedievalEnemy;
  const paintObstacle =
    theme === 'naval' ? paintNavalObstacle : theme === 'mars' ? paintMarsObstacle : paintMedievalObstacle;
  const paintCrater =
    theme === 'naval' ? paintNavalCrater : theme === 'mars' ? paintMarsCrater : paintMedievalCrater;

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
  } else {
    result.boost = track(paintMedievalBoost());
  }

  return result;
}
