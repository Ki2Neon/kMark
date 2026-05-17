import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type ModelViewerCleanup = () => void;

const MODEL_VIEWER_SELECTOR = ".kmark-model-viewer[data-kmark-model-display-src]";
const DEFAULT_MODEL_HEIGHT_PX = 360;
const MODEL_FIT_PADDING = 1.04;
const MODEL_MIN_FOV_DEGREES = 25;
const MODEL_MAX_FOV_DEGREES = 60;
const MODEL_UP = new THREE.Vector3(0, 0, 1);
const CAMERA_VIEW_ANGLES: Record<string, readonly [number, number]> = {
  back: [180, 0],
  bottom: [0, -90],
  front: [0, 0],
  iso: [45, 30],
  left: [-90, 0],
  right: [90, 0],
  top: [0, 90],
};

export function prepareKmarkModelViewers(root: HTMLElement): ModelViewerCleanup {
  const viewers = Array.from(root.querySelectorAll<HTMLElement>(MODEL_VIEWER_SELECTOR));
  const cleanups = viewers.map((viewer) => prepareKmarkModelViewer(viewer));

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

function prepareKmarkModelViewer(viewer: HTMLElement): ModelViewerCleanup {
  const loading = viewer.dataset.kmarkModelLoading ?? "lazy";

  if (loading === "eager" || !("IntersectionObserver" in window)) {
    return mountKmarkModelViewer(viewer);
  }

  let mountedCleanup: ModelViewerCleanup | null = null;
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      mountedCleanup = mountKmarkModelViewer(viewer);
    }
  }, { rootMargin: "160px" });

  observer.observe(viewer);

  return () => {
    observer.disconnect();
    mountedCleanup?.();
  };
}

function mountKmarkModelViewer(viewer: HTMLElement): ModelViewerCleanup {
  const source = viewer.dataset.kmarkModelDisplaySrc?.trim() ?? "";
  const canvasRoot = viewer.querySelector<HTMLElement>(".kmark-model-canvas");
  const status = viewer.querySelector<HTMLElement>(".kmark-model-status");

  if (source.length === 0 || canvasRoot === null) {
    showModelError(viewer, status, "3Dモデルを読み込めませんでした");
    return () => {};
  }

  viewer.dataset.kmarkModelState = "loading";
  setModelStatus(status, "3Dモデルを読み込み中");

  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvasRoot.replaceChildren(renderer.domElement);

  const background = viewer.dataset.kmarkModelBg ?? "transparent";
  if (background !== "transparent") {
    scene.background = new THREE.Color(background);
  }

  configureLighting(scene, viewer.dataset.kmarkModelLightPreset ?? "default");

  const loader = new GLTFLoader();
  const state: {
    animationFrame: number | null;
    bounds: THREE.Box3 | null;
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
    controls: OrbitControls | null;
    disposed: boolean;
    model: THREE.Object3D | null;
    previousFrameMs: number;
  } = {
    animationFrame: null,
    bounds: null,
    camera: null,
    controls: null,
    disposed: false,
    model: null,
    previousFrameMs: performance.now(),
  };

  const resizeObserver = new ResizeObserver(() => {
    resizeRenderer(viewer, renderer, state.camera);
    if (state.camera !== null && state.bounds !== null) {
      fitCameraToModel(viewer, state.camera, state.bounds);
    }
  });
  resizeObserver.observe(viewer);
  resizeRenderer(viewer, renderer, state.camera);

  loader.load(source, (gltf) => {
    if (state.disposed) {
      return;
    }

    const model = gltf.scene;
    state.model = model;
    scene.add(model);

    const bounds = new THREE.Box3().setFromObject(model);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    if (Number.isFinite(sphere.radius) && sphere.radius > 0) {
      model.position.sub(sphere.center);
      bounds.setFromObject(model);
    }
    state.bounds = bounds.clone();
    const modelRadius = getBoundsRadius(bounds);

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
    state.controls = configureControls(viewer, renderer.domElement, state.camera);
    resizeRenderer(viewer, renderer, state.camera);
    fitCameraToModel(viewer, state.camera, bounds);

    viewer.dataset.kmarkModelState = "ready";
    if (status !== null) {
      status.hidden = true;
    }

    renderModelFrame(scene, renderer, state, viewer);
  }, undefined, () => {
    showModelError(viewer, status, "3Dモデルを読み込めませんでした");
  });

  return () => {
    state.disposed = true;
    resizeObserver.disconnect();
    if (state.animationFrame !== null) {
      window.cancelAnimationFrame(state.animationFrame);
    }
    state.controls?.dispose();
    disposeObject3D(scene);
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function renderModelFrame(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  state: {
    animationFrame: number | null;
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
    controls: OrbitControls | null;
    disposed: boolean;
    model: THREE.Object3D | null;
    previousFrameMs: number;
  },
  viewer: HTMLElement,
): void {
  if (state.disposed || state.camera === null) {
    return;
  }

  const now = performance.now();
  const deltaSeconds = Math.max(0, (now - state.previousFrameMs) / 1000);
  state.previousFrameMs = now;

  if (getBooleanDataset(viewer.dataset.kmarkModelAutoRotate, false)) {
    const speed = getNumberDataset(viewer.dataset.kmarkModelAutoRotateSpeed, 1.0);
    if (state.controls !== null && state.controls.enabled) {
      state.controls.autoRotate = true;
      state.controls.autoRotateSpeed = speed;
    } else if (state.model !== null) {
      state.model.rotation.z += deltaSeconds * speed;
    }
  }

  state.controls?.update();
  renderer.render(scene, state.camera);
  state.animationFrame = window.requestAnimationFrame(() => {
    renderModelFrame(scene, renderer, state, viewer);
  });
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
    camera.updateProjectionMatrix();
    return;
  }

  fitOrthographicCamera(camera, bounds, target);
  lookAtModelTarget(camera, target);
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
  controls.enabled = getBooleanDataset(viewer.dataset.kmarkModelControls, true);
  controls.enableRotate = getBooleanDataset(viewer.dataset.kmarkModelRotate, true);
  controls.enableZoom = getBooleanDataset(viewer.dataset.kmarkModelZoom, true);
  controls.enablePan = getBooleanDataset(viewer.dataset.kmarkModelPan, false);
  controls.target.copy(parseVector3(viewer.dataset.kmarkModelCameraTarget) ?? new THREE.Vector3(0, 0, 0));
  controls.update();

  return controls;
}

function resizeRenderer(
  viewer: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null,
): void {
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight || DEFAULT_MODEL_HEIGHT_PX);

  renderer.setSize(width, height, false);

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

function clampModelFov(value: number): number {
  return Math.min(MODEL_MAX_FOV_DEGREES, Math.max(MODEL_MIN_FOV_DEGREES, value));
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

function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (mesh.geometry instanceof THREE.BufferGeometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) {
        item.dispose();
      }
    } else if (material instanceof THREE.Material) {
      material.dispose();
    }
  });
}
