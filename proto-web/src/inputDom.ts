// DOM wiring for InputController: capture, release, cancellation, focus loss, context menu.
import type { InputController } from './input';

export interface EventTargetLike {
  addEventListener(type: string, fn: (e: any) => void, opts?: unknown): void;
  removeEventListener(type: string, fn: (e: any) => void): void;
}
export interface CanvasLike extends EventTargetLike {
  setPointerCapture?(id: number): void;
  releasePointerCapture?(id: number): void;
  hasPointerCapture?(id: number): boolean;
}
export interface DomInputOptions {
  canvas: CanvasLike;
  win: EventTargetLike;
  doc: EventTargetLike & { hidden?: boolean };
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  input: InputController;
  now?: () => number;
  onUserAction?: () => void;
  onFocusLoss?: () => void;
}

export function attachPointerInput(o: DomInputOptions): () => void {
  const now = o.now ?? (() => performance.now());
  const release = (id: number) => {
    try { if (o.canvas.hasPointerCapture?.(id)) o.canvas.releasePointerCapture?.(id); } catch { /* already released */ }
  };
  const down = (e: any) => {
    e.preventDefault?.();
    try { o.canvas.setPointerCapture?.(e.pointerId); } catch { /* best effort */ }
    const p = o.toWorld(e.clientX, e.clientY);
    o.input.pointerDown(e.pointerId, p.x, p.y, e.pointerType ?? 'mouse', e.button ?? 0, now());
    o.onUserAction?.();
  };
  const move = (e: any) => {
    const p = o.toWorld(e.clientX, e.clientY);
    o.input.pointerMove(e.pointerId, p.x, p.y, e.timeStamp || now());
  };
  const up = (e: any) => {
    const p = o.toWorld(e.clientX, e.clientY);
    o.input.pointerUp(e.pointerId, p.x, p.y, now());
    release(e.pointerId);
  };
  const cancel = (e: any) => { o.input.cancel(e.pointerId); release(e.pointerId); };
  const lost = (e: any) => { o.input.cancel(e.pointerId); };
  const ctx = (e: any) => { e.preventDefault?.(); };
  const focusLoss = () => { o.input.cancelAll(); o.onFocusLoss?.(); };
  const vis = () => { if (o.doc.hidden) focusLoss(); };

  o.canvas.addEventListener('pointerdown', down);
  o.canvas.addEventListener('pointermove', move);
  o.canvas.addEventListener('pointerup', up);
  o.canvas.addEventListener('pointercancel', cancel);
  o.canvas.addEventListener('lostpointercapture', lost);
  o.canvas.addEventListener('contextmenu', ctx);
  o.win.addEventListener('contextmenu', ctx);
  o.win.addEventListener('blur', focusLoss);
  o.doc.addEventListener('visibilitychange', vis);
  return () => {
    o.canvas.removeEventListener('pointerdown', down);
    o.canvas.removeEventListener('pointermove', move);
    o.canvas.removeEventListener('pointerup', up);
    o.canvas.removeEventListener('pointercancel', cancel);
    o.canvas.removeEventListener('lostpointercapture', lost);
    o.canvas.removeEventListener('contextmenu', ctx);
    o.win.removeEventListener('contextmenu', ctx);
    o.win.removeEventListener('blur', focusLoss);
    o.doc.removeEventListener('visibilitychange', vis);
  };
}
