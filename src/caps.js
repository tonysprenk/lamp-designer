// src/caps.js
import * as THREE from "three";
import { CSG } from "https://cdn.jsdelivr.net/npm/three-csg-ts/+esm";
import { innerRadiusAt } from "./geometry.js";

/**
 * Build a conforming cap at vFrac (0 bottom, 1 top), extruded +Z by capH.
 * Extrude only the outside contour, then subtract with CSG:
 *  - E27 center cylinder
 *  - One capsule cutter for the cable slot (if bottomSlot)
 */
export function buildConformingCap(p, vFrac, capH, holeR = 20, options = {}) {
  const radialSeg = p.res === "low" ? 96 : (p.res === "med" ? 180 : 300);
  const EPS = 1e-4;

  // --- Outer contour (follow inner wall at this height) ---
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * Math.PI * 2 + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995;
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  // Extrude (no holes here)
  const capGeom = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });
  const zOff = (vFrac === 1) ? (p.height - capH) : 0;
  capGeom.translate(0, 0, zOff);

  let capMesh = new THREE.Mesh(capGeom, new THREE.MeshStandardMaterial());
  capMesh.updateMatrixWorld(true); // bake xform for CSG

  // --- Cutter A: E27 hole (single vertical cylinder through the cap) ---
  const e27Height = p.height + 20;                             // tall so it fully cuts
  const e27Geom = new THREE.CylinderGeometry(holeR, holeR, e27Height, 96);
  const e27Mesh = new THREE.Mesh(e27Geom);
  e27Mesh.rotation.x = Math.PI / 2;                            // cylinder axis → Z
  e27Mesh.position.set(0, 0, p.height / 2);                    // span whole lamp
  e27Mesh.updateMatrixWorld(true);

  capMesh = CSG.toMesh(
    CSG.fromMesh(capMesh).subtract(CSG.fromMesh(e27Mesh)),
    capMesh.matrix,
    capMesh.material
  );
  capMesh.updateMatrixWorld(true);

  // --- Cutter B: Slot capsule (only for bottom cap) ---
  if (options.bottomSlot && vFrac === 0) {
    const slotMesh = makeCapsuleCutter3D(p, 0, holeR, capH, options);
    slotMesh.updateMatrixWorld(true);

    capMesh = CSG.toMesh(
      CSG.fromMesh(capMesh).subtract(CSG.fromMesh(slotMesh)),
      capMesh.matrix,
      capMesh.material
    );
  }

  capMesh.geometry.computeVertexNormals();
  return capMesh.geometry;
}

/**
 * Build a true 3D capsule cutter along the slot centerline, with optional
 * tilt around the mouth width axis (the “blue axis”). Returns a Mesh.
 *
 * Options:
 *  slotAngle (rad)  – centerline direction
 *  slotRoll  (rad)  – spin capsule around its centerline (in-plane)
 *  slotMouth (rad)  – rotate the mouth flat within the cap plane
 *  slotTilt  (rad)  – TRUE 3D tilt around mouth width axis
 *  slotWidth (mm), slotLength (mm | 0=auto), slotOvershoot (mm), slotOffset (mm)
 */
function makeCapsuleCutter3D(p, vFrac, holeR, capH, options) {
  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll  ?? 0;
  const mouth = options.slotMouth ?? 0;
  const tilt  = options.slotTilt  ?? 0;

  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width * 0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  // Basis in cap plane
  const ux = Math.cos(theta), uy = Math.sin(theta);           // centerline
  const vAng = theta + Math.PI / 2 + roll + mouth;            // width axis (flat at mouth)
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  // Mouth & tip along centerline (XY plane)
  const rInner = Math.max(0.1, holeR + offset);
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0) ? (rInner + options.slotLength) : rAuto;
  const rTip   = rOuter + halfW + overshoot;

  const p0 = new THREE.Vector3(ux * rInner, uy * rInner, 0);  // mouth center
  const p1 = new THREE.Vector3(ux * rTip,   uy * rTip,   0);  // tip center

  // Capsule = cylinder + two spheres
  const cylLen = p0.distanceTo(p1);
  const cyl = new THREE.CylinderGeometry(halfW, halfW, cylLen + 2 * halfW, 48);
  const cylMesh = new THREE.Mesh(cyl);
  const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
  const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  cylMesh.quaternion.copy(qAlign);
  cylMesh.position.copy(p0.clone().add(p1).multiplyScalar(0.5));

  const s0 = new THREE.Mesh(new THREE.SphereGeometry(halfW, 48, 24)); s0.position.copy(p0);
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(halfW, 48, 24)); s1.position.copy(p1);

  let cutter = CSG.toMesh(
    CSG.fromMesh(cylMesh).union(CSG.fromMesh(s0)).union(CSG.fromMesh(s1)),
    cylMesh.matrix,
    new THREE.MeshStandardMaterial()
  );

  // TRUE 3D tilt around the mouth width axis (through p0)
  if (tilt !== 0) {
    const axis = new THREE.Vector3(vx, vy, 0).normalize();
    const qTilt = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
    cutter.position.sub(p0);
    cutter.applyQuaternion(qTilt);
    cutter.position.add(p0);
  }

  // Make sure the cutter fully spans the cap thickness: scale in Z
  // (Local Z is world Z because we only rotated about XY axes)
  cutter.scale.z = (p.height + 20) / capH;
  cutter.updateMatrixWorld(true);

  return cutter;
}

/* ---------- Debug guides (2D, in XY plane) ---------- */
export function buildSlotDebug(p, vFrac, holeR, options = {}) {
  if (!(options.bottomSlot) || vFrac !== 0) return null;

  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll  ?? 0;
  const mouth = options.slotMouth ?? 0;

  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width * 0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vAng = theta + Math.PI / 2 + roll + mouth;
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  const rInner = Math.max(0.1, holeR + offset);
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0) ? (rInner + options.slotLength) : rAuto;
  const rTip   = rOuter + halfW + overshoot;

  const grp = new THREE.Group();
  // centerline & edges
  grp.add(line([[ux*rInner, uy*rInner, 0], [ux*rTip, uy*rTip, 0]], 0x4ec9b0));
  grp.add(line([[ux*rInner + vx*halfW, uy*rInner + vy*halfW, 0], [ux*rTip + vx*halfW, uy*rTip + vy*halfW, 0]], 0xf78c6c));
  grp.add(line([[ux*rInner - vx*halfW, uy*rInner - vy*halfW, 0], [ux*rTip - vx*halfW, uy*rTip - vy*halfW, 0]], 0xf78c6c));
  grp.add(circle([ux*rTip, uy*rTip, 0], halfW, 32, 0xd19a66)); // tip circle
  grp.add(circle([ux*rAuto, uy*rAuto, 0], 1.2, 24, 0x61afef)); // rim marker
  return grp;
}

function line(points, color) {
  const geom = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  const mat = new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geom, mat);
}
function circle(center, r, seg, color) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(center[0] + r * Math.cos(a), center[1] + r * Math.sin(a), center[2]));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color });
  return new THREE.LineLoop(geom, mat);
}
