// src/main.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildLampGeometry } from "./geometry.js";
import { buildConformingCap } from "./caps.js";
import { materials } from "./materials.js";
import { params, updateParamFromUI } from "./params.js";
import { bindRange, bindSelect, bindCheckbox } from "./ui.js";

let scene, camera, renderer, controls, mesh;
let capTopMesh, capBottomMesh;
let debugGroup;

init();
rebuild();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e12);

  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, -400, 220);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("canvas"), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  hemi.position.set(0, 200, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(100, -200, 300);
  scene.add(dir);

  // -------- Bind active UI controls --------
  bindRange("height", v => { params.height = v; rebuild(); });
  bindRange("rbase", v => { params.rbase = v; rebuild(); });
  bindRange("topscale", v => { params.topscale = v; rebuild(); });
  bindRange("waves", v => { params.waves = v; rebuild(); });
  bindRange("amp", v => { params.amp = v; rebuild(); });
  bindRange("twist", v => { params.twist = v * Math.PI / 180; rebuild(); });

  bindSelect("ripdir", v => { params.ripdir = v; rebuild(); });
  bindSelect("mount", v => { params.mount = v; rebuild(); });
  bindSelect("finish", v => { params.finish = v; rebuild(); });
  bindSelect("res", v => { params.res = v; rebuild(); });

  // -------- Commented out: standing + slot parameters --------
  /*
  bindRange("slotRoll", v => { params.slotRoll = v * Math.PI / 180; rebuild(); });
  bindRange("slotAngle", v => { params.slotAngle = v * Math.PI / 180; rebuild(); });
  bindRange("slotWidth", v => { params.slotWidth = v; rebuild(); });
  bindRange("slotLength", v => { params.slotLength = v; rebuild(); });
  bindRange("slotOvershoot", v => { params.slotOvershoot = v; rebuild(); });
  bindRange("slotOffset", v => { params.slotOffset = v; rebuild(); });
  bindRange("slotMouth", v => { params.slotMouth = v * Math.PI / 180; rebuild(); });
  bindRange("slotTilt", v => { params.slotTilt = v * Math.PI / 180; rebuild(); });
  bindCheckbox("slotDebug", v => { params.slotDebug = v; rebuild(); });
  */

  document.getElementById("version").innerText = window.APP_VERSION || "";
  animate();
}

function rebuild() {
  if (mesh) scene.remove(mesh);
  if (capTopMesh) scene.remove(capTopMesh);
  if (capBottomMesh) scene.remove(capBottomMesh);
  if (debugGroup) scene.remove(debugGroup);

  const geom = buildLampGeometry(params);
  mesh = new THREE.Mesh(geom, materials[params.finish]);
  scene.add(mesh);

  // --- Hanging configuration: top cap with cable hole only ---
  if (params.mount === "hanging") {
    const capTop = buildConformingCap(params, 1, 4.0, 20, { bottomSlot: false });
    capTopMesh = new THREE.Mesh(capTop, materials[params.finish]);
    scene.add(capTopMesh);
  }

  // Standing bottom cap is disabled for now
  /*
  if (params.mount === "standing") {
    const capBottom = buildConformingCap(params, 0, 4.0, 20, { bottomSlot: true, ...params });
    capBottomMesh = new THREE.Mesh(capBottom, materials[params.finish]);
    scene.add(capBottomMesh);

    if (params.slotDebug) {
      debugGroup = buildSlotDebug(params, 0, 20, { bottomSlot: true, ...params });
      if (debugGroup) scene.add(debugGroup);
    }
  }
  */
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
