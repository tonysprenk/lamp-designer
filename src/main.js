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
function isMobile() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function getStageWidth() {
  const app = document.getElementById("app");
  const aside = document.getElementById("sidebar");
  const appW = app?.clientWidth || window.innerWidth;

  if (!isMobile()) {
    const asideW = aside?.offsetWidth || 360;
    return Math.max(200, appW - asideW);
  }
  return appW;
}

function getStageHeight() {
  const aside = document.getElementById("sidebar");
  const winH = window.innerHeight;
  if (!isMobile()) return winH;
  const panelH = aside ? aside.offsetHeight : 0;
  return Math.max(200, winH - panelH);
}

// ---- Renderer & scene ----
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(getStageWidth(), getStageHeight());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
if ("environmentIntensity" in scene) scene.environmentIntensity = 1.2;

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

// ---- Responsive sizing ----
renderer.setSize(getStageWidth(), getStageHeight());
camera.aspect = getStageWidth() / getStageHeight();
camera.updateProjectionMatrix();

export function forceResize() {
  renderer.setSize(getStageWidth(), getStageHeight());
  camera.aspect = getStageWidth() / getStageHeight();
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", forceResize, { passive: true });

// ---- Lighting rig ----
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const hemi = new THREE.HemisphereLight(0xffffff, 0xdde3f0, 0.9);
hemi.position.set(0, 1, 0);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff0de, 1.2);
key.position.set(350, -180, 420);
scene.add(key);

const fill = new THREE.DirectionalLight(0xe9f2ff, 0.8);
fill.position.set(-320, -260, 300);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xdfeaff, 0.7);
rim.position.set(-200, 260, 480);
scene.add(rim);

// Orientation grid
const grid = new THREE.GridHelper(800, 40, 0x294059, 0x1a283b);
grid.rotation.x = Math.PI / 2;
grid.position.z = 0;
scene.add(grid);

let group;
let materialOuter;
const exporter = new STLExporter();

function rebuild() {
  params.mount = "hanging";
  clampForBambu(params);

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

  if (group) {
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose?.(); });
  }
  group = new THREE.Group();

  materialOuter = makeMaterial(params.finish);

  // ---- Lamp body ----
  const body = new THREE.Mesh(buildSurface(params), materialOuter);
  group.add(body);

  // ---- Hanging assembly ----
  const capH = 5;
  const bulbZ = params.height * 0.70;

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

  const bulbLight = new THREE.PointLight(0xffeeaa, 1.2, 600, 2.0);
  bulbLight.position.set(0, 0, bulbZ);
  group.add(bulbLight);

  const cableTopZ = params.height + 150;
  const socketH = 12;
  const socketR = 6;
  const socketTopZ = bulbZ + 8;
  const cableLen = Math.max(10, cableTopZ - socketTopZ);

  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2, cableLen, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.9 })
  );
  cable.rotation.x = Math.PI / 2;
  cable.position.z = (cableTopZ + socketTopZ) * 0.5;
  group.add(cable);

  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(socketR, socketR, socketH, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 })
  );
  socket.rotation.x = Math.PI / 2;
  socket.position.z = socketTopZ - socketH * 0.5;
  group.add(socket);

  const capTop = new THREE.Mesh(
    buildConformingCap(params, 1, capH, 20, { bottomSlot: false }),
    materialOuter
  );
  group.add(capTop);

  group.position.z = 0;
  controls.target.set(0, 0, params.height * 0.5);
  controls.update();

  scene.add(group);
  forceResize();
}

// ---- UI bindings ----
bindRange("height", "height", params, rebuild);
bindRange("rbase", "rbase", params, rebuild);
bindRange("topscale", "topscale", params, rebuild, v => Number(v).toFixed(2));
bindRange("waves", "waves", params, rebuild);
bindRange("amp", "amp", params, rebuild, v => Number(v).toFixed(2));
bindRange("twist", "twist", params, rebuild);

bindSelect("ripdir", "ripdir", params, rebuild);
bindSelect("mount", "mount", params, rebuild);
bindSelect("finish", "finish", params, rebuild);
bindSelect("res", "res", params, rebuild);

// ---- STL download ----
document.getElementById("downloadSTL")?.addEventListener("click", () => {
  if (!group) return;
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
