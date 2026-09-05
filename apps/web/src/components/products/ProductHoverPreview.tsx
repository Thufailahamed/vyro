import { useEffect, useRef, useState } from 'react';
import { ProductParticleCanvas } from './ProductParticleCanvas';

export interface ProductPreviewItem {
  id: string;
  name: string;
  category: string;
  price: string;
  unit: string;
  image: string;
  badge?: string;
  supplier?: string;
}

interface ProductHoverPreviewProps {
  activeProduct: ProductPreviewItem | null;
  mousePos: { x: number; y: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ProductHoverPreview({
  activeProduct,
  mousePos,
  containerRef,
}: ProductHoverPreviewProps) {
  // Smooth lerp tracking of cursor
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const targetPosRef = useRef({ x: 0, y: 0 });
  const animRef = useRef<number | null>(null);

  // Update target coordinates relative to container
  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Position preview slightly offset from cursor or centered near cursor
    const cardWidth = 440;
    const cardHeight = 290;

    // Calculate clamped position inside container
    const rawX = mousePos.x - rect.left - cardWidth / 2;
    const rawY = mousePos.y - rect.top - cardHeight / 2;

    const minX = 20;
    const maxX = Math.max(minX, rect.width - cardWidth - 20);
    const minY = 20;
    const maxY = Math.max(minY, rect.height - cardHeight - 20);

    const clampedX = Math.max(minX, Math.min(rawX, maxX));
    const clampedY = Math.max(minY, Math.min(rawY, maxY));

    targetPosRef.current = { x: clampedX, y: clampedY };
  }, [mousePos, containerRef]);

  // Smooth lerp animation loop
  useEffect(() => {
    let currentX = targetPosRef.current.x;
    let currentY = targetPosRef.current.y;

    const loop = () => {
      currentX += (targetPosRef.current.x - currentX) * 0.14;
      currentY += (targetPosRef.current.y - currentY) * 0.14;
      setPos({ x: currentX, y: currentY });
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeProduct) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 240);
      return () => clearTimeout(timer);
    }
  }, [activeProduct]);

  if (!isVisible && !activeProduct) return null;

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none z-30 transition-opacity duration-240"
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        opacity: activeProduct ? 1 : 0,
        willChange: 'transform, opacity',
      }}
    >
      <div className="relative w-[360px] sm:w-[440px] h-[240px] sm:h-[290px] rounded-xl overflow-hidden shadow-2xl bg-ink/95 border border-paper/20 backdrop-blur-md transition-transform duration-300 scale-100 group">
        {/* Glow ambient background aura */}
        <div className="absolute -inset-1 bg-gradient-to-r from-volt/20 via-copper/20 to-volt/20 rounded-xl blur-lg opacity-40" />

        {/* The Particle Canvas */}
        {activeProduct && (
          <ProductParticleCanvas
            src={activeProduct.image}
            alt={activeProduct.name}
            active={Boolean(activeProduct)}
            width={440}
            height={290}
            className="w-full h-full"
          />
        )}

        {/* Center Circular "VIEW" Badge (exact match to user's reference screenshot) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="relative flex items-center justify-center">
            {/* Pulsing ring behind button */}
            <div className="absolute w-20 h-20 rounded-full border border-paper/40 animate-ping opacity-25" />
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-paper text-ink flex flex-col items-center justify-center shadow-xl font-display font-bold tracking-widest text-[11px] sm:text-xs uppercase border border-ink/10 transition-transform duration-300 hover:scale-110">
              <span>VIEW</span>
            </div>
          </div>
        </div>

        {/* Top Badges */}
        {activeProduct?.badge && (
          <div className="absolute top-3 left-3 z-30 pointer-events-none">
            <span className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-ink/80 text-volt border border-volt/30 backdrop-blur-md rounded">
              {activeProduct.badge}
            </span>
          </div>
        )}

        {/* Bottom Details Pill Overlay */}
        <div className="absolute bottom-3 inset-x-3 z-30 pointer-events-none flex items-center justify-between px-3 py-2 bg-ink/85 border border-paper/15 backdrop-blur-md rounded-lg text-paper">
          <div className="min-w-0 pr-2">
            <div className="text-[10px] font-mono uppercase text-copper tracking-wider truncate">
              {activeProduct?.category}
            </div>
            <div className="text-xs font-display font-semibold text-paper truncate">
              {activeProduct?.name}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-mono font-bold text-volt">
              {activeProduct?.price}
            </div>
            <div className="text-[9px] font-mono text-ink-5">
              {activeProduct?.unit}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
