import { Html, Line, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ElementRef } from "react";
import * as THREE from "three";
import {
  axialColor, fromWorld, interactionBounds, interactionData, interactionTriangles,
  interactionVertices, toWorld,
} from "../core/interactionData";
import {
  CUT_COLORS, CUT_INDEX, CUT_LABELS, formatInteraction,
  type CutAxis, type CutValues, type InteractionPoint, type SliceResult,
} from "../core/interactionMesh";

export type InteractionView = "iso" | "n" | "my" | "mx";
export type SurfaceAppearance = { opacity: number; wireframe: boolean; planes: boolean; clip: boolean };
type Props = {
  cuts: CutValues;
  slices: Record<CutAxis, SliceResult>;
  activeCut: CutAxis;
  appearance: SurfaceAppearance;
  view: InteractionView;
  resetKey: number;
  selected: InteractionPoint | null;
  onCut: (axis: CutAxis, value: number) => void;
  onInspect: (point: InteractionPoint, source: string, pin: boolean) => void;
};

const xMin = interactionBounds[0][0];
const xMax = interactionBounds[0][1];
const yMin = interactionBounds[1][0];
const yMax = interactionBounds[1][1];
const nMax = interactionData.nCapacityKn;
const axes: CutAxis[] = ["n", "my", "mx"];

function physicalLinePoint(event: ThreeEvent<PointerEvent | MouseEvent>): InteractionPoint {
  // Line2 informa separadamente o ponto no raio e o ponto na linha.
  const hit = event.intersections.find(item => item.object === event.object) as
    (THREE.Intersection & { pointOnLine?: THREE.Vector3 }) | undefined;
  return fromWorld(hit?.pointOnLine ?? event.point);
}

function planeCorners(axis: CutAxis, value: number): InteractionPoint[] {
  if (axis === "n") return [[xMin, yMin, value], [xMax, yMin, value], [xMax, yMax, value], [xMin, yMax, value]];
  if (axis === "my") return [[xMin, value, 0], [xMax, value, 0], [xMax, value, nMax], [xMin, value, nMax]];
  return [[value, yMin, 0], [value, yMax, 0], [value, yMax, nMax], [value, yMin, nMax]];
}

function CutPlane({ axis, value, active }: { axis: CutAxis; value: number; active: boolean }) {
  const corners = useMemo(() => planeCorners(axis, value).map(toWorld), [axis, value]);
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(corners.flat(), 3));
    result.setIndex([0, 1, 2, 0, 2, 3]);
    return result;
  }, [corners]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group>
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial color={CUT_COLORS[axis]} transparent opacity={active ? 0.12 : 0.035}
        side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
    <Line points={[...corners, corners[0]]} color={CUT_COLORS[axis]} transparent
      opacity={active ? 0.8 : 0.3} lineWidth={active ? 1.5 : 1} depthWrite={false} />
  </group>;
}

function Surface({ appearance, activeCut, cuts, onInspect, dragging }: Pick<Props, "appearance" | "activeCut" | "cuts" | "onInspect"> & { dragging: boolean }) {
  const geometry = useMemo(() => {
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute("position", new THREE.Float32BufferAttribute(interactionVertices.flatMap(toWorld), 3));
    mesh.setAttribute("color", new THREE.Float32BufferAttribute(interactionVertices.flatMap(point =>
      new THREE.Color(axialColor(point[2] / nMax)).toArray()), 3));
    mesh.setIndex(interactionTriangles.flat());
    return mesh;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const clip = useMemo(() => {
    const point: InteractionPoint = [0, 0, 0];
    point[CUT_INDEX[activeCut]] = cuts[activeCut];
    const position = new THREE.Vector3(...toWorld(point));
    const normal = activeCut === "n" ? new THREE.Vector3(0, -1, 0)
      : activeCut === "my" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-1, 0, 0);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, position);
  }, [activeCut, cuts]);
  const inspect = (event: ThreeEvent<PointerEvent | MouseEvent>, pin: boolean) => {
    if (appearance.opacity === 0 || dragging || (pin && event.delta > 3) || (!pin && event.buttons)) return;
    // O raycaster não considera clipping; ignora as interseções removidas.
    const hit = event.intersections.find(item => item.object === event.object &&
      (!appearance.clip || clip.distanceToPoint(item.point) >= -1e-6));
    if (!hit) return;
    event.stopPropagation();
    const point = fromWorld(hit.point);
    point[2] = Math.max(0, point[2]);
    onInspect(point, point[2] < 1e-5 ? "Base N = 0 · limite do escopo" : "Superfície interpolada", pin);
  };
  return <mesh geometry={geometry} renderOrder={2}
    onPointerMove={event => inspect(event, false)} onClick={event => inspect(event, true)}>
    <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent
      opacity={appearance.opacity} depthWrite={false} toneMapped={false}
      clippingPlanes={appearance.clip ? [clip] : []} />
  </mesh>;
}

function SurfaceGrid() {
  const rings = interactionData.rings.filter((ring, i) => i % 6 === 0 && ring.length > 1);
  const meridians = Array.from({ length: 12 }, (_, index) => interactionData.rings.map(ring =>
    toWorld(interactionVertices[ring[Math.min(index * 10, ring.length - 1)]])));
  return <group>
    {rings.map((ring, index) => <Line key={`r${index}`}
      points={[...ring, ring[0]].map(i => toWorld(interactionVertices[i]))}
      color="#b4e5ff" transparent opacity={0.2} lineWidth={1} depthWrite={false} />)}
    {meridians.map((points, index) => <Line key={`m${index}`} points={points}
      color="#b4e5ff" transparent opacity={0.16} lineWidth={1} depthWrite={false} />)}
  </group>;
}

function AxisFrame({ view }: { view: InteractionView }) {
  const bx = xMin * 1.18;
  const by = yMin * 1.25;
  const line = (a: InteractionPoint, b: InteractionPoint) => [toWorld(a), toWorld(b)];
  return <group>
    <Line points={line([bx, by, 0], [xMax * 1.25, by, 0])} color="#7594a6" lineWidth={1.3} />
    <Line points={line([bx, by, 0], [bx, yMax * 1.35, 0])} color="#7594a6" lineWidth={1.3} />
    <Line points={line([bx, by, 0], [bx, by, nMax * 1.08])} color="#7594a6" lineWidth={1.3} />
    {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
      const n = nMax * fraction;
      return <group key={fraction}>
        <Line points={line([bx, by, n], [xMax * 1.1, by, n])} color="#416071" transparent opacity={0.25} lineWidth={1} />
        {view !== "n" && <Html position={toWorld([bx - 12, by, n])} center style={{ pointerEvents: "none" }}>
          <span className="interaction-axis-tick">{formatInteraction(n, 0)}</span>
        </Html>}
      </group>;
    })}
    {[-1, 0, 1].map(fraction => <group key={fraction}>
      {view !== "mx" && <Html position={toWorld([xMax * fraction, by - 12, 0])} center style={{ pointerEvents: "none" }}>
        <span className="interaction-axis-tick">{formatInteraction(xMax * fraction, 0)}</span>
      </Html>}
      {view !== "my" && <Html position={toWorld([bx - 16, yMax * fraction, 0])} center style={{ pointerEvents: "none" }}>
        <span className="interaction-axis-tick">{formatInteraction(yMax * fraction, 0)}</span>
      </Html>}
    </group>)}
    {([
      [[xMax * 1.32, by, 0], "Mₓ · kN·m", "mx"],
      [[bx, yMax * 1.5, 0], "Mᵧ · kN·m", "my"],
      [[bx, by, nMax * 1.14], "N · kN", "n"],
    ] as [InteractionPoint, string, CutAxis][]).filter(([, , axis]) => axis !== view).map(([point, label]) =>
      <Html key={label} position={toWorld(point)} center style={{ pointerEvents: "none" }}>
        <span className="interaction-axis-name">{label}</span>
      </Html>)}
  </group>;
}

function DragCut({ axis, value, onCut, onDragging }: {
  axis: CutAxis; value: number; onCut: Props["onCut"]; onDragging: (dragging: boolean) => void;
}) {
  const object = useMemo(() => new THREE.Group(), []);
  const point: InteractionPoint = axis === "n" ? [xMax * 1.08, 0, value]
    : axis === "my" ? [xMax * 1.08, value, nMax * 0.55] : [value, yMin * 1.08, nMax * 0.55];
  return <TransformControls object={object} mode="translate" space="world" size={0.75}
    showX={axis === "mx"} showY={axis === "n"} showZ={axis === "my"}
    onMouseDown={() => onDragging(true)} onMouseUp={() => onDragging(false)}
    onObjectChange={() => {
      const dimension = CUT_INDEX[axis];
      const [min, max] = interactionBounds[dimension];
      const physical = fromWorld(object.position)[dimension];
      const clamped = Math.min(max, Math.max(min, physical));
      const adjusted = [...point] as InteractionPoint;
      adjusted[dimension] = clamped;
      object.position.set(...toWorld(adjusted));
      onCut(axis, clamped);
    }}>
    <primitive object={object} position={toWorld(point)}><mesh>
      <sphereGeometry args={[0.085, 16, 12]} />
      <meshBasicMaterial color={CUT_COLORS[axis]} depthTest={false} toneMapped={false} />
    </mesh></primitive>
  </TransformControls>;
}

function Camera({ view, resetKey }: Pick<Props, "view" | "resetKey">) {
  const ref = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera, invalidate, size } = useThree();
  useEffect(() => {
    const positions: Record<InteractionView, [number, number, number]> = {
      iso: [10.7, 8.6, 12.8], n: [0, 18, 0.001], my: [0, 3, 17], mx: [17, 3, 0],
    };
    camera.position.set(...positions[view]);
    // Mantém os eixos dentro da vista em telas estreitas.
    const target = new THREE.Vector3(0, 2.8, 0);
    const fit = Math.max(1, 0.88 / (size.width / size.height));
    camera.position.sub(target).multiplyScalar(fit).add(target);
    camera.up.set(0, 1, 0);
    ref.current?.target.set(0, 2.8, 0);
    ref.current?.update();
    invalidate();
  }, [camera, invalidate, resetKey, size.height, size.width, view]);
  return <OrbitControls ref={ref} makeDefault enableDamping minDistance={7} maxDistance={45}
    target={[0, 2.8, 0]} maxPolarAngle={Math.PI * 0.94} />;
}

function Content(props: Props) {
  const [dragging, setDragging] = useState(false);
  return <>
    <AxisFrame view={props.view} />
    {props.appearance.planes && axes.map(axis => <CutPlane key={axis} axis={axis}
      value={props.cuts[axis]} active={props.activeCut === axis} />)}
    <Surface {...props} dragging={dragging} />
    {props.appearance.wireframe && !props.appearance.clip && <SurfaceGrid />}
    {axes.map(axis => <group key={axis}>
      {props.slices[axis].paths.map((path, i) => <Line key={i} points={path.map(toWorld)}
        color={CUT_COLORS[axis]} lineWidth={props.activeCut === axis ? 4 : 2.5}
        depthTest={false} renderOrder={5}
        onPointerMove={event => {
          if (dragging || event.buttons) return;
          event.stopPropagation();
          const point = physicalLinePoint(event);
          point[CUT_INDEX[axis]] = props.cuts[axis];
          props.onInspect(point, `Corte ${CUT_LABELS[axis]} = ${formatInteraction(props.cuts[axis])}`, false);
        }}
        onClick={event => {
          if (dragging || event.delta > 3) return;
          event.stopPropagation();
          const point = physicalLinePoint(event);
          point[CUT_INDEX[axis]] = props.cuts[axis];
          props.onInspect(point, `Corte ${CUT_LABELS[axis]} = ${formatInteraction(props.cuts[axis])}`, true);
        }} />)}
      {props.slices[axis].isolated.map((point, i) => <mesh key={`p${i}`} position={toWorld(point)} renderOrder={6}
        onPointerMove={event => { if (dragging || event.buttons) return; event.stopPropagation(); props.onInspect(point, `Corte ${CUT_LABELS[axis]} · ponto limite`, false); }}
        onClick={event => { if (dragging || event.delta > 3) return; event.stopPropagation(); props.onInspect(point, `Corte ${CUT_LABELS[axis]} · ponto limite`, true); }}>
        <sphereGeometry args={[0.07, 16, 12]} /><meshBasicMaterial color={CUT_COLORS[axis]} depthTest={false} toneMapped={false} />
      </mesh>)}
    </group>)}
    {props.selected && <mesh position={toWorld(props.selected)} renderOrder={10}>
      <sphereGeometry args={[0.095, 20, 16]} /><meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
    </mesh>}
    <Camera view={props.view} resetKey={props.resetKey} />
    {props.appearance.planes && <DragCut axis={props.activeCut} value={props.cuts[props.activeCut]}
      onCut={props.onCut} onDragging={setDragging} />}
  </>;
}

export function InteractionScene(props: Props) {
  return <div className="canvas-mount" role="img"
    aria-label={`Superfície resistente N–Mx–My. Corte ativo ${CUT_LABELS[props.activeCut]} = ${formatInteraction(props.cuts[props.activeCut])}. Arraste a seta para cortar. Os mesmos controles estão disponíveis no painel lateral.`}>
    <Canvas frameloop="demand" dpr={[1, 1.65]} camera={{ position: [10.7, 8.6, 12.8], fov: 38, near: 0.1, far: 100 }}
      fallback={<div className="interaction-loading">O 3D requer WebGL. Os cortes e diagramas 2D continuam disponíveis abaixo.</div>}
      gl={{ antialias: true, powerPreference: "high-performance" }} onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.NoToneMapping;
        gl.localClippingEnabled = true;
      }}>
      <Content {...props} />
    </Canvas>
  </div>;
}
