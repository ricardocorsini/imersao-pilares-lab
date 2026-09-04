import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ElementRef,
} from "react";
import * as THREE from "three";
import {
  SECTION,
  neutralAxisSegment,
  sigmaConcreteMaxMpa,
  steelDesignStrengthMpa,
  strainAt,
  type PlaneParameters,
  type SectionState,
} from "../core/sectionModel";
import {
  concreteStressColor,
  steelStressColor,
  strainColor,
} from "../core/colors";
import { strainToVisualHeight } from "../core/visualEncoding";
import type { ReferenceAppearance } from "../core/referenceAppearance";

export type FieldMode = "stress" | "strain";

export type LayerVisibility = {
  plane: boolean;
  fibers: boolean;
  rebars: boolean;
  neutralAxis: boolean;
  axes: boolean;
};

type SectionCanvasProps = {
  parameters: PlaneParameters;
  state: SectionState;
  fieldMode: FieldMode;
  layers: LayerVisibility;
  referenceAppearance: ReferenceAppearance;
  cameraResetKey: number;
};

const WORLD_PER_MM = 0.01;
const SECTION_CORNERS: [number, number][] = [
  [-SECTION.widthMm / 2, -SECTION.heightMm / 2],
  [SECTION.widthMm / 2, -SECTION.heightMm / 2],
  [SECTION.widthMm / 2, SECTION.heightMm / 2],
  [-SECTION.widthMm / 2, SECTION.heightMm / 2],
];

function usePlaneRotation(parameters: PlaneParameters) {
  return useMemo(() => {
    const halfWidth = SECTION.widthMm / 2;
    const halfHeight = SECTION.heightMm / 2;
    const slopeX =
      (strainToVisualHeight(strainAt(parameters, halfWidth, 0)) -
        strainToVisualHeight(strainAt(parameters, -halfWidth, 0))) /
      (SECTION.widthMm * WORLD_PER_MM);
    const slopeZ =
      (strainToVisualHeight(strainAt(parameters, 0, halfHeight)) -
        strainToVisualHeight(strainAt(parameters, 0, -halfHeight))) /
      (SECTION.heightMm * WORLD_PER_MM);
    const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normal,
    );
  }, [parameters]);
}

function FiberInstances({
  parameters,
  state,
  fieldMode,
}: Pick<SectionCanvasProps, "parameters" | "state" | "fieldMode">) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const planeRotation = usePlaneRotation(parameters);
  const fiberWidth =
    (SECTION.widthMm / SECTION.nx) * WORLD_PER_MM * 0.91;
  const fiberHeight =
    (SECTION.heightMm / SECTION.ny) * WORLD_PER_MM * 0.92;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    state.fibers.forEach((fiber, index) => {
      transform.position.set(
        fiber.xMm * WORLD_PER_MM,
        strainToVisualHeight(fiber.strain),
        fiber.yMm * WORLD_PER_MM,
      );
      transform.quaternion.copy(planeRotation);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);

      const hex =
        fieldMode === "stress"
          ? concreteStressColor(
              fiber.concreteStressMpa,
              sigmaConcreteMaxMpa,
              fiber.strain,
            )
          : strainColor(fiber.strain);
      mesh.setColorAt(index, color.set(hex));
    });

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [color, fieldMode, planeRotation, state.fibers, transform]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, state.fibers.length]}
      frustumCulled={false}
      renderOrder={3}
    >
      <boxGeometry args={[fiberWidth, 0.055, fiberHeight]} />
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

function Reinforcement({
  state,
  fieldMode,
}: Pick<SectionCanvasProps, "state" | "fieldMode">) {
  return (
    <group>
      {state.rebars.map((bar) => {
        const color =
          fieldMode === "stress"
            ? steelStressColor(bar.steelStressMpa, steelDesignStrengthMpa)
            : strainColor(bar.strain);
        const x = bar.xMm * WORLD_PER_MM;
        const z = bar.yMm * WORLD_PER_MM;
        const displacedY = strainToVisualHeight(bar.strain);
        return (
          <group key={bar.id}>
            {Math.abs(displacedY) > 0.035 && (
              <Line
                points={[
                  [x, 0.065, z],
                  [x, displacedY, z],
                ]}
                color={color}
                lineWidth={2.1}
                transparent
                opacity={0.72}
                depthTest={false}
                renderOrder={7}
              />
            )}
            <mesh position={[x, 0.065, z]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.105, 0.018, 8, 24]} />
              <meshBasicMaterial
                color="#bdefff"
                transparent
                opacity={0.5}
                depthWrite={false}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
            {/* Barras verticais: somente a altura varia, sem rotação do plano. */}
            <group position={[x, displacedY, z]}>
              <mesh renderOrder={8}>
                <cylinderGeometry args={[0.18, 0.18, 0.045, 32]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.28}
                  depthWrite={false}
                  depthTest={false}
                  toneMapped={false}
                />
              </mesh>
              <mesh renderOrder={9}>
                <cylinderGeometry args={[0.115, 0.115, 0.19, 32]} />
                <meshBasicMaterial
                  color={color}
                  depthTest={false}
                  toneMapped={false}
                />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}

function makeLineSegments(points: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points);
  return geometry;
}

function ReferenceSection({ appearance }: { appearance: ReferenceAppearance }) {
  const outline = useMemo(
    () =>
      [...SECTION_CORNERS, SECTION_CORNERS[0]].map(
        ([xMm, yMm]) =>
          [xMm * WORLD_PER_MM, 0.035, yMm * WORLD_PER_MM] as [
            number,
            number,
            number,
          ],
      ),
    [],
  );
  const gridGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let index = 1; index < 6; index += 1) {
      const xMm = -SECTION.widthMm / 2 + (SECTION.widthMm * index) / 6;
      points.push(
        new THREE.Vector3(
          xMm * WORLD_PER_MM,
          0.025,
          (-SECTION.heightMm / 2) * WORLD_PER_MM,
        ),
        new THREE.Vector3(
          xMm * WORLD_PER_MM,
          0.025,
          (SECTION.heightMm / 2) * WORLD_PER_MM,
        ),
      );
    }
    for (let index = 1; index < 12; index += 1) {
      const yMm = -SECTION.heightMm / 2 + (SECTION.heightMm * index) / 12;
      points.push(
        new THREE.Vector3(
          (-SECTION.widthMm / 2) * WORLD_PER_MM,
          0.025,
          yMm * WORLD_PER_MM,
        ),
        new THREE.Vector3(
          (SECTION.widthMm / 2) * WORLD_PER_MM,
          0.025,
          yMm * WORLD_PER_MM,
        ),
      );
    }
    return makeLineSegments(points);
  }, []);

  useEffect(() => () => gridGeometry.dispose(), [gridGeometry]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <planeGeometry
          args={[
            SECTION.widthMm * WORLD_PER_MM,
            SECTION.heightMm * WORLD_PER_MM,
          ]}
        />
        <meshBasicMaterial
          color={appearance.color}
          transparent
          opacity={appearance.opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineSegments geometry={gridGeometry} renderOrder={6}>
        <lineBasicMaterial
          color={appearance.color}
          transparent
          opacity={0.2}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </lineSegments>
      <Line
        points={outline}
        color={appearance.color}
        lineWidth={2.1}
        transparent
        opacity={0.94}
        depthTest={false}
        renderOrder={10}
        toneMapped={false}
      />
    </group>
  );
}

function StrainPlane({ parameters }: { parameters: PlaneParameters }) {
  const borderPoints = useMemo(
    () =>
      [...SECTION_CORNERS, SECTION_CORNERS[0]].map(
        ([xMm, yMm]) =>
          new THREE.Vector3(
            xMm * WORLD_PER_MM,
            strainToVisualHeight(strainAt(parameters, xMm, yMm)),
            yMm * WORLD_PER_MM,
          ),
      ),
    [parameters],
  );

  const planeGridGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let index = 1; index < 6; index += 1) {
      const xMm = -SECTION.widthMm / 2 + (SECTION.widthMm * index) / 6;
      for (const yMm of [-SECTION.heightMm / 2, SECTION.heightMm / 2]) {
        points.push(
          new THREE.Vector3(
            xMm * WORLD_PER_MM,
            strainToVisualHeight(strainAt(parameters, xMm, yMm)),
            yMm * WORLD_PER_MM,
          ),
        );
      }
    }
    for (let index = 1; index < 10; index += 1) {
      const yMm = -SECTION.heightMm / 2 + (SECTION.heightMm * index) / 10;
      for (const xMm of [-SECTION.widthMm / 2, SECTION.widthMm / 2]) {
        points.push(
          new THREE.Vector3(
            xMm * WORLD_PER_MM,
            strainToVisualHeight(strainAt(parameters, xMm, yMm)),
            yMm * WORLD_PER_MM,
          ),
        );
      }
    }
    return makeLineSegments(points);
  }, [parameters]);

  const connectorGeometry = useMemo(() => {
    const points = SECTION_CORNERS.flatMap(([xMm, yMm]) => [
      new THREE.Vector3(xMm * WORLD_PER_MM, 0.06, yMm * WORLD_PER_MM),
      new THREE.Vector3(
        xMm * WORLD_PER_MM,
        strainToVisualHeight(strainAt(parameters, xMm, yMm)),
        yMm * WORLD_PER_MM,
      ),
    ]);
    return makeLineSegments(points);
  }, [parameters]);

  useEffect(
    () => () => {
      planeGridGeometry.dispose();
      connectorGeometry.dispose();
    }, [connectorGeometry, planeGridGeometry],
  );

  return (
    <group>
      <lineSegments geometry={planeGridGeometry} renderOrder={6}>
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.34}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </lineSegments>
      <lineSegments geometry={connectorGeometry} renderOrder={5}>
        <lineBasicMaterial
          color="#55ddff"
          transparent
          opacity={0.48}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </lineSegments>
      <Line
        points={borderPoints}
        color="#ffffff"
        lineWidth={2.1}
        transparent
        opacity={0.96}
        depthTest={false}
        renderOrder={7}
        toneMapped={false}
      />
    </group>
  );
}

function NeutralAxis({ parameters }: { parameters: PlaneParameters }) {
  const segment = neutralAxisSegment(parameters);
  if (!segment) return null;
  const points = segment.map(
    ([xMm, yMm]) =>
      [xMm * WORLD_PER_MM, 0.085, yMm * WORLD_PER_MM] as [
        number,
        number,
        number,
      ],
  );
  const midpoint: [number, number, number] = [
    (points[0][0] + points[1][0]) / 2,
    0.35,
    (points[0][2] + points[1][2]) / 2,
  ];

  return (
    <group>
      <Line
        points={points}
        color="#ffffff"
        lineWidth={3}
        dashed
        dashSize={0.12}
        gapSize={0.08}
        depthTest={false}
        renderOrder={11}
        toneMapped={false}
      />
      <Html position={midpoint} center distanceFactor={8}>
        <span className="neutral-axis-label">LN · ε = 0</span>
      </Html>
    </group>
  );
}

function AxisGuide() {
  const origin: [number, number, number] = [-2.05, 0, -3.55];
  return (
    <group>
      <Line
        points={[origin, [-0.65, 0, -3.55]]}
        color="#72d8f1"
        lineWidth={2}
      />
      <Line
        points={[origin, [-2.05, 0, -2.15]]}
        color="#9eafbb"
        lineWidth={2}
      />
      <Line
        points={[origin, [-2.05, 1.25, -3.55]]}
        color="#00d9ff"
        lineWidth={2}
      />
      <Line
        points={[origin, [-2.05, -1.25, -3.55]]}
        color="#ff5233"
        lineWidth={2}
      />
      <Html position={[-0.48, 0, -3.55]} center distanceFactor={9}>
        <span className="scene-axis-label scene-axis-x">x</span>
      </Html>
      <Html position={[-2.05, 0, -1.98]} center distanceFactor={9}>
        <span className="scene-axis-label">y</span>
      </Html>
      <Html position={[-2.05, 1.5, -3.55]} center distanceFactor={9}>
        <span className="scene-axis-label scene-axis-tension">−ε · tração</span>
      </Html>
      <Html position={[-2.05, -1.5, -3.55]} center distanceFactor={9}>
        <span className="scene-axis-label scene-axis-compression">+ε · compressão</span>
      </Html>
    </group>
  );
}

function CameraControls({ resetKey }: { resetKey: number }) {
  const camera = useThree((context) => context.camera);
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);

  useEffect(() => {
    camera.position.set(8.2, 5.3, 9.4);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, -0.18, 0);
    if (controls.current) {
      controls.current.target.set(0, -0.18, 0);
      controls.current.update();
    }
  }, [camera, resetKey]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={7}
      maxDistance={24}
      minPolarAngle={0.06}
      maxPolarAngle={Math.PI * 0.94}
      target={[0, -0.18, 0]}
    />
  );
}

function SceneContent({
  parameters,
  state,
  fieldMode,
  layers,
  referenceAppearance,
  cameraResetKey,
}: SectionCanvasProps) {
  return (
    <>
      <color attach="background" args={["#04111d"]} />
      <fog attach="fog" args={["#04111d", 16, 28]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[5, 9, 6]} intensity={2.1} />
      <directionalLight position={[-5, 3, -4]} intensity={0.65} color="#5fdcff" />

      <ReferenceSection appearance={referenceAppearance} />
      {layers.fibers && (
        <FiberInstances
          parameters={parameters}
          state={state}
          fieldMode={fieldMode}
        />
      )}
      {layers.plane && <StrainPlane parameters={parameters} />}
      {layers.rebars && (
        <Reinforcement
          state={state}
          fieldMode={fieldMode}
        />
      )}
      {layers.neutralAxis && <NeutralAxis parameters={parameters} />}
      {layers.axes && <AxisGuide />}

      <CameraControls resetKey={cameraResetKey} />
    </>
  );
}

export function SectionCanvas(props: SectionCanvasProps) {
  return (
    <div
      className="canvas-mount"
      role="img"
      aria-label="Seção retangular tridimensional com fibras, barras de aço, plano de deformações e linha neutra atualizados pelos controles."
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.65]}
        camera={{ position: [8.2, 5.3, 9.4], fov: 37, near: 0.1, far: 60 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Suspense fallback={null}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
