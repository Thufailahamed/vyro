/* eslint-disable */
// @ts-nocheck
// Hairline figure: built with the hairline kernel; see ../HairlineBlock.tsx
export default function block(HL, hairline) {
/**
 * Block: a city block of eight towers round a small park, on one slab. At rest
 * it is a skyline in hairline, one spire bright on the tallest tower. Put the
 * pointer anywhere on the block and every tower lights, spreading outwards from
 * the one nearest the pointer; let go and it recedes in the same order. The
 * slider is the stagger, in ms.
 *
 * The pattern: one thing, many parts. Nothing moves, so the hit test is a fixed
 * hull of the resting block, and the only clock is a tween per part.
 */
const {
  Cam, clamp, facing, fit, hull, poly, proj, rings, rrect, prism, seg, tdone, tset, tval, tween,
  disposer, mk, put, solid, reflect, register, pointer,
} = HL;

const CELL = 25, PITCH = 31, ORG = 5, SLAB = 95, BASE = 3;
// i, j: the lot; h: height; t: how far the tower sits in from its lot; c: the setback crown; s: a spire
const TOWERS = [
  { i: 0, j: 0, h: 34, t: 2, c: 8, s: 0 }, { i: 1, j: 0, h: 24, t: 4, c: 0, s: 0 }, { i: 2, j: 0, h: 52, t: 3, c: 12, s: 16 },
  { i: 0, j: 1, h: 20, t: 3, c: 0, s: 0 }, { i: 2, j: 1, h: 30, t: 2, c: 8, s: 0 },
  { i: 0, j: 2, h: 36, t: 3, c: 10, s: 0 }, { i: 1, j: 2, h: 16, t: 4, c: 0, s: 0 }, { i: 2, j: 2, h: 22, t: 2, c: 0, s: 0 },
].sort((a, b) => a.i + a.j - (b.i + b.j));
const lot = (n) => ORG + n * PITCH;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let stag = value;

  const C = Cam(45, 0.5, 1.95);
  fit(C, [[0, 0, 0], [SLAB, 0, BASE + 52 + 12 + 16], [0, SLAB, 0], [SLAB, SLAB, 0]], 200, 168);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [sRing, sInner] = rings(0, 0, SLAB, SLAB, 7, 1.6);
  reflect(svg, g, P, front, sRing, 0, 14);

  /** Everything that lights: the slab, the park, each tower. `els` are the strokes that go bright. */
  const items = [];
  const add = (x, y, els) => items.push({ x, y, els, w: tween(0), on: false });
  const slab = solid(mk("g", { "data-part": "slab" }, g));
  put(slab, prism(P, front, sRing, sInner, 0, BASE));
  add(SLAB / 2, SLAB / 2, [slab.sil]);

  // the park, in the middle lot: a low round lawn
  const mid = lot(1) + CELL / 2, park = solid(mk("g", { "data-part": "park" }, g));
  put(park, prism(P, front, rrect(mid - 10, mid - 10, mid + 10, mid + 10, 10, 12), rrect(mid - 8.4, mid - 8.4, mid + 8.4, mid + 8.4, 8.4, 12), BASE, BASE + 1.6));
  add(mid, mid, [park.sil]);

  const hitPts = [[0, 0, 0], [SLAB, 0, 0], [0, SLAB, 0], [SLAB, SLAB, 0]].map((p) => P(...p));
  let mark = null;
  for (const T of TOWERS) {
    const x0 = lot(T.i) + T.t, y0 = lot(T.j) + T.t, x1 = lot(T.i) + CELL - T.t, y1 = lot(T.j) + CELL - T.t;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, top = BASE + T.h, els = [];
    // each tower is its own group, tagged with a tone the host page may colour when it lights
    const tg = mk("g", { "data-tone": String(items.length % 4) }, g), body = solid(tg);
    put(body, prism(P, front, ...rings(x0, y0, x1, y1, 3, 1.6), BASE, top));
    els.push(body.sil);
    if (T.c) {
      const crown = solid(tg), k = 4.5;
      put(crown, prism(P, front, ...rings(x0 + k, y0 + k, x1 - k, y1 - k, 2, 1.1), top, top + T.c));
      els.push(crown.sil);
    }
    if (T.s) {
      const tip = top + T.c, spire = mk("path", { d: seg(P(cx, cy, tip), P(cx, cy, tip + T.s)), class: "nf hi" }, tg);
      mark = spire; els.push(spire);
    }
    add(cx, cy, els);
    hitPts.push(P(x0, y0, top + T.c + T.s), P(x1, y1, top + T.c), P(x0, y1, top + T.c), P(x1, y0, top + T.c));
  }

  // hit area: the hull of the resting block, tall tops included. Nothing here ever moves.
  const H = hull(hitPts);
  const inside = ([x, y]) => {
    let sign = 0;
    for (let n = 0; n < H.length; n++) {
      const a = H[n], b = H[(n + 1) % H.length], cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (cr && sign && Math.sign(cr) !== sign) return false;
      if (cr) sign = Math.sign(cr);
    }
    return true;
  };
  const towers = items.slice(2), centre = (it) => P(it.x, it.y, BASE + 14);
  const nearest = ([x, y]) => towers.reduce((best, it, n) => {
    const c = centre(it), d = Math.hypot(c[0] - x, c[1] - y);
    return d < best[1] ? [n, d] : best;
  }, [0, Infinity])[0];

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const it of items) {
      const on = tval(it.w, now) > 0.5;
      if (on !== it.on) { it.on = on; for (const el of it.els) el.classList.toggle("hi", on || el === mark); }
      if (!tdone(it.w, now)) moving = true;
    }
    return moving;
  });
  bag.add(B.unregister);

  let act = -1;
  /** Lights the block from tower a outwards, or lets it go from where it was lit (-1). */
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = towers[a >= 0 ? a : act];
    act = a;
    for (const it of items) tset(it.w, a >= 0 ? 1 : 0, now, clamp(Math.hypot(it.x - from.x, it.y - from.y) / PITCH, 0, 3) * stag);
    read.textContent = a < 0 ? "rest" : "lot " + (a + 1);
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(inside(p) ? nearest(p) : -1), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { stag = v; },
    destroy: bag.dispose,
  };
}

hairline({
  name: "block",
  means: "A city block of towers round a park: put the pointer on it and every tower lights, outwards from the one nearest.",
  rules: [1, 2, 4, 5],
  range: [0, 60, 140],
  tour: [[130, 200], [235, 120], [270, 195], null],
  mount,
});
}
