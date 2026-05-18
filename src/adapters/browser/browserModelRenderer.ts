import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { type ModelViewpoint } from "../../domain/modelViewpoint";

type ModelViewerCleanup = () => void;
type ModelEdgeOverlay = {
  featureLines: THREE.LineSegments[];
};
type ModelKeyboardMovement = {
  dispose: () => void;
  pressedKeys: Set<string>;
};
type ModelCameraSnapshot = {
  fov: number | null;
  position: readonly [number, number, number];
  projection: "orthographic" | "perspective";
  target: readonly [number, number, number];
  up: readonly [number, number, number];
  zoom: number;
};
type ModelRenderState = {
  animationFrame: number | null;
  bounds: THREE.Box3 | null;
  cameraIdentityKey: string;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
  cameraSnapshotKey: string;
  composer: EffectComposer | null;
  controls: OrbitControls | null;
  disposed: boolean;
  edgeOverlay: ModelEdgeOverlay | null;
  keyboardMovement: ModelKeyboardMovement | null;
  model: THREE.Object3D | null;
  modelRadius: number;
  outlinePass: OutlinePass | null;
  previousFrameMs: number;
  renderer: THREE.WebGLRenderer | null;
  renderSizeKey: string;
  scene: THREE.Scene | null;
};
type ModelViewerScopeEntry = {
  cleanup: ModelViewerCleanup;
  snapshotKey: string;
};
export type ModelViewerScopeOptions = {
  readonly forceEagerLoading?: boolean;
  readonly persistCameraSnapshots?: boolean;
  readonly preserveDrawingBuffer?: boolean;
  readonly restoreCameraSnapshots?: boolean;
};
export type ModelViewerScope = {
  dispose: () => void;
  sync: () => void;
};

const MODEL_VIEWER_SELECTOR = ".kmark-model-viewer[data-kmark-model-display-src]";
const DEFAULT_MODEL_HEIGHT_PX = 360;
const MODEL_FIT_PADDING = 1.04;
const MODEL_MIN_FOV_DEGREES = 25;
const MODEL_MAX_FOV_DEGREES = 60;
const MODEL_MAX_PIXEL_RATIO = 4;
const MODEL_FEATURE_EDGE_THRESHOLD_DEGREES = 70;
const MODEL_FEATURE_EDGE_MIN_SCREEN_SIZE_PX = 220;
const MODEL_FEATURE_EDGE_FULL_SCREEN_SIZE_PX = 420;
const MODEL_KEYBOARD_MOVE_SPEED = 0.9;
const MAX_MODEL_CAMERA_SNAPSHOTS = 160;
const MODEL_VIEWER_REUSE_SEPARATOR = "\u0000";
const MODEL_UP = new THREE.Vector3(0, 0, 1);
const MODEL_KEYBOARD_MOVE_KEYS = new Set(["KeyA", "KeyD", "KeyE", "KeyQ", "KeyS", "KeyW"]);
const CAMERA_VIEW_ANGLES: Record<string, readonly [number, number]> = {
  back: [180, 0],
  bottom: [0, -90],
  front: [0, 0],
  iso: [45, 30],
  left: [-90, 0],
  right: [90, 0],
  top: [0, 90],
};
const mountedModelStates = new WeakMap<HTMLElement, ModelRenderState>();
const modelCameraSnapshots = new Map<string, ModelCameraSnapshot>();

export function prepareKmarkModelViewers(root: HTMLElement, options: ModelViewerScopeOptions = {}): ModelViewerCleanup {
  const scope = createKmarkModelViewerScope(root, options);
  scope.sync();

  return () => {
    scope.dispose();
  };
}

export function renderKmarkModelViewerNow(viewer: HTMLElement): boolean {
  const state = mountedModelStates.get(viewer);

  if (
    state === undefined
    || state.disposed
    || state.scene === null
    || state.renderer === null
    || state.camera === null
  ) {
    return false;
  }

  const now = performance.now();
  const deltaSeconds = Math.max(0, (now - state.previousFrameMs) / 1000);
  state.previousFrameMs = now;
  drawModelFrame(state.scene, state.renderer, state, viewer, deltaSeconds);
  const gl = state.renderer.getContext();
  gl.flush();
  gl.finish();
  return true;
}

export function createKmarkModelViewerScope(
  root: HTMLElement,
  options: ModelViewerScopeOptions = {},
): ModelViewerScope {
  const entries = new Map<HTMLElement, ModelViewerScopeEntry>();

  return {
    dispose: () => {
      for (const [viewer, entry] of entries) {
        maybePersistKmarkModelViewerSnapshot(viewer, entry.snapshotKey, options);
        entry.cleanup();
      }
      entries.clear();
    },
    sync: () => {
      const occurrenceCounts = new Map<string, number>();
      const currentViewers = new Set(Array.from(root.querySelectorAll<HTMLElement>(MODEL_VIEWER_SELECTOR)));

      for (const [viewer, entry] of entries) {
        if (currentViewers.has(viewer)) {
          continue;
        }

        maybePersistKmarkModelViewerSnapshot(viewer, entry.snapshotKey, options);
        entry.cleanup();
        entries.delete(viewer);
      }

      for (const viewer of currentViewers) {
        const snapshotKey = resolveKmarkModelViewerKey(viewer, occurrenceCounts);
        const currentEntry = entries.get(viewer);

        if (currentEntry?.snapshotKey === snapshotKey) {
          continue;
        }

        if (currentEntry !== undefined) {
          maybePersistKmarkModelViewerSnapshot(viewer, currentEntry.snapshotKey, options);
          currentEntry.cleanup();
        }

        entries.set(viewer, {
          cleanup: prepareKmarkModelViewer(viewer, snapshotKey, options),
          snapshotKey,
        });
      }
    },
  };
}

export function preserveReusableKmarkModelViewers(currentRoot: ParentNode, nextRoot: ParentNode): void {
  const reusableViewers = collectReusableKmarkModelViewers(currentRoot);
  const occurrenceCounts = new Map<string, number>();

  for (const nextViewer of nextRoot.querySelectorAll<HTMLElement>(MODEL_VIEWER_SELECTOR)) {
    const reuseKey = resolveKmarkModelViewerKey(nextViewer, occurrenceCounts);
    const reusableViewer = reusableViewers.get(reuseKey)?.shift();

    if (reusableViewer === undefined || !reusableViewer.isConnected) {
      continue;
    }

    syncKmarkModelViewerAttributes(reusableViewer, nextViewer);
    nextViewer.replaceWith(reusableViewer);
  }
}

export function persistKmarkModelViewerSnapshots(root: ParentNode): void {
  const occurrenceCounts = new Map<string, number>();

  for (const viewer of root.querySelectorAll<HTMLElement>(MODEL_VIEWER_SELECTOR)) {
    persistKmarkModelViewerSnapshot(
      viewer,
      resolveKmarkModelViewerKey(viewer, occurrenceCounts),
      resolveKmarkModelViewerIdentityKey(viewer),
    );
  }
}

function collectReusableKmarkModelViewers(root: ParentNode): Map<string, HTMLElement[]> {
  const reusableViewers = new Map<string, HTMLElement[]>();
  const occurrenceCounts = new Map<string, number>();

  for (const viewer of root.querySelectorAll<HTMLElement>(MODEL_VIEWER_SELECTOR)) {
    const reuseKey = resolveKmarkModelViewerKey(viewer, occurrenceCounts);
    const viewers = reusableViewers.get(reuseKey) ?? [];

    viewers.push(viewer);
    reusableViewers.set(reuseKey, viewers);
  }

  return reusableViewers;
}

function syncKmarkModelViewerAttributes(target: HTMLElement, source: HTMLElement): void {
  const modelState = target.dataset.kmarkModelState;

  for (const attribute of Array.from(target.attributes)) {
    if (attribute.name === "data-kmark-model-state") {
      continue;
    }
    if (!source.hasAttribute(attribute.name)) {
      target.removeAttribute(attribute.name);
    }
  }

  for (const attribute of Array.from(source.attributes)) {
    if (attribute.name === "data-kmark-model-state") {
      continue;
    }
    target.setAttribute(attribute.name, attribute.value);
  }

  if (modelState !== undefined) {
    target.dataset.kmarkModelState = modelState;
  }
}

function resolveKmarkModelViewerKey(viewer: HTMLElement, occurrenceCounts: Map<string, number>): string {
  const baseKey = resolveKmarkModelViewerIdentityKey(viewer);
  const occurrence = occurrenceCounts.get(baseKey) ?? 0;

  occurrenceCounts.set(baseKey, occurrence + 1);

  return `${baseKey}${MODEL_VIEWER_REUSE_SEPARATOR}${occurrence}`;
}

function resolveKmarkModelViewerIdentityKey(viewer: HTMLElement): string {
  const modelAttributes = Array.from(viewer.attributes)
    .filter((attribute) => (
      attribute.name.startsWith("data-kmark-model-")
      && attribute.name !== "data-kmark-model-state"
    ))
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .sort()
    .join(MODEL_VIEWER_REUSE_SEPARATOR);
  const baseKey = [
    viewer.tagName.toLowerCase(),
    viewer.getAttribute("role") ?? "",
    viewer.getAttribute("aria-label") ?? "",
    viewer.getAttribute("title") ?? "",
    modelAttributes,
  ].join(MODEL_VIEWER_REUSE_SEPARATOR);

  return baseKey;
}

function persistKmarkModelViewerSnapshot(
  viewer: HTMLElement,
  snapshotKey: string,
  identityKey = resolveKmarkModelViewerIdentityKey(viewer),
): void {
  const state = mountedModelStates.get(viewer);

  if (state === undefined || state.cameraSnapshotKey !== snapshotKey) {
    return;
  }

  const snapshot = createModelCameraSnapshot(state);

  if (snapshot === null) {
    return;
  }

  rememberModelCameraSnapshot(snapshotKey, snapshot);
  rememberModelCameraSnapshot(identityKey, snapshot);
}

function maybePersistKmarkModelViewerSnapshot(
  viewer: HTMLElement,
  snapshotKey: string,
  options: ModelViewerScopeOptions,
  identityKey = resolveKmarkModelViewerIdentityKey(viewer),
): void {
  if (options.persistCameraSnapshots === false) {
    return;
  }

  persistKmarkModelViewerSnapshot(viewer, snapshotKey, identityKey);
}

function rememberModelCameraSnapshot(key: string, snapshot: ModelCameraSnapshot): void {
  modelCameraSnapshots.delete(key);
  modelCameraSnapshots.set(key, snapshot);

  while (modelCameraSnapshots.size > MAX_MODEL_CAMERA_SNAPSHOTS) {
    const oldestKey = modelCameraSnapshots.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    modelCameraSnapshots.delete(oldestKey);
  }
}

export function resetKmarkModelViewerCamera(viewer: HTMLElement): boolean {
  const state = mountedModelStates.get(viewer);

  if (state === undefined || state.camera === null || state.bounds === null) {
    return false;
  }

  const target = parseVector3(viewer.dataset.kmarkModelCameraTarget) ?? new THREE.Vector3(0, 0, 0);

  modelCameraSnapshots.delete(state.cameraSnapshotKey);
  modelCameraSnapshots.delete(state.cameraIdentityKey);
  configureCameraPose(viewer, state.camera, Math.max(state.modelRadius, 0.5));
  fitCameraToModel(viewer, state.camera, state.bounds);
  state.controls?.target.copy(target);
  state.controls?.update();

  return true;
}

export function getKmarkModelViewerViewpoint(viewer: HTMLElement): ModelViewpoint | null {
  const state = mountedModelStates.get(viewer);

  if (state === undefined) {
    return null;
  }

  const snapshot = createModelCameraSnapshot(state);

  if (snapshot === null) {
    return null;
  }

  return {
    fov: snapshot.fov,
    position: snapshot.position,
    projection: snapshot.projection,
    target: snapshot.target,
    zoom: snapshot.zoom,
  };
}

function createModelCameraSnapshot(state: ModelRenderState): ModelCameraSnapshot | null {
  const camera = state.camera;

  if (camera === null) {
    return null;
  }

  const target = state.controls?.target ?? new THREE.Vector3(0, 0, 0);

  return {
    fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : null,
    position: vectorToTuple(camera.position),
    projection: camera instanceof THREE.OrthographicCamera ? "orthographic" : "perspective",
    target: vectorToTuple(target),
    up: vectorToTuple(camera.up),
    zoom: camera.zoom,
  };
}

function restoreModelCameraSnapshot(
  state: ModelRenderState,
  snapshot: ModelCameraSnapshot | undefined,
): void {
  if (snapshot === undefined || state.camera === null) {
    return;
  }

  const cameraProjection = state.camera instanceof THREE.OrthographicCamera ? "orthographic" : "perspective";

  if (cameraProjection !== snapshot.projection) {
    return;
  }

  state.camera.position.set(...snapshot.position);
  state.camera.up.set(...snapshot.up);
  state.camera.zoom = Number.isFinite(snapshot.zoom) && snapshot.zoom > 0 ? snapshot.zoom : 1;

  if (state.camera instanceof THREE.PerspectiveCamera && snapshot.fov !== null) {
    state.camera.fov = clampModelFov(snapshot.fov);
  }

  const target = new THREE.Vector3(...snapshot.target);

  state.controls?.target.copy(target);
  state.camera.lookAt(target);
  state.camera.updateProjectionMatrix();
  state.controls?.update();
}

function vectorToTuple(vector: THREE.Vector3): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function prepareKmarkModelViewer(
  viewer: HTMLElement,
  snapshotKey: string,
  options: ModelViewerScopeOptions,
): ModelViewerCleanup {
  const loading = viewer.dataset.kmarkModelLoading ?? "lazy";

  if (options.forceEagerLoading === true || loading === "eager" || !("IntersectionObserver" in window)) {
    return mountKmarkModelViewer(viewer, snapshotKey, options);
  }

  let mountedCleanup: ModelViewerCleanup | null = null;
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      mountedCleanup = mountKmarkModelViewer(viewer, snapshotKey, options);
    }
  }, { rootMargin: "160px" });

  observer.observe(viewer);

  return () => {
    observer.disconnect();
    mountedCleanup?.();
  };
}

function mountKmarkModelViewer(
  viewer: HTMLElement,
  snapshotKey: string,
  options: ModelViewerScopeOptions,
): ModelViewerCleanup {
  const source = viewer.dataset.kmarkModelDisplaySrc?.trim() ?? "";
  const identityKey = resolveKmarkModelViewerIdentityKey(viewer);
  const canvasRoot = viewer.querySelector<HTMLElement>(".kmark-model-canvas");
  const status = viewer.querySelector<HTMLElement>(".kmark-model-status");

  if (source.length === 0 || canvasRoot === null) {
    showModelError(viewer, status, "3Dモデルを読み込めませんでした");
    return () => {};
  }

  viewer.dataset.kmarkModelState = "loading";
  setModelStatus(status, "3Dモデルを読み込み中");

  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasRoot.replaceChildren(renderer.domElement);

  const background = viewer.dataset.kmarkModelBg ?? "transparent";
  if (background !== "transparent") {
    scene.background = new THREE.Color(background);
  }

  configureLighting(scene, viewer.dataset.kmarkModelLightPreset ?? "default");

  const loader = new GLTFLoader();
  const state: ModelRenderState = {
    animationFrame: null,
    bounds: null,
    camera: null,
    cameraIdentityKey: identityKey,
    cameraSnapshotKey: snapshotKey,
    composer: null,
    controls: null,
    disposed: false,
    edgeOverlay: null,
    keyboardMovement: null,
    model: null,
    modelRadius: 1,
    outlinePass: null,
    previousFrameMs: performance.now(),
    renderer,
    renderSizeKey: "",
    scene,
  };
  mountedModelStates.set(viewer, state);

  const resizeObserver = new ResizeObserver(() => {
    resizeRenderer(viewer, renderer, state.camera, state);
  });
  resizeObserver.observe(viewer);
  resizeRenderer(viewer, renderer, state.camera, state);

  loader.load(source, (gltf) => {
    if (state.disposed) {
      return;
    }

    const model = gltf.scene;
    state.model = model;
    scene.add(model);
    prepareModelDepthOcclusion(model);

    const bounds = new THREE.Box3().setFromObject(model);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    if (Number.isFinite(sphere.radius) && sphere.radius > 0) {
      model.position.sub(sphere.center);
      bounds.setFromObject(model);
    }
    state.bounds = bounds.clone();
    const modelRadius = getBoundsRadius(bounds);
    state.modelRadius = modelRadius;
    state.edgeOverlay = applyModelEdgeOverlay(model, modelRadius);

    if (getBooleanDataset(viewer.dataset.kmarkModelGrid, false)) {
      const grid = new THREE.GridHelper(Math.max(modelRadius * 3, 2), 12);
      grid.rotation.x = Math.PI / 2;
      scene.add(grid);
    }
    if (getBooleanDataset(viewer.dataset.kmarkModelAxes, false)) {
      scene.add(new THREE.AxesHelper(Math.max(modelRadius * 1.25, 1)));
    }

    state.camera = createModelCamera(viewer, modelRadius);
    scene.add(state.camera);
    configureCameraPose(viewer, state.camera, Math.max(modelRadius, 0.5));
    fitCameraToModel(viewer, state.camera, bounds);
    const { composer, outlinePass } = createModelComposer(viewer, renderer, scene, state.camera, model);
    state.composer = composer;
    state.outlinePass = outlinePass;
    state.controls = configureControls(viewer, renderer.domElement, state.camera);
    state.keyboardMovement = configureViewerKeyboardMovement(renderer.domElement);
    resizeRenderer(viewer, renderer, state.camera, state);
    if (options.restoreCameraSnapshots !== false) {
      restoreModelCameraSnapshot(state, modelCameraSnapshots.get(snapshotKey) ?? modelCameraSnapshots.get(identityKey));
    }

    viewer.dataset.kmarkModelState = "ready";
    if (status !== null) {
      status.hidden = true;
    }

    renderModelFrame(scene, renderer, state, viewer);
  }, undefined, () => {
    showModelError(viewer, status, "3Dモデルを読み込めませんでした");
  });

  return () => {
    maybePersistKmarkModelViewerSnapshot(viewer, snapshotKey, options, identityKey);
    state.disposed = true;
    mountedModelStates.delete(viewer);
    resizeObserver.disconnect();
    if (state.animationFrame !== null) {
      window.cancelAnimationFrame(state.animationFrame);
    }
    state.controls?.dispose();
    state.keyboardMovement?.dispose();
    state.outlinePass?.dispose();
    state.composer?.dispose();
    disposeObject3D(scene);
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function renderModelFrame(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  state: ModelRenderState,
  viewer: HTMLElement,
): void {
  if (state.disposed || state.camera === null) {
    return;
  }

  const now = performance.now();
  const deltaSeconds = Math.max(0, (now - state.previousFrameMs) / 1000);
  state.previousFrameMs = now;

  drawModelFrame(scene, renderer, state, viewer, deltaSeconds);
  state.animationFrame = window.requestAnimationFrame(() => {
    renderModelFrame(scene, renderer, state, viewer);
  });
}

function drawModelFrame(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  state: ModelRenderState,
  viewer: HTMLElement,
  deltaSeconds: number,
): void {
  const camera = state.camera;

  if (camera === null) {
    return;
  }

  if (getBooleanDataset(viewer.dataset.kmarkModelAutoRotate, false)) {
    const speed = getNumberDataset(viewer.dataset.kmarkModelAutoRotateSpeed, 1.0);
    if (state.controls !== null && state.controls.enabled) {
      state.controls.autoRotate = true;
      state.controls.autoRotateSpeed = speed;
    } else if (state.model !== null) {
      state.model.rotation.z += deltaSeconds * speed;
    }
  }

  resizeRenderer(viewer, renderer, camera, state);
  applyKeyboardMovement(state, deltaSeconds);
  updateModelEdgeOverlay(viewer, state);
  state.controls?.update();
  if (state.composer !== null) {
    state.composer.render(deltaSeconds);
  } else {
    renderer.render(scene, camera);
  }
  viewer.dataset.kmarkModelFrameState = "rendered";
}

function configureLighting(scene: THREE.Scene, preset: string): void {
  if (preset === "none") {
    return;
  }

  const config = {
    default: { ambient: 0.55, directional: 1.0 },
    flat: { ambient: 1.0, directional: 0.0 },
    product: { ambient: 0.62, directional: 1.35 },
    studio: { ambient: 0.7, directional: 1.2 },
  }[preset] ?? { ambient: 0.55, directional: 1.0 };

  scene.add(new THREE.AmbientLight(0xffffff, config.ambient));

  if (config.directional > 0) {
    const key = new THREE.DirectionalLight(0xffffff, config.directional);
    key.position.set(3, -4, 5);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, config.directional * 0.35);
    fill.position.set(-4, 3, 2);
    scene.add(fill);
  }
}

function prepareModelDepthOcclusion(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.Material)) {
        continue;
      }

      material.depthTest = true;
      if (isEffectivelyOpaqueMaterial(material)) {
        material.transparent = false;
        material.depthWrite = true;
      }
    }
  });
}

function isEffectivelyOpaqueMaterial(material: THREE.Material): boolean {
  return material.opacity >= 0.995 && material.alphaTest <= 0;
}

function applyModelEdgeOverlay(model: THREE.Object3D, _modelRadius: number): ModelEdgeOverlay {
  const meshes: THREE.Mesh[] = [];
  const featureLines: THREE.LineSegments[] = [];

  model.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) {
      meshes.push(child);
    }
  });

  for (const mesh of meshes) {
    if (!mesh.geometry.hasAttribute("position")) {
      continue;
    }
    if (!mesh.geometry.hasAttribute("normal")) {
      mesh.geometry.computeVertexNormals();
    }

    const edges = new THREE.EdgesGeometry(mesh.geometry, MODEL_FEATURE_EDGE_THRESHOLD_DEGREES);
    const material = new THREE.LineBasicMaterial({
      color: 0x020617,
      linewidth: 1,
      opacity: 0.85,
      transparent: true,
      depthFunc: THREE.LessEqualDepth,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(edges, material);
    lines.name = "kmark-model-feature-edge-lines";
    lines.frustumCulled = false;
    lines.renderOrder = 2;
    mesh.add(lines);
    featureLines.push(lines);
  }

  return { featureLines };
}

function updateModelEdgeOverlay(viewer: HTMLElement, state: ModelRenderState): void {
  if (state.edgeOverlay === null || state.bounds === null || state.camera === null) {
    return;
  }

  const screenSize = getProjectedBoundsScreenSize(state.bounds, state.camera, viewer);
  const featureOpacity = clamp01(
    (screenSize - MODEL_FEATURE_EDGE_MIN_SCREEN_SIZE_PX)
      / (MODEL_FEATURE_EDGE_FULL_SCREEN_SIZE_PX - MODEL_FEATURE_EDGE_MIN_SCREEN_SIZE_PX),
  );

  for (const line of state.edgeOverlay.featureLines) {
    const material = line.material;
    if (material instanceof THREE.LineBasicMaterial) {
      material.opacity = 0.85 * featureOpacity;
    }
    line.visible = featureOpacity > 0.08;
  }
}

function createModelComposer(
  viewer: HTMLElement,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  model: THREE.Object3D,
): { composer: EffectComposer; outlinePass: OutlinePass } {
  const { height, pixelRatio, width } = getViewerRenderSize(viewer);
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  const outlinePass = new OutlinePass(new THREE.Vector2(width, height), scene, camera, [model]);
  outlinePass.edgeStrength = 4.6;
  outlinePass.edgeThickness = 1.15;
  outlinePass.edgeGlow = 0;
  outlinePass.pulsePeriod = 0;
  outlinePass.downSampleRatio = 1;
  outlinePass.visibleEdgeColor.set(0x020617);
  outlinePass.hiddenEdgeColor.set(0x000000);

  composer.addPass(renderPass);
  composer.addPass(outlinePass);
  composer.addPass(new OutputPass());

  return { composer, outlinePass };
}

function createModelCamera(
  viewer: HTMLElement,
  radius: number,
): THREE.PerspectiveCamera | THREE.OrthographicCamera {
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight || DEFAULT_MODEL_HEIGHT_PX);
  const aspect = width / height;
  const projection = viewer.dataset.kmarkModelProjection ?? "perspective";

  if (projection === "orthographic") {
    const scale = Math.max(radius * 2.4, 1);
    return new THREE.OrthographicCamera(
      -scale * aspect * 0.5,
      scale * aspect * 0.5,
      scale * 0.5,
      -scale * 0.5,
      0.01,
      Math.max(radius * 100, 1000),
    );
  }

  return new THREE.PerspectiveCamera(
    clampModelFov(getNumberDataset(viewer.dataset.kmarkModelFov, 45)),
    aspect,
    0.01,
    Math.max(radius * 100, 1000),
  );
}

function configureCameraPose(
  viewer: HTMLElement,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  radius: number,
): void {
  camera.up.copy(MODEL_UP);

  const target = parseVector3(viewer.dataset.kmarkModelCameraTarget) ?? new THREE.Vector3(0, 0, 0);
  const explicitPosition = parseVector3(viewer.dataset.kmarkModelCameraPosition);

  if (explicitPosition !== null) {
    camera.position.copy(explicitPosition);
    lookAtModelTarget(camera, target);
    return;
  }

  const view = viewer.dataset.kmarkModelView ?? "iso";
  const [viewYaw, viewPitch] = CAMERA_VIEW_ANGLES[view] ?? CAMERA_VIEW_ANGLES.iso;
  const yaw = degreesToRadians(getNumberDataset(viewer.dataset.kmarkModelCameraYaw, viewYaw));
  const pitch = degreesToRadians(getNumberDataset(viewer.dataset.kmarkModelCameraPitch, viewPitch));
  const distance = getNumberDataset(viewer.dataset.kmarkModelCameraDistance, Math.max(radius * 2.8, 2));
  const horizontal = Math.cos(pitch) * distance;

  camera.position.set(
    target.x + (Math.sin(yaw) * horizontal),
    target.y + (Math.cos(yaw) * horizontal),
    target.z + (Math.sin(pitch) * distance),
  );
  lookAtModelTarget(camera, target);
}

function fitCameraToModel(
  viewer: HTMLElement,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  bounds: THREE.Box3,
): void {
  const target = parseVector3(viewer.dataset.kmarkModelCameraTarget) ?? new THREE.Vector3(0, 0, 0);
  const explicitPosition = parseVector3(viewer.dataset.kmarkModelCameraPosition);
  const hasExplicitDistance = hasFiniteNumberDataset(viewer.dataset.kmarkModelCameraDistance);

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = clampModelFov(camera.fov);

    if (explicitPosition === null && !hasExplicitDistance) {
      const direction = camera.position.clone().sub(target);
      if (direction.lengthSq() <= Number.EPSILON) {
        direction.set(1, -1, 0.75);
      }
      direction.normalize();

      const distance = computePerspectiveFitDistance(bounds, target, direction, camera);
      camera.position.copy(target).addScaledVector(direction, distance);
      lookAtModelTarget(camera, target);
    }

    const radius = getBoundsRadius(bounds);
    const distance = Math.max(camera.position.distanceTo(target), radius);
    camera.near = Math.max(0.001, distance - (radius * 4));
    camera.far = Math.max(distance + (radius * 6), 1000);
    applyModelCameraZoom(viewer, camera);
    return;
  }

  fitOrthographicCamera(camera, bounds, target);
  lookAtModelTarget(camera, target);
  applyModelCameraZoom(viewer, camera);
}

function computePerspectiveFitDistance(
  bounds: THREE.Box3,
  target: THREE.Vector3,
  direction: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
): number {
  const frame = createCameraFrame(direction);
  const verticalTan = Math.tan(degreesToRadians(clampModelFov(camera.fov)) * 0.5);
  const horizontalTan = verticalTan * Math.max(camera.aspect, 0.001);
  const corners = getBoxCorners(bounds);
  let requiredDistance = getBoundsRadius(bounds);

  for (const corner of corners) {
    const offset = corner.clone().sub(target);
    const depth = offset.dot(direction);
    const halfHeightDistance = Math.abs(offset.dot(frame.up)) / verticalTan;
    const halfWidthDistance = Math.abs(offset.dot(frame.right)) / horizontalTan;
    requiredDistance = Math.max(requiredDistance, depth + halfHeightDistance, depth + halfWidthDistance);
  }

  return Math.max(requiredDistance * MODEL_FIT_PADDING, 0.1);
}

function fitOrthographicCamera(
  camera: THREE.OrthographicCamera,
  bounds: THREE.Box3,
  target: THREE.Vector3,
): void {
  const direction = camera.position.clone().sub(target);
  if (direction.lengthSq() <= Number.EPSILON) {
    direction.set(1, -1, 0.75);
  }
  direction.normalize();

  const frame = createCameraFrame(direction);
  const corners = getBoxCorners(bounds);
  let halfWidth = 0;
  let halfHeight = 0;

  for (const corner of corners) {
    const offset = corner.clone().sub(target);
    halfWidth = Math.max(halfWidth, Math.abs(offset.dot(frame.right)));
    halfHeight = Math.max(halfHeight, Math.abs(offset.dot(frame.up)));
  }

  const aspect = Math.max(0.001, camera.right - camera.left) / Math.max(0.001, camera.top - camera.bottom);
  const fittedHalfHeight = Math.max(halfHeight, halfWidth / aspect, 0.5) * MODEL_FIT_PADDING;
  const fittedHalfWidth = fittedHalfHeight * aspect;
  camera.left = -fittedHalfWidth;
  camera.right = fittedHalfWidth;
  camera.top = fittedHalfHeight;
  camera.bottom = -fittedHalfHeight;

  const radius = getBoundsRadius(bounds);
  const distance = Math.max(camera.position.distanceTo(target), radius);
  camera.near = Math.max(0.001, distance - (radius * 4));
  camera.far = Math.max(distance + (radius * 6), 1000);
  camera.updateProjectionMatrix();
}

function createCameraFrame(direction: THREE.Vector3): { right: THREE.Vector3; up: THREE.Vector3 } {
  const cameraUp = resolveCameraUp(direction);
  const right = new THREE.Vector3().crossVectors(cameraUp, direction);
  if (right.lengthSq() <= Number.EPSILON) {
    right.set(1, 0, 0);
  }
  right.normalize();

  const up = new THREE.Vector3().crossVectors(direction, right).normalize();

  return { right, up };
}

function lookAtModelTarget(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
): void {
  const direction = camera.position.clone().sub(target);
  if (direction.lengthSq() > Number.EPSILON) {
    camera.up.copy(resolveCameraUp(direction.normalize()));
  }
  camera.lookAt(target);
}

function resolveCameraUp(direction: THREE.Vector3): THREE.Vector3 {
  if (Math.abs(direction.dot(MODEL_UP)) > 0.98) {
    return new THREE.Vector3(0, 1, 0);
  }

  return MODEL_UP.clone();
}

function configureControls(
  viewer: HTMLElement,
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  const panEnabled = getBooleanDataset(viewer.dataset.kmarkModelPan, false);
  controls.enabled = getBooleanDataset(viewer.dataset.kmarkModelControls, true);
  controls.enableRotate = getBooleanDataset(viewer.dataset.kmarkModelRotate, true);
  controls.enableZoom = getBooleanDataset(viewer.dataset.kmarkModelZoom, true);
  controls.enablePan = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: panEnabled ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
  };
  controls.target.copy(parseVector3(viewer.dataset.kmarkModelCameraTarget) ?? new THREE.Vector3(0, 0, 0));
  controls.update();

  return controls;
}

function configureViewerKeyboardMovement(canvas: HTMLCanvasElement): ModelKeyboardMovement {
  const pressedKeys = new Set<string>();
  canvas.tabIndex = 0;

  const preventMiddleButtonDefault = (event: MouseEvent | PointerEvent) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  };

  const handlePointerDown = (event: PointerEvent) => {
    canvas.focus({ preventScroll: true });
    preventMiddleButtonDefault(event);
  };
  const handleMouseDown = (event: MouseEvent) => {
    canvas.focus({ preventScroll: true });
    preventMiddleButtonDefault(event);
  };
  const handleMouseUp = preventMiddleButtonDefault;
  const handleAuxClick = preventMiddleButtonDefault;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!MODEL_KEYBOARD_MOVE_KEYS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    pressedKeys.add(event.code);
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    if (MODEL_KEYBOARD_MOVE_KEYS.has(event.code)) {
      event.preventDefault();
      pressedKeys.delete(event.code);
    }
  };
  const handleBlur = () => {
    pressedKeys.clear();
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("auxclick", handleAuxClick);
  canvas.addEventListener("keydown", handleKeyDown);
  canvas.addEventListener("blur", handleBlur);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);

  return {
    dispose: () => {
      pressedKeys.clear();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("auxclick", handleAuxClick);
      canvas.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("blur", handleBlur);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    },
    pressedKeys,
  };
}

function applyKeyboardMovement(state: ModelRenderState, deltaSeconds: number): void {
  if (
    state.keyboardMovement === null
    || state.camera === null
    || state.controls === null
    || !state.controls.enabled
    || state.keyboardMovement.pressedKeys.size === 0
  ) {
    return;
  }

  let strafe = 0;
  let forwardTravel = 0;
  let elevation = 0;
  if (state.keyboardMovement.pressedKeys.has("KeyA")) {
    strafe -= 1;
  }
  if (state.keyboardMovement.pressedKeys.has("KeyD")) {
    strafe += 1;
  }
  if (state.keyboardMovement.pressedKeys.has("KeyW")) {
    forwardTravel += 1;
  }
  if (state.keyboardMovement.pressedKeys.has("KeyS")) {
    forwardTravel -= 1;
  }
  if (state.keyboardMovement.pressedKeys.has("KeyQ")) {
    elevation -= 1;
  }
  if (state.keyboardMovement.pressedKeys.has("KeyE")) {
    elevation += 1;
  }

  if (strafe === 0 && forwardTravel === 0 && elevation === 0) {
    return;
  }

  const movement = buildKeyboardMoveVector(state.camera, strafe, forwardTravel, elevation);
  const length = movement.length();
  if (length <= Number.EPSILON) {
    return;
  }

  const speed = Math.max(state.modelRadius, 1) * MODEL_KEYBOARD_MOVE_SPEED * deltaSeconds;
  movement.multiplyScalar(speed / length);
  state.camera.position.add(movement);
  state.controls.target.add(movement);
}

function buildKeyboardMoveVector(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  strafe: number,
  forwardTravel: number,
  elevation: number,
): THREE.Vector3 {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  if (forward.lengthSq() <= Number.EPSILON) {
    forward.set(0, 1, 0);
  }
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, MODEL_UP);
  if (right.lengthSq() <= Number.EPSILON) {
    right.set(1, 0, 0);
  }
  right.normalize();

  return right
    .multiplyScalar(strafe)
    .add(forward.multiplyScalar(forwardTravel))
    .add(MODEL_UP.clone().multiplyScalar(elevation));
}

function resizeRenderer(
  viewer: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null,
  state: ModelRenderState,
): boolean {
  const { height, pixelRatio, width } = getViewerRenderSize(viewer);
  const renderSizeKey = `${width}:${height}:${pixelRatio.toFixed(3)}`;
  const sizeChanged = state.renderSizeKey !== renderSizeKey;

  if (sizeChanged) {
    state.renderSizeKey = renderSizeKey;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    state.composer?.setPixelRatio(pixelRatio);
    state.composer?.setSize(width, height);
  }

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
    camera.fov = clampModelFov(camera.fov);
    camera.updateProjectionMatrix();
  } else if (camera instanceof THREE.OrthographicCamera) {
    const aspect = width / height;
    const frustumHeight = camera.top - camera.bottom;
    camera.left = -(frustumHeight * aspect) * 0.5;
    camera.right = (frustumHeight * aspect) * 0.5;
    camera.updateProjectionMatrix();
  }

  return sizeChanged;
}

function showModelError(
  viewer: HTMLElement,
  status: HTMLElement | null,
  message: string,
): void {
  viewer.dataset.kmarkModelState = "failed";
  const alt = viewer.dataset.kmarkModelAlt?.trim() ?? "";
  const source = viewer.dataset.kmarkModelSource?.trim() ?? "";
  const lines = [message, alt.length > 0 ? `説明: ${alt}` : "", source.length > 0 ? `対象: ${source}` : ""]
    .filter((line) => line.length > 0);

  setModelStatus(status, lines.join("\n"));
}

function setModelStatus(status: HTMLElement | null, text: string): void {
  if (status === null) {
    return;
  }

  status.hidden = false;
  status.textContent = text;
}

function getBooleanDataset(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  return fallback;
}

function getNumberDataset(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasFiniteNumberDataset(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  return Number.isFinite(Number(value));
}

function applyModelCameraZoom(
  viewer: HTMLElement,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
): void {
  const zoom = getNumberDataset(viewer.dataset.kmarkModelCameraZoom, camera.zoom);

  camera.zoom = Number.isFinite(zoom) && zoom > 0 ? zoom : camera.zoom;
  camera.updateProjectionMatrix();
}

function clampModelFov(value: number): number {
  return Math.min(MODEL_MAX_FOV_DEGREES, Math.max(MODEL_MIN_FOV_DEGREES, value));
}

function getViewerRenderSize(viewer: HTMLElement): { height: number; pixelRatio: number; width: number } {
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight || DEFAULT_MODEL_HEIGHT_PX);
  const visualRect = viewer.getBoundingClientRect();
  const visualScale = Math.max(
    1,
    visualRect.width > 0 ? visualRect.width / width : 1,
    visualRect.height > 0 ? visualRect.height / height : 1,
  );
  const pixelRatio = Math.min(MODEL_MAX_PIXEL_RATIO, Math.max(1, (window.devicePixelRatio || 1) * visualScale));

  return { height, pixelRatio, width };
}

function parseVector3(value: string | undefined): THREE.Vector3 | null {
  if (value === undefined) {
    return null;
  }

  const parts = value.split(",").map((part) => Number(part.trim()));

  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return new THREE.Vector3(parts[0], parts[1], parts[2]);
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getBoundsRadius(bounds: THREE.Box3): number {
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());

  return Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 1;
}

function getBoxCorners(bounds: THREE.Box3): THREE.Vector3[] {
  if (
    !Number.isFinite(bounds.min.x)
    || !Number.isFinite(bounds.min.y)
    || !Number.isFinite(bounds.min.z)
    || !Number.isFinite(bounds.max.x)
    || !Number.isFinite(bounds.max.y)
    || !Number.isFinite(bounds.max.z)
  ) {
    return [new THREE.Vector3(0, 0, 0)];
  }

  const { min, max } = bounds;

  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function getProjectedBoundsScreenSize(
  bounds: THREE.Box3,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  viewer: HTMLElement,
): number {
  const corners = getBoxCorners(bounds);
  const rect = viewer.getBoundingClientRect();
  const width = Math.max(1, rect.width || viewer.clientWidth);
  const height = Math.max(1, rect.height || viewer.clientHeight || DEFAULT_MODEL_HEIGHT_PX);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  camera.updateMatrixWorld();
  for (const corner of corners) {
    const projected = corner.clone().project(camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
      continue;
    }
    minX = Math.min(minX, projected.x);
    minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x);
    maxY = Math.max(maxY, projected.y);
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return 0;
  }

  const screenWidth = ((maxX - minX) * 0.5) * width;
  const screenHeight = ((maxY - minY) * 0.5) * height;

  return Math.max(screenWidth, screenHeight);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function disposeObject3D(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: unknown;
      material?: unknown;
    };

    if (renderable.geometry instanceof THREE.BufferGeometry) {
      geometries.add(renderable.geometry);
    }

    const material = renderable.material;
    if (Array.isArray(material)) {
      for (const item of material) {
        if (item instanceof THREE.Material) {
          materials.add(item);
        }
      }
    } else if (material instanceof THREE.Material) {
      materials.add(material);
    }
  });

  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
}
