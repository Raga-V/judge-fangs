import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createFangs, type Fangs } from '../../../shared/fangs-sprite.js';

export interface FangsHandle {
  dig(): void;
  verdict(expression: string): void;
  idle(): void;
}

/** Judge Fangs roams along the bottom edge of the page. Purely decorative. */
const FangsSprite = forwardRef<FangsHandle>(function FangsSprite(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fangs = useRef<Fangs | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const small = window.matchMedia('(max-width: 640px)').matches;
    fangs.current = createFangs({
      canvas: canvas.current,
      scale: small ? 3 : 4,
      getWidth: () => document.documentElement.clientWidth,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    return () => fangs.current?.destroy();
  }, []);

  useImperativeHandle(ref, () => ({
    dig: () => fangs.current?.dig(),
    verdict: (e: string) => fangs.current?.verdict(e),
    idle: () => fangs.current?.idle(),
  }), []);

  return <canvas ref={canvas} className="fangs-sprite" aria-hidden="true" />;
});

export default FangsSprite;
