// src/main.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { params, clampForBambu } from "@app/params.js";
import { makeMaterial } from "@app/materials.js";
import { buildSurface } from "@app/geometry.js";
import { buildConformingCap } from "@app/caps.js";
import { bindRange, bindSelect } from "@app/ui.js"; // no bindCheck

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

// Lights + grid
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

function rebuild() {
  // Force hanging mode (ignore any “standing” UI)
  params.mount = "hanging";
  clampForBambu(params);

  // Update sidebar labels (only shape params)
  const setL = (id, v) => { const el = document.getElementById("val_" + id); if (el) el.textContent = String(v); };
  setL("height", Math.round(params.height));
  setL("rbase", Math.round(params.rbase));
  setL("topscale", Number(params.topscale).toFixed(2));
  setL("waves", params.waves);
  setL("amp", Number(params.amp).toFixed(2));
  setL("twist", params.twist);

  if (group) {
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  group = new THREE.Group();

  materialOuter = makeMaterial(params.finish);

  // Lamp body
  const body = new THREE.Mesh(buildSurface(params), materialOuter);
  group.add(body);

// Hanging: cable → socket → bulb → top cap
const capH = 5;

// 1) Bulb depth inside the shade
const bulbZ = params.height * 0.70; // deeper inside lamp; adjust 0.6–0.8 as desired

// Bulb mesh
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

// 2) Cable that actually reaches the bulb
const cableTopZ = params.height + 150;           // hang-from point above lamp
const cableBottomZ = bulbZ + 8;                  // meet the socket just above bulb
const cableLen = Math.max(10, cableTopZ - cableBottomZ);
const cable = new THREE.Mesh(
  new THREE.CylinderGeometry(2, 2, cableLen, 24),
  new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.9 })
);
cable.rotation.x = Math.PI / 2;                  // orient cylinder along Z
cable.position.z = (cableTopZ + cableBottomZ) * 0.5;
group.add(cable);

// 3) Little socket that connects cable to bulb
const socketH = 12;
const socketR = 6;
const socket = new THREE.Mesh(
  new THREE.CylinderGeometry(socketR, socketR, socketH, 24),
  new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 })
);
socket.rotation.x = Math.PI / 2;                 // along Z
socket.position.z = cableBottomZ - socketH * 0.5; // sits between cable and bulb
group.add(socket);

// 4) Top cap (unchanged)
const capTop = new THREE.Mesh(
  buildConformingCap(params, 1, capH, 20, { bottomSlot: false }),
  materialOuter
);
group.add(capTop);
 
  // --- NEW: bulb + light at end of cable ---
  const bulbGroup = new THREE.Group();

  // Bulb mesh (simple sphere for now)
  const bulbMesh = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffcc,
      emissive: 0xffffaa,
      emissiveIntensity: 15,
      roughness: 0.4,
      transmission: 9,
      thickness: 1.5
    })
  );

  const bulbZ = params.height * 0.7; // place bulb inside the shade
  bulbMesh.position.z = bulbZ;
  bulbGroup.add(bulbMesh);

  // Light source
  const bulbLight = new THREE.PointLight(0xffeeaa, 1.2, 600, 2.0);
  bulbLight.position.set(0, 0, bulbZ);
  bulbGroup.add(bulbLight);

  group.add(bulbGroup);

  // Positioning
  group.position.z = 0;
  controls.target.set(0, 0, params.height * 0.5);
  controls.update();

  scene.add(group);
}

// Bind only the shape/visual controls
bindRange("height", "height", params, rebuild);
bindRange("rbase", "rbase", params, rebuild);
bindRange("topscale", "topscale", params, rebuild, v => Number(v).toFixed(2));
bindRange("waves", "waves", params, rebuild);
bindRange("amp", "amp", params, rebuild, v => Number(v).toFixed(2));
bindRange("twist", "twist", params, rebuild);

bindSelect("ripdir", "ripdir", params, rebuild);
bindSelect("mount", "mount", params, rebuild); // ignored but harmless
bindSelect("finish", "finish", params, rebuild);
bindSelect("res", "res", params, rebuild);

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
