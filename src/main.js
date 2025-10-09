// src/main.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

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
    const asideW = aside?.offsetWidth || 360;     // left sidebar on desktop
    return Math.max(200, appW - asideW);
  }
  return appW;                                     // full width on mobile (panel is bottom sheet)
}

function getStageHeight() {
  const aside = document.getElementById("sidebar");
  const winH = window.innerHeight;

  if (!isMobile()) return winH;                    // desktop: full height
  const panelH = aside ? aside.offsetHeight : 0;   // mobile: subtract bottom sheet height
  return Math.max(200, winH - panelH);
}

// ---- Renderer & scene ----
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(getStageWidth(), getStageHeight());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;               // slightly brighter for metals

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);      // keep stage dark so lamp pops
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
// If your Three version supports it, this brightens env reflections a touch:
if ("environmentIntensity" in scene) scene.environmentIntensity = 1.2;

// ---- Camera & controls ----
const camera = new THREE.PerspectiveCamera(
  45,
  getStageWidth() / getStageHeight(),
  0.1,
  5000
);
camera.position.set(420, -420, 240);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
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

// ---- Brighter, neutral lighting rig ----
// Soft ambient to lift shadows
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
// Hemisphere fill
const hemi = new THREE.HemisphereLight(0xffffff, 0xdde3f0, 0.9);
hemi.position.set(0, 1, 0);
scene.add(hemi);
// Key (warm) from front-right
const key = new THREE.DirectionalLight(0xfff0de, 1.2);
key.position.set(350, -180, 420);
scene.add(key);
// Fill (cool) from front-left
const fill = new THREE.DirectionalLight(0xe9f2ff, 0.8);
fill.position.set(-320, -260, 300);
scene.add(fill);
// Rim (cool) from behind for silhouette on metals
const rim = new THREE.DirectionalLight(0xdfeaff, 0.7);
rim.position.set(-200, 260, 480);
scene.add(rim);

// Subtle grid at z=0 for orientation
const grid = new THREE.GridHelper(800, 40, 0x294059, 0x1a283b);
grid.rotation.x = Math.PI / 2;
grid.position.z = 0;
scene.add(grid);

let group;               // whole lamp assembly
let materialOuter;       // visual material for the shade
const exporter = new STLExporter();

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
    group.traverse(o => { if (o.geometry) o.geometry.dispose?.(); });
  }
  group = new THREE.Group();

  materialOuter = makeMaterial(params.finish);

  // ---- Lamp body ----
  const body = new THREE.Mesh(buildSurface(params), materialOuter);
  group.add(body);

  // ---- Hanging: cable → socket → bulb → top cap ----
  const capH = 5;

  // Bulb depth: hang it inside the shade (~70% of height)
  const bulbZ = params.height * 0.70;

  // Bulb mesh (frosted-ish glass look)
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

  // Cable from hanger point down to socket above bulb
  const cableTopZ = params.height + 150;  // hanger point above top opening
  const socketH = 12;
  const socketR = 6;
  const socketTopZ = bulbZ + 8;           // where cable meets socket
  const cableLen = Math.max(10, cableTopZ - socketTopZ);

  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2, cableLen, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.9 })
  );
  cable.rotation.x = Math.PI / 2;         // along world Z
  cable.position.z = (cableTopZ + socketTopZ) * 0.5;
  group.add(cable);

  // Small socket between cable and bulb
  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(socketR, socketR, socketH, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 })
  );
  socket.rotation.x = Math.PI / 2;
  socket.position.z = socketTopZ - socketH * 0.5;
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

  // Make sure canvas matches current layout (esp. mobile bottom sheet)
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
// Mount is forced to "hanging" internally; binding is harmless:
bindSelect("mount", "mount", params, rebuild);
bindSelect("finish", "finish", params, rebuild);
bindSelect("res", "res", params, rebuild);

// ---- STL download button ----
document.getElementById("downloadSTL")?.addEventListener("click", () => {
  if (!group) return;
  // Export exactly what you see in the viewer
  const stl = exporter.parse(group);
  const blob = new Blob([stl], { type: "application/sla" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "organic_lamp.stl";
  a.click();
});

// ---- Render loop ----
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

rebuild();
animate();
