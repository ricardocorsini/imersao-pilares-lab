import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type ElementRef } from "react";
import * as THREE from "three";
import { SECTION, neutralAxisSegment, type MeshSettings, type PlaneParameters } from "../core/sectionModel";
import { forceArrowDirection, forceArrowLength, forceColor, type ForceElement } from "../core/fiberEquilibrium";
import type { ReferenceAppearance } from "../core/referenceAppearance";

export type ForceLayers = { concrete: boolean; steel: boolean; neutralAxis: boolean; heatmap: boolean };
export type ForceView = "iso" | "top" | "x" | "y";
type Props = {
  elements: ForceElement[]; mesh: MeshSettings; gain: number;
  appearance: ReferenceAppearance; layers: ForceLayers; plane: PlaneParameters;
  selectedId: string | null; view: ForceView; resetKey: number;
  onInspect: (id: string, pinned: boolean) => void;
};
const WORLD_PER_MM = 0.01;
type Point = [number, number, number];
const worldPoint = (e: ForceElement): Point => [e.xMm * WORLD_PER_MM, 0, e.yMm * WORLD_PER_MM];
const outline: Point[] = [[-1.5, 0, -3], [1.5, 0, -3], [1.5, 0, 3], [-1.5, 0, 3], [-1.5, 0, -3]];

function FixedSection({ elements, mesh, appearance, layers, selectedId, onInspect }: Props) {
  const cells = useRef<THREE.InstancedMesh>(null);
  const concrete = useMemo(() => elements.filter(e => e.kind === "concrete"), [elements]);
  const bars = useMemo(() => elements.filter(e => e.kind === "steel"), [elements]);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const gridPositions = useMemo(() => {
    const points: number[] = [];
    for (let ix = 0; ix <= mesh.nx; ix++) {
      const x = -1.5 + 3 * ix / mesh.nx;
      points.push(x, 0.02, -3, x, 0.02, 3);
    }
    for (let iy = 0; iy <= mesh.ny; iy++) {
      const y = -3 + 6 * iy / mesh.ny;
      points.push(-1.5, 0.02, y, 1.5, 0.02, y);
    }
    return new Float32Array(points);
  }, [mesh.nx, mesh.ny]);
  useLayoutEffect(() => {
    if (!cells.current) return;
    concrete.forEach((element, index) => {
      transform.position.set(...worldPoint(element));
      transform.scale.set(3 / mesh.nx * 0.97, 0.022, 6 / mesh.ny * 0.97);
      transform.updateMatrix();
      cells.current!.setMatrixAt(index, transform.matrix);
      cells.current!.setColorAt(index, color.set(layers.heatmap ? forceColor(element.forceKn) : appearance.color));
    });
    cells.current.instanceMatrix.needsUpdate = true;
    cells.current.computeBoundingSphere();
    if (cells.current.instanceColor) cells.current.instanceColor.needsUpdate = true;
  }, [appearance.color, color, concrete, layers.heatmap, mesh.nx, mesh.ny, transform]);
  const inspect = (event: ThreeEvent<PointerEvent | MouseEvent>, pin: boolean) => {
    if (event.instanceId === undefined || (!pin && event.buttons) || (pin && event.delta > 3)) return;
    event.stopPropagation();
    const element = concrete[event.instanceId];
    if (element) onInspect(element.id, pin);
  };
  const selected = concrete.find(e => e.id === selectedId);
  return <group>
    <instancedMesh key={`${mesh.nx}-${mesh.ny}`} ref={cells} args={[undefined, undefined, concrete.length]} frustumCulled={false}
      onPointerMove={event => inspect(event, false)} onClick={event => inspect(event, true)} renderOrder={0}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial vertexColors transparent opacity={appearance.opacity} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <Line points={outline} color={appearance.color} lineWidth={1.8} transparent opacity={0.8} />
    <lineSegments>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[gridPositions, 3]} /></bufferGeometry>
      <lineBasicMaterial color={appearance.color} transparent opacity={0.45} depthWrite={false} toneMapped={false} />
    </lineSegments>
    {selected && <Line points={[
      [selected.xMm * WORLD_PER_MM - 1.5 / mesh.nx, 0.04, selected.yMm * WORLD_PER_MM - 3 / mesh.ny],
      [selected.xMm * WORLD_PER_MM + 1.5 / mesh.nx, 0.04, selected.yMm * WORLD_PER_MM - 3 / mesh.ny],
      [selected.xMm * WORLD_PER_MM + 1.5 / mesh.nx, 0.04, selected.yMm * WORLD_PER_MM + 3 / mesh.ny],
      [selected.xMm * WORLD_PER_MM - 1.5 / mesh.nx, 0.04, selected.yMm * WORLD_PER_MM + 3 / mesh.ny],
      [selected.xMm * WORLD_PER_MM - 1.5 / mesh.nx, 0.04, selected.yMm * WORLD_PER_MM - 3 / mesh.ny],
    ]} color="#ffffff" lineWidth={2.5} depthTest={false} renderOrder={8} />}
    {bars.map(bar => <mesh key={bar.id} position={worldPoint(bar)} renderOrder={2}
      onPointerMove={event => { if (event.buttons) return; event.stopPropagation(); onInspect(bar.id, false); }}
      onClick={event => { if (event.delta > 3) return; event.stopPropagation(); onInspect(bar.id, true); }}>
      <cylinderGeometry args={[0.08, 0.08, 0.15, 24]} />
      <meshBasicMaterial color={bar.id === selectedId ? "#ffffff" : "#c5e5f4"} toneMapped={false} />
    </mesh>)}
  </group>;
}

function ForceArrows({ elements, mesh, gain, layers, onInspect }: Props) {
  const shafts = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const shown = useMemo(() => elements.filter(e => e.kind === "concrete" ? layers.concrete : layers.steel), [elements, layers.concrete, layers.steel]);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    if (!shafts.current || !heads.current) return;
    shown.forEach((element, index) => {
      const length = forceArrowLength(element.forceKn, gain);
      const direction = forceArrowDirection(element.forceKn);
      const headLength = Math.min(0.2, length * 0.28);
      const radius = Math.min(element.kind === "steel" ? 0.1 : 0.06, 0.7 / mesh.nx, 1.4 / mesh.ny, length * 0.2);
      const shaftLength = length - headLength;
      transform.rotation.set(0, 0, direction < 0 ? Math.PI : 0);
      transform.position.set(element.xMm * WORLD_PER_MM, direction * shaftLength / 2, element.yMm * WORLD_PER_MM);
      transform.scale.set(radius * 0.28, shaftLength, radius * 0.28);
      transform.updateMatrix();
      shafts.current!.setMatrixAt(index, transform.matrix);
      transform.position.y = direction * (length - headLength / 2);
      transform.scale.set(radius, headLength, radius);
      transform.updateMatrix();
      heads.current!.setMatrixAt(index, transform.matrix);
      color.set(forceColor(element.forceKn));
      shafts.current!.setColorAt(index, color); heads.current!.setColorAt(index, color);
    });
    for (const ref of [shafts, heads]) {
      ref.current!.instanceMatrix.needsUpdate = true;
      ref.current!.computeBoundingSphere();
      if (ref.current!.instanceColor) ref.current!.instanceColor!.needsUpdate = true;
    }
  }, [color, gain, mesh.nx, mesh.ny, shown, transform]);
  const inspect = (event: ThreeEvent<PointerEvent | MouseEvent>, pin: boolean) => {
    if (event.instanceId === undefined || (!pin && event.buttons) || (pin && event.delta > 3)) return;
    event.stopPropagation();
    const element = shown[event.instanceId];
    if (element) onInspect(element.id, pin);
  };
  if (!shown.length) return null;
  // setColorAt fornece a cor por instância; haste e ponta não têm cores por vértice.
  return <group>
    <instancedMesh key={`s${shown.length}`} ref={shafts} args={[undefined, undefined, shown.length]} frustumCulled={false}
      onPointerMove={event => inspect(event, false)} onClick={event => inspect(event, true)} renderOrder={3}>
      <cylinderGeometry args={[1, 1, 1, 8]} /><meshBasicMaterial color="#ffffff" vertexColors={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh key={`h${shown.length}`} ref={heads} args={[undefined, undefined, shown.length]} frustumCulled={false}
      onPointerMove={event => inspect(event, false)} onClick={event => inspect(event, true)} renderOrder={4}>
      <coneGeometry args={[1, 1, 12]} /><meshBasicMaterial color="#ffffff" vertexColors={false} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function Camera({ gain, view, resetKey }: Pick<Props, "gain" | "view" | "resetKey">) {
  const ref = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera, invalidate, size } = useThree();
  useEffect(() => {
    const views: Record<ForceView, Point> = { iso: [8.2, 7, 10.5], top: [0, 16, 0.001], x: [0, 1.2, 16], y: [16, 1.2, 0] };
    const target = new THREE.Vector3(0, -0.4, 0);
    const fit = Math.max(1, 0.85 / (size.width / size.height)) * Math.max(1, gain * 0.7);
    camera.position.set(...views[view]).sub(target).multiplyScalar(fit).add(target);
    ref.current?.target.copy(target); ref.current?.update(); invalidate();
  }, [camera, gain, invalidate, resetKey, size.height, size.width, view]);
  return <OrbitControls ref={ref} makeDefault enableDamping target={[0, -0.4, 0]} minDistance={5} maxDistance={65} />;
}

function Guides({ plane, layers, gain, selectedId, elements }: Props) {
  const neutralAxis = neutralAxisSegment(plane);
  const selected = elements.find(e => e.id === selectedId);
  const selectedArrowVisible = selected?.kind === "concrete" ? layers.concrete : layers.steel;
  const referenceLength = forceArrowLength(25, gain);
  return <group>
    <Line points={[[-1.8, 0, -3.4], [2.3, 0, -3.4]]} color="#7793a4" lineWidth={1} />
    <Line points={[[-1.8, 0, -3.4], [-1.8, 0, 3.6]]} color="#7793a4" lineWidth={1} />
    <Html position={[2.4, 0, -3.4]} center style={{ pointerEvents: "none" }}><span className="force-axis">x</span></Html>
    <Html position={[-1.8, 0, 3.8]} center style={{ pointerEvents: "none" }}><span className="force-axis">y</span></Html>
    {layers.neutralAxis && neutralAxis && <>
      <Line points={neutralAxis.map(([x, y]) => [x * WORLD_PER_MM, 0.035, y * WORLD_PER_MM] as Point)} color="#ffffff" lineWidth={2} dashed dashSize={0.12} gapSize={0.08} depthTest={false} renderOrder={5} />
      <Html position={[neutralAxis[0][0] * WORLD_PER_MM, 0.15, neutralAxis[0][1] * WORLD_PER_MM]} center style={{ pointerEvents: "none" }}><span className="force-axis">ε = 0</span></Html>
    </>}
    <arrowHelper args={[new THREE.Vector3(0, -1, 0), new THREE.Vector3(2.25, 0, 2.4), referenceLength, 0xffffff, Math.min(0.18, referenceLength * 0.28), 0.09]} />
    <Html position={[2.25, -referenceLength - 0.22, 2.4]} center style={{ pointerEvents: "none" }}><span className="force-reference">25 kN</span></Html>
    {selected && <mesh position={[selected.xMm * WORLD_PER_MM, selectedArrowVisible ? forceArrowDirection(selected.forceKn) * forceArrowLength(selected.forceKn, gain) : 0.06, selected.yMm * WORLD_PER_MM]} renderOrder={10}>
      <sphereGeometry args={[0.045, 16, 12]} /><meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
    </mesh>}
  </group>;
}

export function ForceScene(props: Props) {
  return <div className="canvas-mount" role="img" aria-label={`Seção fixa de ${SECTION.widthMm / 10} por ${SECTION.heightMm / 10} centímetros, ${props.mesh.nx * props.mesh.ny} fibras e 8 barras. Setas verticais proporcionais às forças: compressão para baixo, tração para cima.`}>
    <Canvas frameloop="demand" dpr={[1, 1.65]} camera={{ position: [8.2, 7, 10.5], fov: 38, near: 0.1, far: 150 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      fallback={<div className="force-fallback">O 3D requer WebGL. Os valores e o quadro de equilíbrio continuam disponíveis.</div>}
      onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.NoToneMapping; }}>
      <FixedSection {...props} /><ForceArrows {...props} /><Guides {...props} />
      <Camera gain={props.gain} view={props.view} resetKey={props.resetKey} />
    </Canvas>
  </div>;
}
