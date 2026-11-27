/* Live glass shapes drawn into elements, ported from the brand document's
   useGlassViews hook (Code/Thrive/src/components/blocks/useGlassViews.ts).

   Every element inside `host` marked `data-glass="<shape>"` gets that shape
   in prism glass, filling its box and turning gently. `data-glass-cycle`
   lists shapes to morph through in turn, `data-ground` is the colour behind
   it for the glass to bend, and the nearest `[data-glass-clip]` trims it.
   One canvas lies over the host, under its type. */
import { hole, radii } from './shapes';
import {
  DOME,
  PRISM_STOPS,
  RISE,
  holeRings,
  prismLights,
  prismSettings,
  prismStudio,
  ringIndex,
  ringOut,
} from './prism';

export const GRADIENTS = [
  ['#6a3cff', '#ff2bb0', '#ff7a1a', '#ffc23a'],
  ['#2a3cff', '#22c8ee', '#6af5c4', '#d4ff5a'],
  ['#ff2b6a', '#ff5ab0', '#b06aff', '#5a3cff'],
  ['#ffd23a', '#ff9a1a', '#ff4a2a', '#ff2b8a'],
  ['#3affb0', '#3ad0ff', '#8a5cff', '#ff5ad0'],
  ['#ff3a1a', '#ff8a2a', '#ffd06a', '#fff0b0'],
];

/* Phones get a still picture of each shape instead of live glass, so
   they never download three.js (about 700KB) or run WebGL, which keeps
   scrolling smooth. Each shape names its picture with `data-still`
   (a file in src/assets/stills, rendered from the live glass). */
export const useStills = () => window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches;

const STILLS = import.meta.glob<string>('../../assets/stills/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function showStills(host: HTMLElement) {
  host.querySelectorAll<HTMLElement>('[data-glass][data-still]').forEach((el) => {
    const url = STILLS[`../../assets/stills/${el.dataset.still}.webp`];
    if (url) el.style.background = `url("${url}") center / contain no-repeat`;
  });
}

/* The most pixels per CSS pixel the glass is drawn at: full sharpness on
   desktops, less on touch screens (phones and tablets), where it barely
   shows and the saving keeps scrolling smooth. */
export const glassPixelRatio = () =>
  Math.min(window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches ? 1.25 : 2);

/* One WebGL renderer shared by every `local` mount (the service cards),
   drawing off screen; each card copies its picture onto its own canvas.
   Phones allow only a handful of WebGL contexts and each one costs, so
   six cards share one instead of having one each. */
type Three = typeof import('three');
let shared: { renderer: InstanceType<Three['WebGLRenderer']>; environment: InstanceType<Three['Texture']> } | null = null;
function sharedRenderer(THREE: Three) {
  if (!shared) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(glassPixelRatio());
    renderer.setScissorTest(true);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const environment = new THREE.PMREMGenerator(renderer).fromScene(prismStudio(THREE), 0).texture;
    shared = { renderer, environment };
  }
  return shared;
}

/* An element's position inside `root`, by layout. */
function offsetIn(el: HTMLElement, root: Element | null) {
  let x = 0;
  let y = 0;
  let at: HTMLElement | null = el;
  while (at && at !== root) {
    x += at.offsetLeft;
    y += at.offsetTop;
    at = at.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/* `local`: the canvas and its shapes sit inside one box that may turn in
   3D (a flip card); see the render loop. */
export function mountGlass(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  gradients = GRADIENTS,
  depth = 0.13,
  local = false,
) {
  let stop = () => {};
  let started = false;

  const start = async () => {
    started = true;
    if (useStills()) {
      showStills(host);
      return;
    }
    const THREE = await import('three');
    let renderer: InstanceType<typeof THREE.WebGLRenderer>;
    let environment: InstanceType<typeof THREE.Texture>;
    /* Local mounts draw with the shared renderer and copy onto their own
       canvas through a 2D context. */
    let copy: CanvasRenderingContext2D | null = null;
    try {
      if (local) {
        ({ renderer, environment } = sharedRenderer(THREE));
        copy = canvas.getContext('2d');
        if (!copy) return;
      } else {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(glassPixelRatio());
        renderer.setScissorTest(true);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        environment = new THREE.PMREMGenerator(renderer).fromScene(prismStudio(THREE), 0).texture;
      }
    } catch {
      return; // No WebGL: the page still works without the shape.
    }

    const dome = (side: number) =>
      Array.from({ length: DOME + 1 }, (_, k) => {
        const out = k / DOME;
        return { out, z: side * (depth + RISE * (1 - out * out)) };
      });
    const rings = holeRings([...dome(-1), { out: 1, z: -depth }, { out: 1, z: depth }, ...dome(1).reverse()]);

    /* One mesh per view; every shape uses the same vertices, so a morph
       only moves them. */
    const slab = () => {
      const samples = radii('circle').length;
      const positions = new Float32Array(rings.length * samples * 3);
      const tints = new Float32Array(positions.length);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(tints, 3));
      geometry.setIndex(ringIndex(rings.length, samples));
      const mix = new THREE.Color();
      const draw = (r: number[], inner: number, colours: InstanceType<typeof THREE.Color>[]) => {
        for (let j = 0; j < rings.length; j++) {
          const out = ringOut(rings[j], inner);
          for (let i = 0; i < samples; i++) {
            const k = (j * samples + i) * 3;
            const a = (i / samples) * Math.PI * 2;
            positions[k] = r[i] * out * Math.cos(a);
            positions[k + 1] = -r[i] * out * Math.sin(a);
            positions[k + 2] = rings[j].z;
          }
        }
        for (let k = 0; k < positions.length; k += 3) {
          const u = Math.min(0.999, Math.max(0, ((positions[k] + positions[k + 1]) * 0.7) / 2.4 + 0.5));
          const at = u * (colours.length - 1);
          const i = Math.floor(at);
          mix.copy(colours[i]).lerp(colours[i + 1], at - i);
          tints[k] = mix.r;
          tints[k + 1] = mix.g;
          tints[k + 2] = mix.b;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.computeVertexNormals();
      };
      return { geometry, draw };
    };
    const toColours = (stops: string[]) => stops.map((c) => new THREE.Color(c));
    const pick = (i: number) => gradients[i % (gradients.length || 1)] ?? PRISM_STOPS;

    const views = [...host.querySelectorAll<HTMLElement>('[data-glass]')].map((el, n) => {
      const scene = new THREE.Scene();
      /* `data-ground="auto"`: the ground is whatever colour the clipping
         box behind the shape is right now, read every frame, for a panel
         whose colour changes. */
      const clip = el.closest<HTMLElement>('[data-glass-clip]');
      const groundNow = () =>
        el.dataset.ground === 'auto' && clip
          ? getComputedStyle(clip).backgroundColor
          : el.dataset.ground === 'none'
            ? '#000000'
            : (el.dataset.ground ?? '#FFF2E6');
      const ground = groundNow();
      const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(ground), toneMapped: false }),
      );
      backdrop.position.z = -3;
      /* `data-ground="none"`: no ground drawn behind the shape, so it can
         pass over type or anything else on the page without a square of
         colour round it. The glass then can't bend what's behind it, so it
         is drawn more solid instead (see the material below). */
      const bare = el.dataset.ground === 'none';
      if (!bare) scene.add(backdrop);
      scene.environment = environment;
      scene.environmentIntensity = 2.2;
      prismLights(THREE, scene);

      const names = (el.dataset.glassCycle ?? el.dataset.glass ?? 'circle').split(',').map((x) => x.trim());
      const suite = names.map((name, k) => ({
        r: radii(name),
        inner: hole(name),
        colours: toColours(el.dataset.glassCycle ? pick(k) : pick(Number(el.dataset.gradient ?? n))),
      }));
      const { geometry, draw } = slab();
      draw(suite[0].r, suite[0].inner, suite[0].colours);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshPhysicalMaterial({
          ...prismSettings(THREE, depth),
          ...(bare ? { transmission: 0, opacity: 0.94 } : {}),
        }),
      );
      scene.add(mesh);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0, 5.6);

      /* Each shape held, then morphed into the next, round and round. */
      const morph =
        suite.length > 1
          ? (() => {
              const r = suite[0].r.slice();
              const colours = suite[0].colours.map((c) => c.clone());
              let last = -1;
              return (seconds: number) => {
                const hold = 1.35;
                const change = 1.4;
                const span = hold + change;
                const at = seconds % (span * suite.length);
                const from = Math.floor(at / span);
                const into = at - from * span - hold;
                const t = into <= 0 ? 0 : Math.min(1, into / change);
                const e = t * t * (3 - 2 * t);
                const key = from * 1000 + Math.round(e * 1000);
                if (key === last) return;
                last = key;
                const a = suite[from];
                const b = suite[(from + 1) % suite.length];
                for (let i = 0; i < r.length; i++) r[i] = a.r[i] + (b.r[i] - a.r[i]) * e;
                colours.forEach((c, i) => c.copy(a.colours[i]).lerp(b.colours[i], e));
                draw(r, a.inner + (b.inner - a.inner) * e, colours);
              };
            })()
          : null;
      /* A single shape whose `data-gradient` changes later blends from its
         colours to the new gradient's over a moment, rather than
         jumping. */
      const tint = morph
        ? null
        : (() => {
            const current = suite[0].colours.map((c) => c.clone());
            let key = el.dataset.gradient;
            let target: InstanceType<typeof THREE.Color>[] | null = null;
            return () => {
              if (el.dataset.gradient !== key) {
                key = el.dataset.gradient;
                target = toColours(pick(Number(key ?? n)));
              }
              if (!target) return;
              let done = true;
              current.forEach((c, i) => {
                c.lerp(target![i], 0.12);
                if (Math.abs(c.r - target![i].r) + Math.abs(c.g - target![i].g) + Math.abs(c.b - target![i].b) > 0.004)
                  done = false;
              });
              if (done) {
                current.forEach((c, i) => c.copy(target![i]));
                target = null;
              }
              draw(suite[0].r, suite[0].inner, current);
            };
          })();
      return { el, clip, scene, camera, mesh, morph, tint, phase: n * 0.9, backdrop, ground, groundNow };
    });

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let onScreen = true;
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    });
    seen.observe(host);

    const render = (time: number) => {
      if (!onScreen) {
        frame = requestAnimationFrame(render);
        return;
      }
      /* Local: sized and placed by layout, not by what's on screen, so a
         canvas inside something turning in 3D keeps its size and
         positions as it turns. */
      const box = canvas.getBoundingClientRect();
      const width = local ? canvas.offsetWidth : Math.round(box.width);
      const height = local ? canvas.offsetHeight : Math.round(box.height);
      const ratio = renderer.getPixelRatio();
      const target = copy ? renderer.domElement : canvas;
      if (target.width !== Math.round(width * ratio) || target.height !== Math.round(height * ratio))
        renderer.setSize(width, height, false);
      if (copy && (canvas.width !== target.width || canvas.height !== target.height)) {
        canvas.width = target.width;
        canvas.height = target.height;
      }
      renderer.setScissor(0, 0, width, height);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      const t = still ? 0 : time / 1000;
      for (const v of views) {
        let left: number;
        let bottom: number;
        let at: { width: number; height: number };
        if (local) {
          const p = offsetIn(v.el, canvas.offsetParent);
          at = { width: v.el.offsetWidth, height: v.el.offsetHeight };
          left = p.x - canvas.offsetLeft;
          bottom = height - (p.y - canvas.offsetTop + at.height);
        } else {
          const r = v.el.getBoundingClientRect();
          at = r;
          left = r.left - box.left;
          bottom = box.bottom - r.bottom;
        }
        if (!at.width || !at.height) continue;
        renderer.setViewport(left, bottom, at.width, at.height);
        let sx = left;
        let sy = bottom;
        let sw = at.width;
        let sh = at.height;
        if (local) {
          /* Trimmed to the canvas itself. */
          const x1 = Math.max(sx, 0);
          const y1 = Math.max(sy, 0);
          sw = Math.min(sx + sw, width) - x1;
          sh = Math.min(sy + sh, height) - y1;
          sx = x1;
          sy = y1;
        } else if (v.clip) {
          const c = v.clip.getBoundingClientRect();
          const cl = c.left - box.left;
          const cb = box.bottom - c.bottom;
          const x1 = Math.max(sx, cl);
          const y1 = Math.max(sy, cb);
          sw = Math.min(sx + sw, cl + c.width) - x1;
          sh = Math.min(sy + sh, cb + c.height) - y1;
          sx = x1;
          sy = y1;
        }
        if (sw <= 0 || sh <= 0) continue;
        renderer.setScissor(sx, sy, sw, sh);
        v.camera.aspect = at.width / at.height;
        v.camera.updateProjectionMatrix();
        if (v.el.dataset.ground === 'auto') {
          const g = v.groundNow();
          if (g !== v.ground) {
            v.ground = g;
            (v.backdrop.material as InstanceType<typeof THREE.MeshBasicMaterial>).color.set(g);
          }
        }
        v.morph?.(t);
        v.tint?.();
        v.mesh.rotation.x = Math.sin(t * 0.5 + v.phase) * 0.3;
        v.mesh.rotation.y = Math.sin(t * 0.4 + v.phase * 1.3) * 0.45;
        /* A turn in the picture plane, in radians, set from outside (the
           rolling donut). */
        v.mesh.rotation.z = Number(v.el.dataset.spin ?? 0);
        renderer.render(v.scene, v.camera);
      }
      /* Shared renderer: copy this frame onto the card's own canvas. */
      if (copy) {
        copy.clearRect(0, 0, canvas.width, canvas.height);
        copy.drawImage(renderer.domElement, 0, 0);
      }
      if (!still) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    stop = () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
      if (!copy) renderer.dispose();
    };
  };

  const watch = new IntersectionObserver(
    (entries) => {
      if (!started && entries.some((e) => e.isIntersecting)) void start();
    },
    { rootMargin: '50% 0px' },
  );
  watch.observe(host);
  return () => {
    watch.disconnect();
    stop();
  };
}
