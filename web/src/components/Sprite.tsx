import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { composeFrame, createFangs, drawFrame, SIZE, type Fangs } from '../../../shared/fangs-sprite.js';
import type { Expression } from '../types';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A still (or gently animated) Judge Fangs. `crop` shows only the head and shoulders. */
export function SpriteAvatar({ expression = 'stern', pose = 'idle', scale = 3, crop = false, animate = false, className = '' }: {
  expression?: Expression; pose?: string; scale?: number; crop?: boolean; animate?: boolean | 'dig' | 'gavel'; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const rows = crop ? 20 : SIZE;
    c.width = SIZE * scale;
    c.height = rows * scale;
    let frame = 0;
    const draw = () => {
      let p = pose;
      let e: string = expression;
      if (animate === 'dig') { p = frame % 2 ? 'read1' : 'read2'; e = 'reading'; }
      else if (animate === 'gavel') p = frame % 2 ? 'gavelDown' : 'gavelUp';
      else if (animate) p = frame % 6 === 5 ? 'tapUp' : pose;
      drawFrame(ctx, composeFrame(p, e), scale, false);
    };
    draw();
    if (!animate || reduced()) return;
    const t = setInterval(() => { frame++; draw(); }, animate === 'gavel' ? 320 : 260);
    return () => clearInterval(t);
  }, [expression, pose, scale, crop, animate]);
  return <canvas ref={ref} className={`sprite ${className}`} aria-hidden="true" />;
}

/** A pixel speech bubble. */
export function Bubble({ children, tail = 'left' }: { children: ReactNode; tail?: 'left' | 'down' }) {
  return <div className={`px-bubble tail-${tail}`}>{children}</div>;
}

/** Empty states: the Count and a one-line quip. */
export function EmptyState({ quip, expression = 'stern', children, animate }: {
  quip: string; expression?: Expression; children?: ReactNode; animate?: boolean | 'dig' | 'gavel';
}) {
  return (
    <div className="empty fade-rise">
      <SpriteAvatar expression={expression} scale={4} animate={animate ?? true} />
      <div className="empty-body">
        <Bubble>{quip}</Bubble>
        {children && <div className="empty-actions">{children}</div>}
      </div>
    </div>
  );
}

export interface RoamerHandle {
  dig(): void;
  verdict(expression: string, line?: string): void;
  idle(): void;
  say(line: string, ms?: number): void;
}

/** Judge Fangs roams the bottom edge of the main column. Decorative; speech goes in a pixel bubble. */
export const Roamer = forwardRef<RoamerHandle, { host: React.RefObject<HTMLElement | null> }>(function Roamer({ host }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const fangs = useRef<Fangs | null>(null);
  const [line, setLine] = useState('');
  const timer = useRef(0);

  useEffect(() => {
    if (!canvas.current) return;
    const scale = window.matchMedia('(max-width: 720px)').matches ? 2 : 3;
    const width = () => host.current?.clientWidth || 600;
    fangs.current = createFangs({ canvas: canvas.current, scale, getWidth: width, reducedMotion: reduced() });
    let raf = 0;
    const follow = () => {
      const h = host.current;
      if (h && canvas.current) {
        const left = h.getBoundingClientRect().left;
        canvas.current.style.left = `${left}px`;
        if (bubble.current) {
          const w = bubble.current.offsetWidth || 220;
          const x = Math.max(8, Math.min(width() - w - 8, (fangs.current?.x || 0) + (SIZE * scale) / 2 - w / 2));
          bubble.current.style.left = `${left + x}px`;
        }
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => { cancelAnimationFrame(raf); fangs.current?.destroy(); };
  }, [host]);

  const say = (l: string, ms = 5000) => {
    setLine(l);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLine(''), ms);
  };

  useImperativeHandle(ref, () => ({
    dig: () => fangs.current?.dig(),
    verdict: (e: string, l?: string) => { fangs.current?.verdict(e); if (l) say(l, 7000); },
    idle: () => fangs.current?.idle(),
    say,
  }), []);

  return (
    <>
      <canvas ref={canvas} className="roamer" aria-hidden="true" />
      {line && <div ref={bubble} className="roamer-bubble px-bubble tail-down" role="status">{line}</div>}
    </>
  );
});
