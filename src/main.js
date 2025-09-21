// src/main.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { params, clampForBambu } from "@app/params.js";
import { makeMaterial } from "@app/materials.js";
import { buildSurface } from "@app/geometry.js";
import { buildConformingCap, buildSlotDebug } from "@app/caps.js";
import { bindRange, bindSelect, bindCheck } from "@app/ui.js";

// Version badge
const ver = document.getElementById("version");
if (ver && window.APP_VERSION) ver.textContent = "v" + window.APP_VERSION;
if (window.APP_VERSION) console.log("Organic Lamp Designer v" + window.APP_VERSION);

// Renderer & scene
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth - 360, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e12);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;

// Camera
const camera = new THREE.PerspectiveCamera(
  45,
  (window.innerWidth - 360) / window.innerHeight,
  0.1,
  5000
);
camera.position.set(420, -420, 240);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 115);
controls.enableDamping = true;
controls.update();

// Lights + grid (XY at z=0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(300, -300, 480);
scene.add(dir);

const grid = new THREE.GridHelper(800, 40, 0x294059, 0x1a283b);
grid.rotation.x = Math.PI / 2;
grid.position.z = 0;
scene.add(grid);

let group;
let materialOuter;
let debugGroup = null;

function rebuild() {
  clampForBambu(params);

  const setL = (id, val) => {
    const el = document.getElementById("val_" + id);
    if (el) el.textContent = String(val);
  };
  setL("height", Math.round(params.height));
  setL("rbase", Math.round(params.rbase));
  setL("topscale", Number(params.topscale).toFixed(2));
  setL("waves", params.waves);
  setL("amp", Number(params.amp).toFixed(2));
  setL("twist", params.twist);
  setL("slotAngle", params.slotAngleDeg);
  setL("slotWidth", Number(params.slotWidth).toFixed(1));
  setL("slotLength", params.slotLength);
  setL("slotOvershoot", Number(params.slotOvershoot).toFixed(1));
  setL("slotOffset", Number(params.slotOffset).toFixed(1));

  if (group) {
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  group = new THREE.Group();

  materialOuter = makeMaterial(params.finish);

  // Lamp body (Z-up 0..H)
  const body = new THREE.Mesh(buildSurface(params), materialOuter);
  group.add(body);

  // Caps
  const capH = 5;
  if (params.mount === "standing") {
    const opts = {
      bottomSlot: true,
      slotWidth: params.slotWidth,
      slotAngle: (params.slotAngleDeg * Math.PI) / 180,
      slotLength: params.slotLength || 0, // 0 => auto to rim
      slotOvershoot: params.slotOvershoot,
      slotOffset: params.slotOffset
    };

    const capBottom = new THREE.Mesh(
      buildConformingCap(params, 0, capH, 20, opts),
      materialOuter
    );
    group.add(capBottom);

    // Debug guides
    if (debugGroup) { group.remove(debugGroup); debugGroup = null; }
    if (params.slotDebug) {
      debugGroup = buildSlotDebug(params, 0, 20, opts);
      if (debugGroup) group.add(debugGroup);
    }
  } else {
    // Hanging: rotate cable so it runs along +Z
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 300, 24),
      new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.9 })
    );
    cable.rotation.x = Math.PI / 2;
    cable.position.z = params.height + 150;
    group.add(cable);

    const capTop = new THREE.Mesh(buildConformingCap(params, 1, capH, 20, {}), materialOuter);
    group.add(capTop);

    if (debugGroup) { group.remove(debugGroup); debugGroup = null; }
  }

  group.position.z = 0;
  controls.target.set(0, 0, params.height * 0.5);
  controls.update();

  scene.add(group);
}

// UI bindings (null-safe helpers)
bindRange("height", "height", params, rebuild);
bindRange("rbase", "rbase", params, rebuild);
bindRange("topscale", "topscale", params, rebuild, v => Number(v).toFixed(2));
bindRange("waves", "waves", params, rebuild);
bindRange("amp", "amp", params, rebuild, v => Number(v).toFixed(2));
bindRange("twist", "twist", params, rebuild);
bindSelect("ripdir", "ripdir", params, rebuild);
bindSelect("finish", "finish", params, rebuild);
bindSelect("res", "res", params, rebuild);
bindSelect("mount", "mount", params, rebuild);

// NEW: slot controls
bindRange("slotAngle", "slotAngleDeg", params, rebuild);
bindRange("slotWidth", "slotWidth", params, rebuild, v => Number(v).toFixed(1));
bindRange("slotLength", "slotLength", params, rebuild);
bindRange("slotOvershoot", "slotOvershoot", params, rebuild, v => Number(v).toFixed(1));
bindRange("slotOffset", "slotOffset", params, rebuild, v => Number(v).toFixed(1));
bindCheck("slotDebug", "slotDebug", params, rebuild);

// Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth - 360, window.innerHeight);
  camera.aspect = (window.innerWidth - 360) / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
rebuild();
animate();
