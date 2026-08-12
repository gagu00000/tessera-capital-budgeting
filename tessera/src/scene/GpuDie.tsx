/**
 * The GPU cluster — the application's central visual motif, and an inspectable
 * one.
 *
 * The layout mirrors the hardware actually being appraised: 32 SXM modules as
 * four HGX baseboards of eight, which is how a 32-GPU H200 deployment is really
 * built. Each module is drawn as a package under a finned heatsink, seated in a
 * chassis tray with a lit front bezel — the silhouette of accelerator hardware
 * rather than an abstract tile.
 *
 * It is not decoration: every visual property is bound to a number from the
 * model.
 *
 *   module lit / dark      one per GPU, lit share = peak utilisation
 *   bezel LED hue          cyan at low thermal load, shifting toward iris as
 *                          the cluster runs hotter (i.e. as utilisation rises)
 *   heatsink glow          fins pick up the load colour from beneath
 *   scan pulse             a wave crossing the racks
 *   token stream           particles crossing the trays — cyan for internally
 *                          consumed GPU-hours, magenta for hours resold
 *
 * Interaction: drag to orbit, click a module to inspect it. Wheel zoom is
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

/** Eight SXM modules per baseboard, four baseboards — a 32-GPU HGX deployment. */
const COLUMNS = 8;
const ROWS = 4;

const MODULE_W = 0.54;
const MODULE_D = 0.4;
const MODULE_H = 0.15;

/**
 * Row pitch is much larger than column pitch, which is what makes the four
 * trays read as separate servers rather than one continuous field. Rows also
 * run away from the camera and are heavily foreshortened, so a gap that looks
 * ample in plan closes to nothing at this viewing angle.
 */
const COL_PITCH = 0.71;
const ROW_PITCH = 0.85;

/** Fins per heatsink. The stack is what makes a box read as a GPU. */
const FINS = 6;
const FIN_THICKNESS = 0.022;
const FIN_HEIGHT = 0.1;
const FIN_SPAN = MODULE_D * 0.82;

export const TILE_TOTAL = COLUMNS * ROWS;
const FIN_TOTAL = TILE_TOTAL * FINS;

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
const MAX_DISTANCE = 12;
/**
 * Further back than the flat lattice needed. Separating the rows into trays
 * made the floor deeper, and the modules now stand proud of it, so the same
 * framing overflowed the canvas at the near edge. The ratio of the components
 * is unchanged, which keeps the viewing angle exactly as it was.
 */
const HOME = new THREE.Vector3(0, 7.4, 5.55);

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
  const originX = (-(COLUMNS - 1) * COL_PITCH) / 2;
  const originZ = (-(ROWS - 1) * ROW_PITCH) / 2;
  const maxRadial = Math.hypot(originX, originZ);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      const x = originX + c * COL_PITCH;
      const z = originZ + r * ROW_PITCH;
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

/**
 * Per-module state, computed once per frame and then consumed by each of the
 * three instanced meshes that together make up a module. Deriving it in one
 * place keeps the package, its heatsink and its bezel LED from drifting out of
 * agreement about what the same GPU is doing.
 */
interface ModuleState {
  lit: boolean;
  selected: boolean;
  hovered: boolean;
  /** Travelling activity wave, 0..1. */
  scan: number;
  /** Forward slide out of the tray, as if pulled for inspection. */
  slide: number;
  lift: number;
}

function Modules({
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

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const finRef = useRef<THREE.InstancedMesh>(null);
  const bezelRef = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colour = useMemo(() => new THREE.Color(), []);

  /**
   * The per-instance colour buffer must exist before the material's shader is
   * compiled. Three.js creates it lazily on the first setColorAt call, and if
   * that first call happens inside useFrame the program has already been built
   * without USE_INSTANCING_COLOR — every instance then renders at the
   * material's plain white and the entire thermal reading is lost. Allocating
   * it up front in a layout effect avoids depending on that ordering.
   */
  useLayoutEffect(() => {
    for (const [ref, count] of [
      [bodyRef, TILE_TOTAL],
      [finRef, FIN_TOTAL],
      [bezelRef, TILE_TOTAL],
    ] as const) {
      const mesh = ref.current;
      if (!mesh) continue;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(count * 3).fill(1),
        3,
      );
      mesh.instanceColor.needsUpdate = true;
      // The material is a single material here, but the typed property allows
      // an array, so narrow before touching it.
      if (!Array.isArray(mesh.material)) mesh.material.needsUpdate = true;
    }
  }, []);

  /** The load colour for a module: an HSL hue arc from photon cyan to iris. */
  const loadColour = (target: THREE.Color, scan: number, lightness: number) => {
    /**
     * Interpolated in HSL rather than RGB. Lerping the RGB values of two
     * palette colours produces mud whenever the endpoints sit far apart on the
     * colour wheel, because the straight line between them passes through the
     * desaturated centre — cyan and amber are very nearly complementary, so
     * that path ran straight through grey.
     *
     * Lightness is capped well below 1.0: these values feed an unclamped bloom
     * pass, and anything near full brightness clips to white, destroying the
     * hue that carries the thermal reading.
     */
    const hue = HUE_PHOTON + (HUE_IRIS - HUE_PHOTON) * (thermal * 0.5 + scan * 0.32);
    target.setHSL(hue, 0.92, Math.min(lightness, 0.5));
  };

  useFrame(({ clock }) => {
    const body = bodyRef.current;
    const fins = finRef.current;
    const bezels = bezelRef.current;
    if (!body || !fins || !bezels) return;
    const t = clock.getElapsedTime();

    for (const spec of TILE_SPECS) {
      const lit = spec.index < litCount;
      const selected = spec.index === selectedIndex;
      const hovered = spec.index === hoveredIndex;

      // A wave travelling across the racks on the x axis, so the cluster reads
      // as running hardware rather than a static model of it.
      const scan = Math.sin(t * 0.9 - spec.x * 0.55) * 0.5 + 0.5;
      const breathe = Math.sin(t * 0.6 + spec.radial * 2.4) * 0.5 + 0.5;

      const state: ModuleState = {
        lit,
        selected,
        hovered,
        scan,
        // Selecting slides the module forward out of its tray, the way a sled
        // is pulled from a rack to be looked at.
        slide: selected ? 0.15 : hovered ? 0.05 : 0,
        lift: selected ? 0.03 : 0,
      };

      const cx = spec.x;
      const cy = MODULE_H / 2 + state.lift;
      const cz = spec.z + state.slide;

      // --- package ---------------------------------------------------------
      dummy.position.set(cx, cy, cz);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      body.setMatrixAt(spec.index, dummy.matrix);

      if (selected) colour.set('#3a2d16');
      else if (lit) colour.setHSL(HUE_PHOTON, 0.32, hovered ? 0.3 : 0.17);
      else colour.setRGB(0.085, 0.092, 0.112).multiplyScalar(hovered ? 2.4 : 1);
      body.setColorAt(spec.index, colour);

      // --- heatsink fins ---------------------------------------------------
      for (let f = 0; f < FINS; f++) {
        const offset = (f / (FINS - 1) - 0.5) * FIN_SPAN;
        dummy.position.set(cx, MODULE_H + FIN_HEIGHT / 2 + state.lift, cz + offset);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        fins.setMatrixAt(spec.index * FINS + f, dummy.matrix);

        // Fins catch the glow from the package beneath, brightest at the base
        // of the stack, so the heatsink reads as lit from within.
        if (selected) {
          colour.copy(COLOUR.amber).multiplyScalar(0.55);
        } else if (lit) {
          loadColour(colour, scan, 0.25 + scan * 0.035 + breathe * 0.015);
        } else {
          colour.setRGB(0.135, 0.142, 0.163).multiplyScalar(hovered ? 2.2 : 1);
        }
        fins.setColorAt(spec.index * FINS + f, colour);
      }

      // --- front bezel LED -------------------------------------------------
      dummy.position.set(cx, MODULE_H * 0.5 + state.lift, cz + MODULE_D / 2 + 0.012);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bezels.setMatrixAt(spec.index, dummy.matrix);

      if (selected) {
        colour.copy(COLOUR.amber);
      } else if (lit) {
        loadColour(colour, scan, (0.32 + scan * 0.1 + breathe * 0.04) * (hovered ? 1.4 : 1));
      } else {
        // A dark module is not a dead one — it is provisioned capacity that was
        // never sold, so it keeps a dim standby glow rather than going black.
        colour.setRGB(0.06, 0.07, 0.1).multiplyScalar(hovered ? 3 : 1);
      }
      bezels.setColorAt(spec.index, colour);
    }

    for (const mesh of [body, fins, bezels]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* The package is the only pickable part; fins and bezels would other-
          wise steal the hit and report their own instance ids. */}
      <instancedMesh
        ref={bodyRef}
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
        <boxGeometry args={[MODULE_W, MODULE_H, MODULE_D]} />
        <meshStandardMaterial metalness={0.86} roughness={0.42} />
      </instancedMesh>

      <instancedMesh ref={finRef} args={[undefined, undefined, FIN_TOTAL]} raycast={() => null}>
        <boxGeometry args={[MODULE_W * 0.88, FIN_HEIGHT, FIN_THICKNESS]} />
        <meshStandardMaterial metalness={0.95} roughness={0.24} />
      </instancedMesh>

      <instancedMesh ref={bezelRef} args={[undefined, undefined, TILE_TOTAL]} raycast={() => null}>
        <boxGeometry args={[MODULE_W * 0.66, 0.032, 0.014]} />
        {/* toneMapped off so the LED reaches the bloom pass at full strength */}
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Amber outline drawn around the selected module. */
function SelectionMarker({ index }: { index: number | null }) {
  const geometry = useMemo(
    () =>
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(MODULE_W * 1.2, MODULE_H + FIN_HEIGHT + 0.1, MODULE_D * 1.3),
      ),
    [],
  );
  if (index === null) return null;
  const spec = TILE_SPECS[index];
  if (!spec) return null;

  return (
    <lineSegments
      geometry={geometry}
      // Follows the module forward as it slides out of the tray.
      position={[spec.x, (MODULE_H + FIN_HEIGHT) / 2 + 0.05, spec.z + 0.15]}
      raycast={() => null}
    >
      <lineBasicMaterial color="#ffb547" toneMapped={false} transparent opacity={0.95} />
    </lineSegments>
  );
}

/**
 * The four chassis trays the modules are seated in, and the machine-room floor
 * beneath them. The trays are what turn eight modules in a line into a server.
 */
function Chassis() {
  const trayWidth = (COLUMNS - 1) * COL_PITCH + MODULE_W + 0.34;
  const trayDepth = MODULE_D + 0.3;
  const floorWidth = trayWidth + 0.9;
  const floorDepth = ROWS * ROW_PITCH + 0.7;

  const originZ = (-(ROWS - 1) * ROW_PITCH) / 2;

  const floorEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(floorWidth, floorDepth)),
    [floorWidth, floorDepth],
  );

  return (
    <group>
      {/* machine-room floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.075, 0]} raycast={() => null}>
        <planeGeometry args={[floorWidth, floorDepth]} />
        <meshStandardMaterial color="#080b12" metalness={0.5} roughness={0.75} />
      </mesh>
      <lineSegments
        geometry={floorEdges}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.073, 0]}
        raycast={() => null}
      >
        <lineBasicMaterial color="#1d3a4a" toneMapped={false} />
      </lineSegments>

      {Array.from({ length: ROWS }, (_, r) => {
        const z = originZ + r * ROW_PITCH;
        return (
          <group key={r} position={[0, 0, z]}>
            {/* tray pan */}
            <mesh position={[0, -0.03, 0]} raycast={() => null}>
              <boxGeometry args={[trayWidth, 0.06, trayDepth]} />
              <meshStandardMaterial color="#10141d" metalness={0.8} roughness={0.5} />
            </mesh>
            {/* front rail, the face a rack unit presents to the aisle */}
            <mesh position={[0, 0.02, trayDepth / 2 + 0.02]} raycast={() => null}>
              <boxGeometry args={[trayWidth, 0.11, 0.04]} />
              <meshStandardMaterial color="#161b26" metalness={0.85} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
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

    const spanX = COLUMNS * COL_PITCH;
    const spanZ = ROWS * ROW_PITCH;

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
    const spanX = COLUMNS * COL_PITCH;

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
      <fog attach="fog" args={['#07080c', 8, 17]} />

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

      {/*
        The chassis and heatsinks are metal, which needs light to read as metal:
        a soft fill so nothing is pure black, a key from above front for the
        specular run along the fin edges, and two coloured rims from the palette
        that separate the hardware from the background without tinting it.
      */}
      <ambientLight intensity={0.8} color="#2f3a4e" />
      <directionalLight position={[3.5, 7, 5.5]} intensity={2.1} color="#cfe0ff" />
      <pointLight position={[-3.2, 1.8, -2.2]} intensity={9} distance={13} color="#8b7cff" />
      <pointLight position={[2.8, 1.4, 3.2]} intensity={7} distance={11} color="#38e8ff" />

      <Chassis />
      <Modules
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
