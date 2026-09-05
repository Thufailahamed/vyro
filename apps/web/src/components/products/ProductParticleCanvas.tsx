import { useEffect, useRef, useState, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  color: string;
  size: number;
  speed: number;
  delay: number;
  alpha: number;
}

interface ProductParticleCanvasProps {
  src: string;
  alt?: string;
  active: boolean;
  width?: number;
  height?: number;
  className?: string;
  onAssembled?: () => void;
}

export function ProductParticleCanvas({
  src,
  alt = 'Product preview',
  active,
  width = 440,
  height = 290,
  className = '',
  onAssembled,
}: ProductParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [assembleProgress, setAssembleProgress] = useState(0);
  const cachedParticlesMap = useRef<Map<string, Particle[]>>(new Map());
  const activeRef = useRef(active);
  activeRef.current = active;

  // Build particle points from image or fallback
  const extractParticles = useCallback((img: HTMLImageElement, w: number, h: number): Particle[] => {
    const offscreen = document.createElement('canvas');
    // Sample at a reasonable grid resolution for high 60fps performance (~2500-3500 particles)
    const sampleW = Math.min(180, Math.floor(w / 2.2));
    const sampleH = Math.min(120, Math.floor(h / 2.2));
    offscreen.width = sampleW;
    offscreen.height = sampleH;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    
    if (!ctx) return [];

    const particles: Particle[] = [];

    try {
      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;
      const step = 3; // sample every 3 pixels

      const scaleX = w / sampleW;
      const scaleY = h / sampleH;

      for (let y = 0; y < sampleH; y += step) {
        for (let x = 0; x < sampleW; x += step) {
          const index = (y * sampleW + x) * 4;
          const r = imgData[index] ?? 200;
          const g = imgData[index + 1] ?? 200;
          const b = imgData[index + 2] ?? 200;
          const a = (imgData[index + 3] ?? 255) / 255;

          if (a > 0.15) {
            const targetX = x * scaleX;
            const targetY = y * scaleY;

            // Random initial exploded scatter trajectory from outside or radial burst
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * Math.max(w, h) * 1.2 + 80;
            const originX = w / 2 + Math.cos(angle) * distance;
            const originY = h / 2 + Math.sin(angle) * distance;

            particles.push({
              x: originX,
              y: originY,
              originX,
              originY,
              targetX,
              targetY,
              color: `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`,
              size: Math.random() * 1.6 + 1.2,
              speed: Math.random() * 0.08 + 0.06, // spring-like velocity
              delay: Math.floor(Math.random() * 25), // wave delay
              alpha: 0,
            });
          }
        }
      }
    } catch {
      // Fallback if CORS prevents pixel reading: generate sleek brand particle mosaic
      const cols = 45;
      const rows = 30;
      const stepX = w / cols;
      const stepY = h / rows;
      const brandColors = [
        'rgba(198, 220, 74, 0.85)',
        'rgba(184, 122, 78, 0.85)',
        'rgba(250, 247, 240, 0.9)',
        'rgba(212, 208, 198, 0.75)',
        'rgba(110, 115, 106, 0.65)',
      ];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const targetX = c * stepX + stepX / 2;
          const targetY = r * stepY + stepY / 2;
          const angle = Math.random() * Math.PI * 2;
          const distance = Math.random() * Math.max(w, h) * 1.2 + 80;
          const originX = w / 2 + Math.cos(angle) * distance;
          const originY = h / 2 + Math.sin(angle) * distance;

          particles.push({
            x: originX,
            y: originY,
            originX,
            originY,
            targetX,
            targetY,
            color: brandColors[(r * cols + c) % brandColors.length] ?? 'rgba(250, 247, 240, 0.9)',
            size: Math.random() * 1.8 + 1.4,
            speed: Math.random() * 0.08 + 0.06,
            delay: Math.floor(Math.random() * 20),
            alpha: 0,
          });
        }
      }
    }

    return particles;
  }, []);

  // Preload and sample image
  useEffect(() => {
    let isCancelled = false;
    setImageLoaded(false);
    setAssembleProgress(0);

    if (cachedParticlesMap.current.has(src)) {
      // Clone cached particles with fresh origins
      const cached = cachedParticlesMap.current.get(src)!;
      particlesRef.current = cached.map((p) => {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * Math.max(width, height) * 1.2 + 80;
        const originX = width / 2 + Math.cos(angle) * distance;
        const originY = height / 2 + Math.sin(angle) * distance;
        return {
          ...p,
          x: originX,
          y: originY,
          originX,
          originY,
          alpha: 0,
        };
      });
      setImageLoaded(true);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;

    img.onload = () => {
      if (isCancelled) return;
      const pts = extractParticles(img, width, height);
      cachedParticlesMap.current.set(src, pts);
      particlesRef.current = pts.map((p) => ({ ...p }));
      setImageLoaded(true);
    };

    img.onerror = () => {
      if (isCancelled) return;
      const pts = extractParticles(img, width, height);
      particlesRef.current = pts;
      setImageLoaded(true);
    };

    return () => {
      isCancelled = true;
    };
  }, [src, width, height, extractParticles]);

  // Main Canvas Render & Physics Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    let frame = 0;
    let assembledNotified = false;

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;
      const total = particles.length;
      let settledCount = 0;

      for (let i = 0; i < total; i++) {
        const p = particles[i];
        if (!p) continue;

        if (activeRef.current) {
          // Assembling towards target
          if (frame > p.delay) {
            p.alpha = Math.min(1, p.alpha + 0.08);
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;

            p.x += dx * p.speed;
            p.y += dy * p.speed;

            if (Math.abs(dx) < 1.2 && Math.abs(dy) < 1.2) {
              p.x = p.targetX;
              p.y = p.targetY;
              settledCount++;
            }
          }
        } else {
          // Dispersing outwards
          const dx = p.x - width / 2;
          const dy = p.y - height / 2;
          p.x += (dx || 1) * 0.08;
          p.y += (dy || 1) * 0.08;
          p.alpha = Math.max(0, p.alpha - 0.07);
        }

        if (p.alpha > 0.01) {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      const progress = total > 0 ? settledCount / total : 0;
      setAssembleProgress(progress);

      if (progress > 0.85 && !assembledNotified && activeRef.current) {
        assembledNotified = true;
        onAssembled?.();
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [width, height, imageLoaded, onAssembled]);

  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`} style={{ width, height }}>
      {/* Particle Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        className="absolute inset-0 block pointer-events-none z-10"
        aria-hidden="true"
      />

      {/* Cross-fade High-Res Image as particles finish assembly for crisp look */}
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-500 ease-out z-0"
        style={{
          opacity: assembleProgress > 0.75 && active ? Math.min(1, (assembleProgress - 0.75) * 4) : 0,
        }}
      />

      {/* Subtle vignette border gradient */}
      <div className="absolute inset-0 pointer-events-none border border-paper/10 rounded-lg shadow-inner z-20" />
    </div>
  );
}
