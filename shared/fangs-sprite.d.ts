export const SIZE: number;
export const PALETTE: Record<string, string>;
export const EXPRESSIONS: string[];
export const POSES: string[];
export type Expression = 'stern' | 'reading' | 'unimpressed' | 'grudging' | 'impressed';
export function composeFrame(pose: string, expression: string): string[];
export function drawFrame(ctx: CanvasRenderingContext2D, rows: string[], scale: number, flip?: boolean): void;
export interface Fangs {
  dig(): void;
  verdict(expression: string): void;
  idle(): void;
  roam(): void;
  drop(): void;
  readonly x: number;
  destroy(): void;
}
export function createFangs(opts: {
  canvas: HTMLCanvasElement;
  scale?: number;
  getWidth: () => number;
  reducedMotion?: boolean;
  dropFrom?: number;
}): Fangs;
