/** Fixed-timestep accumulator: simulation always advances in exact 1/60 s steps. */
export const STEP = 1 / 60;

export class FixedStepper {
  acc = 0;
  steps = 0;
  constructor(readonly step = STEP, readonly maxFrame = 0.25, readonly maxStepsPerFrame = 10) {}

  /** Feed a variable frame time (seconds); runs `fn(step)` zero or more times. Returns steps run. */
  advance(frameSeconds: number, fn: (dt: number) => void): number {
    this.acc += Math.min(Math.max(frameSeconds, 0), this.maxFrame);
    let n = 0;
    while (this.acc >= this.step - 1e-9 && n < this.maxStepsPerFrame) {
      fn(this.step);
      this.acc -= this.step;
      n++;
    }
    if (n >= this.maxStepsPerFrame) this.acc = 0; // spiral-of-death guard
    if (this.acc < 0) this.acc = 0;
    this.steps += n;
    return n;
  }
}
