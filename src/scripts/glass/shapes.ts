/* Shape outlines for the glass, ported from the brand document
   (Code/Thrive/src/components/blocks/ShapeShift.tsx).

   Every shape is sampled at the same angles round its centre, so any two
   morph point for point. 720 samples put a sample on every corner. */
const SAMPLES = 720;
const angle = (i: number) => (i / SAMPLES) * Math.PI * 2;

/* A star of n points with its inner corners at `inner` of the way out. */
const star = (n: number, inner: number, turn: number) => (a: number) => {
  const step = (Math.PI * 2) / n;
  const t = (((a - turn) % step) + step) % step;
  return inner + (1 - inner) * Math.abs((t / step) * 2 - 1);
};

/* For shapes easier to say as inside or out than as a radius: how far a
   ray from the centre at angle a goes before it leaves. */
const ray = (inside: (x: number, y: number) => boolean) => (a: number) => {
  let lo = 0;
  let hi = 3;
  for (let k = 0; k < 40; k++) {
    const m = (lo + hi) / 2;
    if (inside(m * Math.cos(a), m * Math.sin(a))) lo = m;
    else hi = m;
  }
  return lo;
};

const SHAPES: Record<string, (a: number) => number> = {
  circle: () => 1,
  donut: () => 1,
  flower: (a) => 0.62 + 0.38 * Math.abs(Math.cos(3 * (a + Math.PI / 2))),
  sunburst: star(16, 0.8, 0),
  seal: (a) => 0.9 + 0.1 * Math.abs(Math.cos(6 * a)),
  plus: (a) => 0.62 + 0.38 * Math.pow(Math.abs(Math.cos(2 * a)), 3),
  clover: (a) => 0.35 + 0.65 * Math.abs(Math.cos(2 * a + Math.PI / 2)),
  diamond: (a) => 1 / (Math.abs(Math.cos(a)) / 0.8 + Math.abs(Math.sin(a)) / 1.1),
  domes: ray(
    (x, y) => (x * x + y * y <= 1 && y <= 0) || (x * x + (y - 1) * (y - 1) <= 1 && y <= 1),
  ),
  spokes: ray((x, y) =>
    [0, 1, 2, 3].some((n) => {
      const t = (n * Math.PI) / 4;
      const along = x * Math.cos(t) + y * Math.sin(t);
      const across = y * Math.cos(t) - x * Math.sin(t);
      return Math.abs(along) <= 1 && Math.abs(across) <= 0.2;
    }),
  ),
};

/* Shapes with a hole through the middle, as a share of the outline. */
const HOLES: Record<string, number> = { donut: 0.42 };

export const hole = (name: string) => HOLES[name] ?? 0;

/* Each shape's radii, scaled half way towards the circle's area. */
export function radii(name: string) {
  const shape = SHAPES[name] ?? SHAPES.circle;
  const r = Array.from({ length: SAMPLES }, (_, i) => shape(angle(i)));
  const area = r.reduce((sum, x) => sum + x * x, 0) / SAMPLES;
  const k = Math.pow(area, -0.25);
  return r.map((x) => x * k);
}
