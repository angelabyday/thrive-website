/* "Change": each letter, under the pointer, shrinks away as a glass shape
   flips up in its place and pushes its neighbours along. Ported from the
   brand document's letters-to-3D-glass-shapes sheet
   (Code/Thrive/src/components/blocks/ShapeWord3D.tsx), with that sheet's
   settings fixed: prism glass, sharp edges, each shape at a tilt of its own.

   Markup it expects inside `root`:
   - `[data-word]`: the word, its letters as `[data-letter] > [data-glyph]`
   - `[data-depth]`: an empty box laid over the word for the canvas */
import gsap from 'gsap';
import { hole, radii } from './shapes';
import {
  DOME,
  RISE,
  holeRings,
  prismLights,
  prismSettings,
  prismStudio,
  ringIndex,
  ringOut,
} from './prism';
import { GRADIENTS, glassPixelRatio } from './glass';

const SHAPES = ['seal', 'sunburst', 'clover', 'plus', 'flower', 'donut', 'diamond', 'domes', 'spokes', 'circle'];
const DEPTH = 0.13;
/* Each shape lands at an angle of its own, so its depth shows (a gentle
   one). */
const TILT = 0.6;
/* How big each shape is against a capital letter. */
const SIZE = 0.85;
/* The least time, in ms, a shape stays once it has come in. */
const HOLD = 1000;

export function mountChangeWord(root: HTMLElement, ground: string) {
  const line = root.querySelector<HTMLElement>('[data-word]');
  const host = root.querySelector<HTMLElement>('[data-depth]');
  if (!line || !host) return () => {};
  const boxes = [...line.querySelectorAll<HTMLElement>('[data-letter]')];
  const glyphs = boxes.map((b) => b.querySelector<HTMLElement>('[data-glyph]')!);
  const word = boxes.map((b) => b.textContent ?? '').join('');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = still ? 0 : 1;

  const shown: boolean[] = [];
  const shownAt: number[] = [];
  const waiting: (number | undefined)[] = [];
  let turn: (i: number, on: boolean) => void = () => {};
  let capHeight = 0.7;
  let stop = () => {};
  let live = true;

  /* The scene loads once the footer comes near. */
  const start = async () => {
    const THREE = await import('three');
    await document.fonts.ready;
    if (!live) return;

    let renderer: InstanceType<typeof THREE.WebGLRenderer>;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // No WebGL: the word stays as plain type.
    }
    renderer.setPixelRatio(glassPixelRatio());
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(prismStudio(THREE), 0).texture;
    scene.environmentIntensity = 2.2;
    const key = new THREE.DirectionalLight(0xffffff, 1);
    key.position.set(-0.6, 1, 1.2);
    scene.add(key, key.target);
    prismLights(THREE, scene);

    /* Light in the footer's own colour from all round, from opposite the
       key light and from behind, so the glass picks the colour up. On a
       pale ground, less of it, so the gradient keeps its body. */
    const panel = new THREE.Color(ground);
    const lum = 0.2126 * panel.r + 0.7152 * panel.g + 0.0722 * panel.b;
    const pale = Math.max(0, lum - 0.5) / 0.5;
    const tint = (c: InstanceType<typeof THREE.Color>) => c.set(0xffffff).lerp(panel, 1 - pale * 0.6);
    const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.9);
    tint(fill.color);
    tint(fill.groundColor);
    const bounce = new THREE.DirectionalLight(0xffffff, 3.4);
    bounce.position.set(0.7, -0.8, 0.6);
    tint(bounce.color);
    const behind = new THREE.DirectionalLight(0xffffff, 3);
    behind.position.set(0, 0.3, -1);
    tint(behind.color);
    scene.add(fill, bounce, behind);

    const camera = new THREE.PerspectiveCamera(30, 1, 1, 10000);

    /* Per shape: its radii, and how far its drawn bottom sits above the
       bottom of its box and its middle off the box's middle. */
    const suite = SHAPES.map((name) => {
      const r = radii(name);
      const xs = r.map((x, k) => x * Math.cos((k / r.length) * Math.PI * 2));
      const ys = r.map((x, k) => x * Math.sin((k / r.length) * Math.PI * 2));
      return { r, inner: hole(name), lift: 1 - Math.max(...ys), off: (Math.min(...xs) + Math.max(...xs)) / 2 };
    });
    const samples = suite[0].r.length;

    /* The letters' metrics in em, from the face itself. */
    const style = getComputedStyle(line);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const px = 1000;
    ctx.font = `${style.fontWeight} ${px}px ${style.fontFamily}`;
    const cap = ctx.measureText('H').actualBoundingBoxAscent / px;
    capHeight = cap;
    const box = ctx.measureText(word);
    const ascent = box.fontBoundingBoxAscent / px;
    const descent = box.fontBoundingBoxDescent / px;
    const baseline = (1 - ascent - descent) / 2 + ascent;

    const dome = (side: number) =>
      Array.from({ length: DOME + 1 }, (_, k) => {
        const out = k / DOME;
        return { out, z: side * (DEPTH + RISE * (1 - out * out)) };
      });
    const rings = holeRings([...dome(-1), { out: 1, z: -DEPTH }, { out: 1, z: DEPTH }, ...dome(1).reverse()]);
    const index = ringIndex(rings.length, samples);
    const cos = Array.from({ length: samples }, (_, i) => Math.cos((i / samples) * Math.PI * 2));
    const sin = Array.from({ length: samples }, (_, i) => Math.sin((i / samples) * Math.PI * 2));

    /* One slab per letter, its outline set to whichever shape it shows. */
    const slabs = boxes.map((_, i) => {
      const positions = new Float32Array(rings.length * samples * 3);
      const tints = new Float32Array(positions.length);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(tints, 3));
      geometry.setIndex(index);
      const material = new THREE.MeshPhysicalMaterial(prismSettings(THREE, DEPTH));
      material.opacity += pale * 0.15;
      material.attenuationColor.setScalar(1 - pale * 0.5);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      return { positions, tints, geometry, material, mesh, k: i % SHAPES.length, unit: 1 };
    });

    const outline = (slab: (typeof slabs)[number], k: number) => {
      const { r, inner } = suite[k];
      for (let j = 0; j < rings.length; j++) {
        const out = ringOut(rings[j], inner);
        const { z } = rings[j];
        for (let i = 0; i < samples; i++) {
          const at = (j * samples + i) * 3;
          slab.positions[at] = r[i] * out * cos[i];
          slab.positions[at + 1] = -r[i] * out * sin[i];
          slab.positions[at + 2] = z;
        }
      }
      slab.geometry.attributes.position.needsUpdate = true;
      slab.geometry.computeVertexNormals();
      slab.k = k;
    };

    /* Puts letter i's slab in the middle of the room its letter has made,
       sitting on the baseline, as tall as a capital. */
    let width = 1;
    let height = 1;
    const place = (i: number) => {
      const em = parseFloat(getComputedStyle(line).fontSize);
      const at = boxes[i].getBoundingClientRect();
      const frame = host.getBoundingClientRect();
      const { lift, off } = suite[slabs[i].k];
      const unit = (cap / 2) * em * SIZE;
      const left = at.left - frame.left + at.width / 2 - unit - off * unit;
      const top = at.top - frame.top + baseline * em - 2 * unit + lift * unit + 0.04 * em;
      slabs[i].mesh.position.set(left + unit - width / 2, height / 2 - (top + unit), 0);
      slabs[i].unit = unit;
      slabs[i].material.attenuationDistance = DEPTH * 8 * unit * (1 - pale * 0.7);
    };

    const fit = () => {
      width = host.clientWidth;
      height = host.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.z = height / 2 / Math.tan((camera.fov * Math.PI) / 360);
      camera.updateProjectionMatrix();
      boxes.forEach((_, i) => place(i));
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(host);

    /* How far in each slab is, 0 to 1. */
    const grow = slabs.map(() => ({ p: 0 }));
    let lastShown = -1;
    turn = (i, on) => {
      const slab = slabs[i];
      if (on) {
        /* Any shape but the one this letter showed last and the last one
           shown anywhere in the word. */
        const pool = SHAPES.map((_, n) => n).filter((n) => n !== slab.k && n !== lastShown);
        const k = pool[Math.floor(Math.random() * pool.length)];
        lastShown = k;
        outline(slab, k);
        place(i);
        grow[i].p = 0;
      }
      slab.mesh.visible = true;
      gsap.to(grow[i], {
        p: on ? 1 : 0,
        duration: (on ? 0.6 : 0.25) * t,
        ease: on ? 'back.out(1.6)' : 'power2.in',
        overwrite: 'auto',
        onComplete: () => {
          if (!on) slab.mesh.visible = false;
        },
      });
    };
    slabs.forEach((slab, i) => outline(slab, i % SHAPES.length));
    /* Any letters turned before the scene was ready get their shapes now. */
    shown.forEach((on, i) => on && turn(i, true));

    /* A gradient through each slab's glass, its direction turning slowly
       so the colours drift. */
    const palettes = GRADIENTS.map((set) => set.map((c) => new THREE.Color(c)));
    const mix = new THREE.Color();
    const paint = (slab: (typeof slabs)[number], angle: number) => {
      const stops = palettes[slab.k % palettes.length];
      const cx = Math.cos(angle);
      const cy = Math.sin(angle);
      const { positions, tints } = slab;
      for (let k = 0; k < positions.length; k += 3) {
        const u = Math.min(0.999, Math.max(0, (positions[k] * cx + positions[k + 1] * cy) / 2.4 + 0.5));
        const at = u * (stops.length - 1);
        const n = Math.floor(at);
        mix.copy(stops[n]).lerp(stops[n + 1], at - n);
        tints[k] = mix.r;
        tints[k + 1] = mix.g;
        tints[k + 2] = mix.b;
      }
      slab.geometry.attributes.color.needsUpdate = true;
    };
    const clock = new THREE.Clock();

    /* A random angle for a shape: leaning back or forward, turned either
       way by a clear amount, and rolled a little. */
    const spread = (lo: number, hi: number) => (lo + Math.random() * (hi - lo)) * (Math.random() < 0.5 ? -1 : 1);
    const roll = () => ({ x: spread(0.15, 0.45), y: spread(0.3, 0.7), z: spread(0, 0.25) });
    const angles = slabs.map(roll);

    /* The slabs lean gently towards the pointer. */
    const aim = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };
    const point = (e: PointerEvent) => {
      const at = host.getBoundingClientRect();
      aim.x = ((e.clientX - at.left) / at.width) * 2 - 1;
      aim.y = ((e.clientY - at.top) / at.height) * 2 - 1;
    };
    window.addEventListener('pointermove', point);

    let onScreen = true;
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    });
    seen.observe(host);

    renderer.setAnimationLoop(() => {
      if (!onScreen) return;
      lean.x += (aim.x - lean.x) * 0.06;
      lean.y += (aim.y - lean.y) * 0.06;
      const now = clock.getElapsedTime();
      slabs.forEach((slab, i) => {
        if (!slab.mesh.visible) return;
        paint(slab, 0.6 + now * 0.15 + i);
        slab.material.emissive.copy(panel).multiplyScalar(0.25);
        /* The letters move as their neighbours make room. */
        place(i);
        const { p } = grow[i];
        const size = Math.max(0.001, p) * slab.unit;
        slab.mesh.scale.set(size, size, size);
        /* Flips up from edge-on as it grows, settling at an angle of its
           own, swaying slowly. */
        if (p <= 0.001) angles[i] = roll();
        const held = Math.min(1, p) * TILT;
        const a = angles[i];
        slab.mesh.rotation.set(
          lean.y * 0.4 + held * a.x,
          (1 - Math.min(1, p)) * -Math.PI * 0.5 + lean.x * 0.5 + held * (a.y + Math.sin(now * 0.7 + i * 1.9) * 0.15),
          held * a.z,
        );
      });
      renderer.render(scene, camera);
    });

    stop = () => {
      seen.disconnect();
      renderer.setAnimationLoop(null);
      window.removeEventListener('pointermove', point);
      resize.disconnect();
      slabs.forEach((slab) => {
        slab.geometry.dispose();
        slab.material.dispose();
      });
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      turn = () => {};
    };
  };

  /* However quickly the pointer passes, a shape comes all the way in and
     holds a moment before it goes. */
  const run = (i: number, on: boolean) => {
    if (shown[i] === on || (!on && !shown[i])) return;
    shown[i] = on;
    if (on) shownAt[i] = performance.now();
    gsap.to(glyphs[i], {
      scale: on ? 0.5 : 1,
      opacity: on ? 0 : 1,
      duration: (on ? 0.2 : 0.35) * t,
      ease: on ? 'power2.in' : 'back.out(1.6)',
      overwrite: 'auto',
    });
    turn(i, on);
    /* The letter's room opens to the shape's width, moving the letters
       beside it along, and closes back when it goes. */
    const letter = boxes[i];
    if (!letter.dataset.natural) letter.dataset.natural = String(letter.getBoundingClientRect().width);
    const em = parseFloat(getComputedStyle(letter).fontSize);
    gsap.to(letter, {
      width: on ? capHeight * 1.15 * SIZE * em : Number(letter.dataset.natural),
      duration: (on ? 0.5 : 0.4) * t,
      ease: on ? 'back.out(1.4)' : 'power2.inOut',
      overwrite: 'auto',
      onComplete: () => {
        if (!on) {
          gsap.set(letter, { clearProps: 'width' });
          delete letter.dataset.natural;
        }
      },
    });
  };
  const swap = (i: number, on: boolean) => {
    window.clearTimeout(waiting[i]);
    waiting[i] = undefined;
    if (on || !shown[i]) return run(i, on);
    const wait = HOLD - (performance.now() - (shownAt[i] ?? 0));
    if (wait <= 0) return run(i, false);
    waiting[i] = window.setTimeout(() => run(i, false), wait);
  };

  const listeners = boxes.map((letter, i) => {
    const enter = (e: PointerEvent) => e.pointerType === 'mouse' && swap(i, true);
    const leave = (e: PointerEvent) => e.pointerType === 'mouse' && swap(i, false);
    const tap = () => swap(i, !shown[i]);
    letter.addEventListener('pointerenter', enter);
    letter.addEventListener('pointerleave', leave);
    letter.addEventListener('click', tap);
    return () => {
      letter.removeEventListener('pointerenter', enter);
      letter.removeEventListener('pointerleave', leave);
      letter.removeEventListener('click', tap);
    };
  });

  let started = false;
  const watch = new IntersectionObserver(
    (entries) => {
      if (!started && entries.some((e) => e.isIntersecting)) {
        started = true;
        void start();
      }
    },
    { rootMargin: '50% 0px' },
  );
  watch.observe(root);

  return () => {
    live = false;
    watch.disconnect();
    listeners.forEach((off) => off());
    stop();
  };
}
