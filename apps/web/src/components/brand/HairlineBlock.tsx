import { useEffect, useRef } from 'react';
import HL from './hairline/kernel';
import block from './hairline/block';

interface Figure {
  range: [number, number, number];
  mount: (
    host: { stage: HTMLElement; svg: SVGElement; read: { textContent: string } },
    value: number,
  ) => { set: (v: number) => void; destroy: () => void };
}

/** The colour tone (0–3) of tower `lot` (1-based), matching `data-tone` in block.js. */
export const toneOfLot = (lot: number) => (lot + 1) % 4;

/**
 * The Hairline "block" figure: an isometric city block that lights up under the
 * pointer. `onLot` gets the 1-based lot under the pointer, or null at rest.
 */
export function HairlineBlock({
  theme = 'dark',
  className = '',
  onLot,
}: {
  theme?: 'light' | 'dark';
  className?: string;
  onLot?: (lot: number | null) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const onLotRef = useRef(onLot);
  onLotRef.current = onLot;

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    let figure: Figure | null = null;
    block(HL, (f: Figure) => { figure = f; });
    if (!figure) return;
    const fig: Figure = figure;
    HL.inject(document);
    const svg = HL.mk('svg', { viewBox: '0 0 400 320', 'aria-hidden': 'true' }, host);
    let last = '';
    const read = {
      get textContent() { return last; },
      set textContent(v: string) {
        last = v;
        const m = /^lot (\d+)$/.exec(v);
        onLotRef.current?.(m ? Number(m[1]) : null);
      },
    };
    const handle = fig.mount({ stage: host, svg, read }, fig.range[1]);
    return () => {
      handle.destroy();
      svg.remove();
    };
  }, []);

  return (
    <div
      ref={stage}
      className={className}
      data-hairline="block"
      data-hairline-theme={theme}
      role="img"
      aria-label="An isometric city block of towers that light up in colour when you hover over it"
    />
  );
}
