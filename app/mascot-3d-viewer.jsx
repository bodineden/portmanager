"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "/mascot/mascot-3d.glb";
const MODEL_TIMEOUT_MS = 15_000;
const REQUIRED_CLIPS = ["idle", "happy_clap", "excited_bounce"];

let modelBytesPromise;
let animationNamesLogged = false;

function loadModelBytes() {
  if (!modelBytesPromise) {
    modelBytesPromise = new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
        reject(new Error(`Mascot model timed out after ${MODEL_TIMEOUT_MS}ms`));
      }, MODEL_TIMEOUT_MS);

      fetch(MODEL_URL, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`Mascot model request failed with HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then(resolve, reject)
        .finally(() => window.clearTimeout(timeout));
    });
  }
  return modelBytesPromise;
}

function disposeModel(model) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();

  model.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });

  for (const skeleton of skeletons) skeleton.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function frameModel(camera, model, width, height) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model, true);
  if (bounds.isEmpty()) throw new Error("Mascot model has no renderable bounds");

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const aspect = width / height;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const heightDistance = size.y / (2 * Math.tan(verticalFov / 2));
  const widthDistance = size.x / (2 * Math.tan(verticalFov / 2) * aspect);
  const distance = (Math.max(heightDistance, widthDistance) + size.z / 2) * 1.14;

  camera.aspect = aspect;
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.position.set(center.x, center.y, center.z + distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return size;
}

export default function Mascot3dViewer({ clip, onStateChange }) {
  const hostRef = useRef(null);
  const runtimeRef = useRef(null);
  const requestedClipRef = useRef(clip);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Probe/load off-DOM so the sprite is the only surface until ready.
    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-mascot-canvas", "");
    canvas.setAttribute("aria-hidden", "true");

    let stopped = false;
    let frameId = 0;
    let resizeObserver;
    let model;
    let mixer;
    let renderer;

    let context;
    try {
      context = canvas.getContext("webgl2", {
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      onStateChange("off");
      return;
    }
    if (!context) {
      onStateChange("off");
      return;
    }

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      onStateChange("off");
      return;
    }

    renderer.setClearColor(0x000000, 0);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    canvas.dataset.mascotPixelRatio = String(pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 2 / 3, 0.01, 100);
    const timer = new THREE.Timer();
    timer.connect(document);

    const key = new THREE.DirectionalLight(0xfff4e8, 3.2);
    key.position.set(3.5, 4.5, 5);
    const fill = new THREE.DirectionalLight(0xd9e8ff, 1.8);
    fill.position.set(-4, 2.5, 3);
    const rim = new THREE.DirectionalLight(0xffffff, 2.2);
    rim.position.set(1, 4, -5);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9e1ee, 1.35), key, fill, rim);

    const resize = () => {
      if (!renderer || !model) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      const size = frameModel(camera, model, width, height);
      canvas.dataset.mascotBounds = [size.x, size.y, size.z].map((value) => value.toFixed(6)).join(",");
      renderer.render(scene, camera);
    };

    const stopLoop = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const renderFrame = (timestamp) => {
      if (stopped || document.hidden || !model || !mixer) {
        stopLoop();
        return;
      }
      timer.update(timestamp);
      mixer.update(timer.getDelta());
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(renderFrame);
    };

    const startLoop = () => {
      if (stopped || document.hidden || frameId || !model || !mixer) return;
      timer.reset();
      frameId = window.requestAnimationFrame(renderFrame);
    };

    const handleVisibility = () => document.hidden ? stopLoop() : startLoop();
    const handleContextLost = (event) => {
      event.preventDefault();
      if (!stopped) onStateChange("off");
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    document.addEventListener("visibilitychange", handleVisibility);

    async function initialise() {
      try {
        const bytes = await loadModelBytes();
        if (stopped) return;
        const gltf = await new GLTFLoader().parseAsync(bytes, "/mascot/");
        if (stopped) {
          disposeModel(gltf.scene);
          return;
        }

        const animationNames = gltf.animations.map((animation) => animation.name);
        if (!animationNamesLogged) {
          console.info(`[mascot-3d] gltf.animations ${JSON.stringify(animationNames)}`);
          animationNamesLogged = true;
        }
        if (animationNames.length !== REQUIRED_CLIPS.length
          || REQUIRED_CLIPS.some((name) => !animationNames.includes(name))) {
          disposeModel(gltf.scene);
          throw new Error(`Mascot model clips differ from the asset contract: ${animationNames.join(", ")}`);
        }
        canvas.dataset.mascotAnimations = animationNames.join(",");

        model = gltf.scene;
        model.traverse((object) => {
          if (object.isMesh) object.frustumCulled = false;
        });
        scene.add(model);
        mixer = new THREE.AnimationMixer(model);
        const actions = new Map(gltf.animations.map((animation) => [animation.name, mixer.clipAction(animation)]));

        const switchClip = (nextName) => {
          const nextAction = actions.get(nextName);
          if (!nextAction || runtimeRef.current?.activeClip === nextName) return;
          nextAction.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(1).setEffectiveWeight(1).play();
          const currentAction = runtimeRef.current?.currentAction;
          if (currentAction) currentAction.crossFadeTo(nextAction, 0.3, false);
          runtimeRef.current = { activeClip: nextName, currentAction: nextAction, switchClip };
          canvas.dataset.mascotMotion = nextName;
        };

        runtimeRef.current = { activeClip: null, currentAction: null, switchClip };
        switchClip(requestedClipRef.current);
        host.appendChild(canvas);
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();
        startLoop();
        onStateChange("on");
      } catch {
        if (!stopped) onStateChange("error");
      }
    }

    void initialise();

    return () => {
      stopped = true;
      stopLoop();
      timer.dispose();
      resizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      runtimeRef.current = null;
      if (mixer && model) {
        mixer.stopAllAction();
        mixer.uncacheRoot(model);
      }
      if (model) {
        scene.remove(model);
        disposeModel(model);
      }
      renderer?.renderLists.dispose();
      renderer?.dispose();
      canvas.remove();
    };
  }, [onStateChange]);

  useEffect(() => {
    requestedClipRef.current = clip;
    runtimeRef.current?.switchClip(clip);
  }, [clip]);

  return <span ref={hostRef} className="mascot-3d-host" aria-hidden="true" />;
}
