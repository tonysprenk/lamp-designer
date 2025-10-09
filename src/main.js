// src/main.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { params, clampForBambu } from "@app/params.js";
import { makeMaterial } from "@app/materials.js";
import { buildSurface } from "@app/geometry.js";
import { buildConformingCap } from "@app/caps.js";
import { bindRange, bindSelect } from "@app/ui.js";

// ---- Version badge ----
const ver = document.getElementById("version");
if (ver && window.APP_VERSION) ver.textContent = "v" + window.APP_VERSION;
if (window.APP_VERSION) console.log("Organic Lamp Designer v" + window.APP_VERSION);

// ---- Stage sizing helpers (desktop sidebar vs. mobile bottom sheet) ----
function isMobile() { return window.matchMedia("(max-width: 900px)").matches; }

function getStageWidth() {
  const app = document.getElementById("app");
  const aside = document.getElementById("sidebar");
  const appW = app?.clientWidth || window.innerWidth;

  if (!isMobile()) {
    // Desktop: sidebar consumes a fixed grid column (≈360px)
    const asideW = aside?.offsetWidth || 360;
    return Math.max(200, appW - asideW);
  }
  // Mobile: panel sits at bottom, so stage uses full width
  return appW;
}

function getStageHeight() {
  const aside = document.getElementById("sidebar");
  const winH = window.innerHeight;

  if (!isMobile()) {
    // Desktop: full height for stage
    return winH;
  }
  // Mobile: subtract bottom sheet height (collapsed or expanded)
  const panelH = aside ? aside.offsetHeight : 0;
  return Math.max(200, winH - panelH);
}

// ---- Renderer & scene ----
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(getStageWidth(), getStageHeight());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116); // dark stage so lamp pops
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;

// ---- Camera & controls ----
const camera = new THREE.PerspectiveCamera(
  45,
  getStageWidth() / getStageHeight(),
  0.1,
  5000
);
camera.position.set(420, -420, 240);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 115);
controls.enableDamping = true;
controls.update();

// ---- Responsive sizing on load and resize ----
renderer.setSize(getStageWidth(), getStageHeight());
camera.aspect = getStageWidth() / getStageHeight();
camera.updateProjectionMatrix();

export function forceResize() {
  renderer.setSize(getStageWidth(), getStageHeight());
  camera.aspect = getStageWidth() / getStageHeight();
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", forceResize, { passive: true });

// ---- Lights & helpers ----
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(300, -300, 480);
scene.add(dir);

// Subtle grid at z=0 for orientation
const grid = new THREE.GridHelper(800, 40, 0x294059, 0x1a283b);
grid.rotation.x = Math.PI / 2;
grid.position.z = 0;
scene.add(grid);

let group;
let materialOuter;

function rebuild() {
  // Focus on hanging mode
  params.mount = "hanging";
  clampForBambu(params);

  // Update small value labels (shape params only)
  const setL = (id, v) => {
    const el = document.getElementById("val_" + id);
    if (el) el.textContent = String(v);
  };
  setL("height", Math.round(params.height));
  setL("rbase", Math.round(params.rbase));
  setL("topscale", Number(params.topscale).toFixed(2));
  setL("waves", params.waves);
  setL("amp", Number(params.amp).toFixed(2));
  setL("twist", params.twist);

  // Clear previous
  if (group) {
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  group = new THREE.Group();

  materialOuter = makeMaterial(params.finish);

  // ---- Lamp body ----
  const body = new THREE.Mesh(buildSurface(params), materialOuter);
  group.add(body);

  // ---- Hanging: cable → socket → bulb → top cap ----
  const capH = 5;

  // Bulb depth: hang it inside the shade (70% of height is a good start)
  const bulbZ = params.height * 0.70;

  // Bulb mesh (simple frosted sphere)
  const bulbMesh = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffcc,
      emissive: 0xffffaa,
      emissiveIntensity: 1.5,
      roughness: 0.4,
      transmission: 0.9,
      thickness: 1.5
    })
  );
  bulbMesh.position.z = bulbZ;
  group.add(bulbMesh);

  // Light source at bulb center
  const bulbLight = new THREE.PointLight(0xffeeaa, 1.2, 600, 2.0);
  bulbLight.position.set(0, 0, bulbZ);
  group.add(bulbLight);

  // Cable from hanger point down to the socket just above bulb
  const cableTopZ = params.height + 150;  // hanger point above lamp
  const socketH = 12;
  const socketR = 6;
  const socketTopZ = bulbZ + 8;           // where cable meets socket
  const cableLen = Math.max(10, cableTopZ - socketTopZ);

  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2, cableLen, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.9 })
  );
  cable.rotation.x = Math.PI / 2; // orient cylinder along Z
  cable.position.z = (cableTopZ + socketTopZ) * 0.5;
  group.add(cable);

  // Small socket between cable and bulb
  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(socketR, socketR, socketH, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 })
  );
  socket.rotation.x = Math.PI / 2;
  socket.position.z = socketTopZ - socketH * 0.5; // sits just above bulb
  group.add(socket);

  // Top cap (conforms to inner shape)
  const capTop = new THREE.Mesh(
    buildConformingCap(params, 1, capH, 20, { bottomSlot: false }),
    materialOuter
  );
  group.add(capTop);

  // Final placement
  group.position.z = 0;
  controls.target.set(0, 0, params.height * 0.5);
  controls.update();

  scene.add(group);

  // After rebuild, ensure canvas uses the current layout space
  forceResize();
}

// ---- UI bindings (shape + look only) ----
bindRange("height", "height", params, rebuild);
bindRange("rbase", "rbase", params, rebuild);
bindRange("topscale", "topscale", params, rebuild, v => Number(v).toFixed(2));
bindRange("waves", "waves", params, rebuild);
bindRange("amp", "amp", params, rebuild, v => Number(v).toFixed(2));
bindRange("twist", "twist", params, rebuild);

bindSelect("ripdir", "ripdir", params, rebuild);
// Mount is forced to "hanging" internally; binding is harmless for now:
bindSelect("mount", "mount", params, rebuild);
bindSelect("finish", "finish", params, rebuild);
bindSelect("res", "res", params, rebuild);

// ---- Render loop ----
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
rebuild();

// ---- STL download ----
import { STLExporter } from "three/addons/exporters/STLExporter.js";
const exporter = new STLExporter();

document.getElementById("downloadSTL")?.addEventListener("click", () => {
  if (!group) return;
  const stl = exporter.parse(group);
  const blob = new Blob([stl], { type: "application/sla" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "organic_lamp.stl";
  a.click();
});

animate();
