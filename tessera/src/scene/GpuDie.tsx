/**
 * The GPU die — the application's central visual motif.
 *
 * A 32-tile silicon lattice, one tile per GPU in the cluster under appraisal,
 * rendered in perspective. It is not decoration: every visual property is bound
 * to a number from the model.
 *
 *   tile lit / dark        one per GPU, lit share = peak utilisation
 *   emissive hue           cyan at low thermal load, shifting toward iris as
 *                          the cluster runs hotter (i.e. as utilisation rises)
 *   tile height            lifts with utilisation, so the die visibly "loads"
 *   scan pulse             a wave crossing the die, period tied to project life
 *   token stream           particles crossing the lattice — cyan for internally
 *                          consumed GPU-hours, magenta for hours resold
 *
 * Falls back to the DOM lattice when WebGL is unavailable or the user has asked
 * for reduced motion; that fallback lives in ColdBoot.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

const COLUMNS = 8;
const ROWS = 4;
const TILE = 0.54;
/**
 * Generous relative to the tile, because rows run away from the camera and are
 * heavily foreshortened — a gap that looks ample in plan closes up to nothing
 * at this viewing angle and the rows merge into solid strips.
 */
const GAP = 0.17;
const PITCH = TILE + GAP;

const COLOUR = {
  photon: new THREE.Color('#38e8ff'),
  plasma: new THREE.Color('#ff4fd8'),
  dark: new THREE.Color('#0b0e16'),
};

/** Hue positions of the palette colours the die interpolates between. */
const HUE_PHOTON = 0.519; // #38e8ff
const HUE_IRIS = 0.686; // #8b7cff

export interface DieProps {
  /** Fraction of tiles lit, 0..1. */
  utilisation: number;
  /** 0..1 — drives the cyan to amber shift and the intensity of the glow. */
  thermal: number;
  /** Share of lit hours consumed internally, 0..1. Colours the token stream. */
  internalShare: number;
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

interface TileSpec {
  index: number;
  x: number;
  z: number;
  /** Distance from die centre, 0..1 — used to stagger the boot animation. */
  radial: number;
}

function useTileSpecs(): TileSpec[] {
  return useMemo(() => {
    const specs: TileSpec[] = [];
    const originX = (-(COLUMNS - 1) * PITCH) / 2;
    const originZ = (-(ROWS - 1) * PITCH) / 2;
    const maxRadial = Math.hypot(originX, originZ);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLUMNS; c++) {
        const x = originX + c * PITCH;
        const z = originZ + r * PITCH;
        specs.push({
          index: r * COLUMNS + c,
          x,
          z,
          radial: Math.hypot(x, z) / maxRadial,
        });
      }
    }
    return specs;
  }, []);
}

function Tiles({ utilisation, thermal }: { utilisation: number; thermal: number }) {
  const specs = useTileSpecs();
  const litCount = Math.round(specs.length * utilisation);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colour = useMemo(() => new THREE.Color(), []);

  /**
   * The per-instance colour buffer must exist before the material's shader is
   * compiled. Three.js creates it lazily on the first setColorAt call, and if
   * that first call happens inside useFrame the program has already been built
   * without USE_INSTANCING_COLOR — every tile then renders at the material's
   * plain white and the entire thermal reading is lost. Allocating it up front
   * in a layout effect avoids depending on that ordering.
   */
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(specs.length * 3).fill(1),
      3,
    );
    mesh.instanceColor.needsUpdate = true;
    // The material is a single material here, but the typed property allows an
    // array, so narrow before touching it.
    if (!Array.isArray(mesh.material)) mesh.material.needsUpdate = true;
  }, [specs.length]);

  // Per-tile colour is written once per frame into the instance colour buffer.
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();

    for (const spec of specs) {
      const isLit = spec.index < litCount;

      // A wave travelling across the die on the x axis, so the surface reads as
      // active silicon rather than a static grid.
      const scan = Math.sin(t * 0.9 - spec.x * 0.55) * 0.5 + 0.5;
      const breathe = Math.sin(t * 0.6 + spec.radial * 2.4) * 0.5 + 0.5;

      // Kept deliberately thin. At this viewing angle the side faces of a
      // tall tile occlude the gap to the row behind it, and the lattice reads
      // as eight solid strips however wide the gap is made.
      const lift = isLit ? 0.028 + scan * 0.022 + utilisation * 0.03 : 0.008;
      dummy.position.set(spec.x, lift / 2, spec.z);
      dummy.scale.set(1, Math.max(lift, 0.006) / 0.06, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(spec.index, dummy.matrix);

      if (isLit) {
        /**
         * Interpolated in HSL, along the hue arc from photon cyan to iris.
         *
         * The obvious approach — lerping the RGB values of two palette colours —
         * produces mud whenever the endpoints sit far apart on the colour wheel,
         * because the straight line between them passes through the desaturated
         * centre. Cyan and amber are very nearly complementary, so that path ran
         * straight through grey and every lit tile rendered as blue-grey.
         *
         * Lightness is deliberately capped well below 1.0: these values feed an
         * unclamped bloom pass, and anything near full brightness clips to white,
         * destroying the hue that carries the thermal reading.
         */
        const hue = HUE_PHOTON + (HUE_IRIS - HUE_PHOTON) * (thermal * 0.5 + scan * 0.32);
        const lightness = 0.15 + scan * 0.17 + breathe * 0.05;
        colour.setHSL(hue, 0.92, lightness);
      } else {
        colour.copy(COLOUR.dark);
      }
      mesh.setColorAt(spec.index, colour);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, specs.length]}
      castShadow={false}
    >
      <boxGeometry args={[TILE, 0.06, TILE]} />
      {/* toneMapped off so the emissive colours reach the bloom pass at full strength */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** The substrate the tiles sit on, plus its glowing rim. */
function Substrate() {
  const width = COLUMNS * PITCH + 0.5;
  const depth = ROWS * PITCH + 0.5;
  return (
    <group position={[0, -0.06, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color="#0a0d14" toneMapped={false} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(width, depth)]} />
        <lineBasicMaterial color="#1d3a4a" toneMapped={false} />
      </lineSegments>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Token stream — cash flowing through the cluster
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 700;

function TokenStream({ internalShare, thermal }: { internalShare: number; thermal: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colours, speeds, offsets } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colours = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const offsets = new Float32Array(PARTICLE_COUNT);

    const spanX = COLUMNS * PITCH;
    const spanZ = ROWS * PITCH;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spanX;
      positions[i * 3 + 1] = 0.05 + Math.random() * 0.34;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spanZ;

      // Cyan for internally consumed hours, magenta for hours resold. The split
      // is the model's internal share, so the stream shows the revenue mix.
      const c = Math.random() < internalShare ? COLOUR.photon : COLOUR.plasma;
      colours[i * 3] = c.r;
      colours[i * 3 + 1] = c.g;
      colours[i * 3 + 2] = c.b;

      speeds[i] = 0.35 + Math.random() * 0.75;
      offsets[i] = Math.random() * 100;
    }
    return { positions, colours, speeds, offsets };
  }, [internalShare]);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) return;
    const attr = points.geometry.attributes.position as THREE.BufferAttribute;
    const array = attr.array as Float32Array;
    const spanX = COLUMNS * PITCH;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      array[i * 3] += speeds[i] * delta * (0.6 + thermal * 0.8);
      // Gentle vertical drift so the stream does not read as flat.
      array[i * 3 + 1] += Math.sin(offsets[i] + array[i * 3] * 2) * delta * 0.04;

      if (array[i * 3] > spanX / 2) {
        array[i * 3] = -spanX / 2;
        array[i * 3 + 1] = 0.05 + Math.random() * 0.34;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colours, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.028}
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------

/**
 * Slow drift, so the die feels alive without demanding attention.
 *
 * The camera looks at the die's centre. Separation from the title comes from the
 * canvas occupying only the lower part of the viewport, NOT from aiming the
 * camera above the die — doing that tilts the view toward the horizon and the
 * lattice ends up seen edge-on from ground level.
 */
function Rig() {
  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    camera.position.x = Math.sin(t * 0.12) * 0.38;
    camera.position.y = 4.8 + Math.sin(t * 0.17) * 0.14;
    camera.position.z = 3.6;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function GpuDie({ utilisation, thermal, internalShare }: DieProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 4.8, 3.6], fov: 32 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <fog attach="fog" args={['#07080c', 5.5, 11]} />
      <Rig />
      <Substrate />
      <Tiles utilisation={utilisation} thermal={thermal} />
      <TokenStream internalShare={internalShare} thermal={thermal} />
      <EffectComposer>
        <Bloom
          intensity={0.85}
          luminanceThreshold={0.22}
          luminanceSmoothing={0.4}
          mipmapBlur
          radius={0.6}
        />
        <Vignette eskil={false} offset={0.3} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  );
}
