/**
 * The GPU die — the application's central visual motif, and an inspectable one.
 *
 * A 32-tile silicon lattice, one tile per GPU in the cluster under appraisal,
 * rendered in perspective. It is not decoration: every visual property is bound
 * to a number from the model.
 *
 *   tile lit / dark        one per GPU, lit share = peak utilisation
 *   emissive hue           cyan at low thermal load, shifting toward iris as
 *                          the cluster runs hotter (i.e. as utilisation rises)
 *   tile height            lifts with utilisation, so the die visibly "loads"
 *   scan pulse             a wave crossing the die
 *   token stream           particles crossing the lattice — cyan for internally
 *                          consumed GPU-hours, magenta for hours resold
 *
 * Interaction: drag to orbit, click a tile to inspect it. Wheel zoom is
 * deliberately NOT bound. The canvas is full-bleed behind the hero, so capturing
 * the wheel would trap the page scroll whenever the cursor sat over it — zoom is
 * offered on explicit controls instead.
 *
 * Falls back to a static DOM lattice when WebGL is unavailable or the user has
 * asked for reduced motion; that fallback lives in ColdBoot.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
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

export const TILE_TOTAL = COLUMNS * ROWS;

const COLOUR = {
  photon: new THREE.Color('#38e8ff'),
  plasma: new THREE.Color('#ff4fd8'),
  amber: new THREE.Color('#ffb547'),
  dark: new THREE.Color('#0b0e16'),
};

/** Hue positions of the palette colours the die interpolates between. */
const HUE_PHOTON = 0.519; // #38e8ff
const HUE_IRIS = 0.686; // #8b7cff

const MIN_DISTANCE = 3.4;
const MAX_DISTANCE = 9;
const HOME = new THREE.Vector3(0, 4.8, 3.6);

export interface DieProps {
  /** Fraction of tiles lit, 0..1. */
  utilisation: number;
  /** 0..1 — drives the hue shift and the intensity of the glow. */
  thermal: number;
  /** Share of lit hours consumed internally, 0..1. Colours the token stream. */
  internalShare: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  /** Bumped by the caller to request a zoom step; direction gives the sign. */
  zoomCommand: { direction: 1 | -1; seq: number } | null;
  /** Bumped by the caller to request a return to the default view. */
  resetSeq: number;
}

// ---------------------------------------------------------------------------
// Tile geometry
// ---------------------------------------------------------------------------

export interface TileSpec {
  index: number;
  x: number;
  z: number;
  /** Distance from die centre, 0..1. */
  radial: number;
  row: number;
  column: number;
}

export const TILE_SPECS: TileSpec[] = (() => {
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
        row: r + 1,
        column: c + 1,
      });
    }
  }
  return specs;
})();

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

function Tiles({
  utilisation,
  thermal,
  selectedIndex,
  hoveredIndex,
  onSelect,
  onHover,
}: {
  utilisation: number;
  thermal: number;
  selectedIndex: number | null;
  hoveredIndex: number | null;
  onSelect: (index: number | null) => void;
  onHover: (index: number | null) => void;
}) {
  const litCount = Math.round(TILE_TOTAL * utilisation);

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
      new Float32Array(TILE_TOTAL * 3).fill(1),
      3,
    );
    mesh.instanceColor.needsUpdate = true;
    // The material is a single material here, but the typed property allows an
    // array, so narrow before touching it.
    if (!Array.isArray(mesh.material)) mesh.material.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();

    for (const spec of TILE_SPECS) {
      const isLit = spec.index < litCount;
      const isSelected = spec.index === selectedIndex;
      const isHovered = spec.index === hoveredIndex;

      // A wave travelling across the die on the x axis, so the surface reads as
      // active silicon rather than a static grid.
      const scan = Math.sin(t * 0.9 - spec.x * 0.55) * 0.5 + 0.5;
      const breathe = Math.sin(t * 0.6 + spec.radial * 2.4) * 0.5 + 0.5;

      // Kept deliberately thin. At this viewing angle the side faces of a
      // tall tile occlude the gap to the row behind it, and the lattice reads
      // as eight solid strips however wide the gap is made.
      let lift = isLit ? 0.028 + scan * 0.022 + utilisation * 0.03 : 0.008;
      if (isSelected) lift += 0.1;
      else if (isHovered) lift += 0.04;

      dummy.position.set(spec.x, lift / 2, spec.z);
      dummy.scale.set(1, Math.max(lift, 0.006) / 0.06, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(spec.index, dummy.matrix);

      if (isSelected) {
        colour.copy(COLOUR.amber).multiplyScalar(0.5);
      } else if (isLit) {
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
        const lightness = (0.15 + scan * 0.17 + breathe * 0.05) * (isHovered ? 1.5 : 1);
        colour.setHSL(hue, 0.92, Math.min(lightness, 0.42));
      } else {
        colour.copy(COLOUR.dark).multiplyScalar(isHovered ? 3.5 : 1);
      }
      mesh.setColorAt(spec.index, colour);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, TILE_TOTAL]}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) onHover(e.instanceId);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId === undefined) return;
        onSelect(e.instanceId === selectedIndex ? null : e.instanceId);
      }}
    >
      <boxGeometry args={[TILE, 0.06, TILE]} />
      {/* toneMapped off so the emissive colours reach the bloom pass at full strength */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** Amber outline drawn around the selected tile. */
function SelectionMarker({ index }: { index: number | null }) {
  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(TILE * 1.24, 0.26, TILE * 1.24)),
    [],
  );
  if (index === null) return null;
  const spec = TILE_SPECS[index];
  if (!spec) return null;

  return (
    <lineSegments
      geometry={geometry}
      position={[spec.x, 0.13, spec.z]}
      raycast={() => null}
    >
      <lineBasicMaterial color="#ffb547" toneMapped={false} transparent opacity={0.95} />
    </lineSegments>
  );
}

/** The substrate the tiles sit on, plus its rim. */
function Substrate() {
  const width = COLUMNS * PITCH + 0.5;
  const depth = ROWS * PITCH + 0.5;
  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, depth)),
    [width, depth],
  );
  return (
    <group position={[0, -0.06, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color="#0a0d14" toneMapped={false} />
      </mesh>
      <lineSegments
        geometry={edges}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        raycast={() => null}
      >
        <lineBasicMaterial color="#1d3a4a" toneMapped={false} />
      </lineSegments>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Token stream — GPU-hours flowing through the cluster
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
      array[i * 3 + 1] += Math.sin(offsets[i] + array[i * 3] * 2) * delta * 0.04;

      if (array[i * 3] > spanX / 2) {
        array[i * 3] = -spanX / 2;
        array[i * 3 + 1] = 0.05 + Math.random() * 0.34;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} raycast={() => null}>
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
// Camera control
// ---------------------------------------------------------------------------

interface ControlsHandle {
  update: () => void;
  target: THREE.Vector3;
}

/**
 * Applies zoom and reset requests coming from the DOM controls.
 *
 * Dollying is done by scaling the camera's distance from the orbit target
 * directly rather than through the controls' own dolly helpers, which are not
 * part of a stable public surface across three.js versions.
 */
function CameraCommands({
  controlsRef,
  zoomCommand,
  resetSeq,
}: {
  controlsRef: React.RefObject<ControlsHandle | null>;
  zoomCommand: DieProps['zoomCommand'];
  resetSeq: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!zoomCommand) return;
    const controls = controlsRef.current;
    const target = controls?.target ?? new THREE.Vector3();

    const offset = camera.position.clone().sub(target);
    const next = THREE.MathUtils.clamp(
      offset.length() * (zoomCommand.direction === 1 ? 0.82 : 1.22),
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
    camera.position.copy(target).add(offset.setLength(next));
    controls?.update();
  }, [zoomCommand, camera, controlsRef]);

  useEffect(() => {
    if (resetSeq === 0) return;
    const controls = controlsRef.current;
    camera.position.copy(HOME);
    controls?.target.set(0, 0, 0);
    controls?.update();
  }, [resetSeq, camera, controlsRef]);

  return null;
}

/** Gentle orbit until the viewer takes over, then it stops and stays put. */
function AmbientOrbit({ active }: { active: boolean }) {
  useFrame(({ camera }, delta) => {
    if (!active) return;
    const angle = delta * 0.045;
    const x = camera.position.x;
    const z = camera.position.z;
    camera.position.x = x * Math.cos(angle) - z * Math.sin(angle);
    camera.position.z = x * Math.sin(angle) + z * Math.cos(angle);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ---------------------------------------------------------------------------

export function GpuDie({
  utilisation,
  thermal,
  internalShare,
  selectedIndex,
  onSelect,
  zoomCommand,
  resetSeq,
}: DieProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  /**
   * The gentle idle orbit is paused while the pointer is over the canvas.
   * Without this the die keeps rotating under the cursor and tiles move
   * between aiming and clicking, which makes selection feel unreliable.
   */
  const [pointerInside, setPointerInside] = useState(false);
  const controlsRef = useRef<ControlsHandle | null>(null);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [HOME.x, HOME.y, HOME.z], fov: 32 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent', cursor: hoveredIndex !== null ? 'pointer' : 'grab' }}
      onPointerMissed={() => onSelect(null)}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => {
        setPointerInside(false);
        setHoveredIndex(null);
      }}
    >
      <fog attach="fog" args={['#07080c', 5.5, 11]} />

      <OrbitControls
        ref={controlsRef as never}
        makeDefault
        enablePan={false}
        // Wheel zoom is left off on purpose: this canvas is full-bleed behind the
        // hero, so binding the wheel would swallow the page scroll whenever the
        // cursor happened to be over it. Zoom is on explicit controls instead.
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        // Kept above the substrate plane so the die can never be viewed edge-on
        // or from underneath, where it stops reading as a die at all.
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.35}
        onStart={() => setHasInteracted(true)}
      />
      <CameraCommands controlsRef={controlsRef} zoomCommand={zoomCommand} resetSeq={resetSeq} />
      <AmbientOrbit active={!hasInteracted && !pointerInside && selectedIndex === null} />

      <Substrate />
      <Tiles
        utilisation={utilisation}
        thermal={thermal}
        selectedIndex={selectedIndex}
        hoveredIndex={hoveredIndex}
        onSelect={onSelect}
        onHover={setHoveredIndex}
      />
      <SelectionMarker index={selectedIndex} />
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
