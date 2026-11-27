/* The prism glass finish, ported from the brand document
   (Code/Thrive/src/components/blocks/ShapeShift3D.tsx). */
import type * as ThreeNS from 'three';

type Three = typeof ThreeNS;

/* How far the middle of a face rises, against a radius of 1, and the
   rings across it. */
export const RISE = 0.07;
export const DOME = 12;

export type Ring = { out: number; z: number; inner?: boolean };

/* The rings run on round an inner edge and back to the start, so the
   slab is a closed loop that can open a hole when morphing to a donut. */
export function holeRings(rings: Ring[]): Ring[] {
  const inner = rings
    .slice(1, -1)
    .reverse()
    .map((g) => ({ ...g, inner: true }));
  return [...rings, ...inner];
}

const MIDDLE = (1 + 0.42) / (2 * 0.42);

export function ringOut(g: Ring, h: number) {
  const m = Math.min(1, h * MIDDLE);
  return g.inner ? m - (m - h) * g.out : m + (1 - m) * g.out;
}

export function ringIndex(count: number, samples: number) {
  const index: number[] = [];
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < samples; i++) {
      const a = j * samples + i;
      const b = j * samples + ((i + 1) % samples);
      const c = ((j + 1) % count) * samples + i;
      const d = ((j + 1) % count) * samples + ((i + 1) % samples);
      index.push(a, c, b, b, c, d);
    }
  }
  return index;
}

/* A dark studio of soft coloured light for the glass to reflect. */
export function prismStudio(THREE: Three) {
  const room = new THREE.Scene();
  room.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(20, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x07060c, side: THREE.BackSide }),
    ),
  );
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, 'rgba(255,255,255,1)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 128, 128);
  const soft = new THREE.CanvasTexture(canvas);
  const panel = (w: number, h: number, x: number, y: number, z: number, colour: number, bright: number) => {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.8, h * 1.8),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colour).multiplyScalar(bright),
        map: soft,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    light.position.set(x, y, z);
    light.lookAt(0, 0, 0);
    room.add(light);
  };
  panel(10, 10, 7, 6, 3, 0x6a3cff, 3);
  panel(10, 10, -7, -5, 3, 0xff7a1a, 3);
  panel(2, 12, -9, 3, -1, 0xff2bb0, 3.5);
  panel(2, 12, 9, -3, -2, 0x3a7bff, 2.5);
  panel(12, 3, 0, -9, 1, 0xffc23a, 2);
  panel(8, 8, -6, 0, -8, 0xff3cc8, 4);
  panel(8, 8, 6, 0, -8, 0xffb03a, 4);
  panel(8, 8, 0, 6, -8, 0x8a5cff, 4);
  panel(8, 8, 0, -6, -8, 0xff6a2a, 4);
  return room;
}

export function prismSettings(THREE: Three, depth: number) {
  return {
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.08,
    transmission: 0.75,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    side: THREE.DoubleSide,
    ior: 1.5,
    dispersion: 0.6,
    thickness: depth * 2,
    iridescence: 1,
    iridescenceIOR: 1.4,
    iridescenceThicknessRange: [250, 650] as [number, number],
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    vertexColors: true,
  };
}

export function prismLights(THREE: Three, scene: ThreeNS.Scene) {
  const rim = (colour: number, x: number, y: number) => {
    const light = new THREE.DirectionalLight(colour, 3);
    light.position.set(x, y, -1.2);
    scene.add(light);
  };
  rim(0xff3cc8, 1.8, 0.5);
  rim(0xffa040, -1.8, -0.7);
  rim(0x8a5cff, 0.2, 1.8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.6));
}

export const PRISM_STOPS = ['#6a3cff', '#ff2bb0', '#ff7a1a', '#ffc23a'];
