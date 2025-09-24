// src/caps.js
import * as THREE from "three";
import { CSG } from "https://cdn.skypack.dev/three-csg-ts";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap at vFrac (0 bottom, 1 top) extruded along +Z by capH.
 * E27 hole (default 20 mm radius).
 * If options.bottomSlot, we cut a D-slot in 2D (fast). If options.slotTilt != 0,
 * we additionally subtract a TRUE 3D tilted capsule to rotate around the mouth axis.
 *
 * Slot options:
 *   slotAngle (rad)  – centerline direction
 *   slotRoll  (rad)  – spin capsule around centerline (in-plane)
 *   slotMouth (rad)  – rotate mouth flat within the plane (independent of roll)
 *   slotTilt  (rad)  – TRUE 3D tilt around mouth width axis (your “blue axis”)
 *   slotWidth (mm), slotLength (mm | 0=auto), slotOvershoot (mm), slotOffset (mm)
 */
export function buildConformingCap(p, vFrac, capH, holeR = 20, options = {}) {
  const radialSeg = p.res === "low" ? 96 : (p.res === "med" ? 180 : 300);
  const EPS = 1e-4;

  // --- Outer boundary (conform to inner wall at height vFrac) ---
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * Math.PI * 2 + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995;
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  // Always subtract the circular E27 hole
  shape.holes.push(circleHolePath(holeR, 96));

  // 2D D-shaped slot (fast) if bottom
  if (options.bottomSlot && vFrac === 0) {
    shape.holes.push(dSlotPath(p, vFrac, holeR, options));
  }

  // --- Extrude along +Z ---
  const capGeom = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });
  const zOff = (vFrac === 1) ? (p.height - capH) : 0;
  capGeom.translate(0, 0, zOff);

  // --- If we have a TRUE tilt, subtract a 3D tilted capsule cutter ---
  if (options.bottomSlot && vFrac === 0 && (options.slotTilt ?? 0) !== 0) {
    const capMesh = new THREE.Mesh(capGeom, new THREE.MeshStandardMaterial());
    const cutMesh = makeTiltedCapsuleCutter(p, 0, holeR, capH, options);

    // three-csg-ts boolean
    const resMesh = CSG.toMesh(
      CSG.fromMesh(capMesh).subtract(CSG.fromMesh(cutMesh)),
      capMesh.matrix,
      capMesh.material
    );
    resMesh.geometry.computeVertexNormals();
    return resMesh.geometry;
  }

  return capGeom;
}

/* ---------------- 2D paths for extrusion ---------------- */

function circleHolePath(radius, seg = 64) {
  const h = new THREE.Path(); // clockwise
  for (let j = seg; j >= 0; j--) {
    const a = (j / seg) * Math.PI * 2;
    const x = radius * Math.cos(a), y = radius * Math.sin(a);
    if (j === seg) h.moveTo(x, y); else h.lineTo(x, y);
  }
  h.closePath();
  return h;
}

/** D-shaped slot: flat mouth (tangent), straight edges, rounded tip (capsule) */
function dSlotPath(p, vFrac, holeR, options) {
  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll  ?? 0;
  const mouth = options.slotMouth ?? 0;

  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width * 0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  // Centerline u and mouth width axis v (in-plane)
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vAng = theta + Math.PI / 2 + roll + mouth; // flat at the mouth, tangent to circle
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  const rInner = Math.max(0.1, holeR + offset);
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;
  const rTip = rOuter + halfW + overshoot;

  const p0x = ux * rInner, p0y = uy * rInner; // mouth center (on circle radius)
  const p1x = ux * rTip,   p1y = uy * rTip;   // tip center (beyond rim)

  const iRx = p0x + vx*halfW, iRy = p0y + vy*halfW;
  const iLx = p0x - vx*halfW, iLy = p0y - vy*halfW;
  const oRx = p1x + vx*halfW, oRy = p1y + vy*halfW;
  const oLx = p1x - vx*halfW, oLy = p1y - vy*halfW;

  const h = new THREE.Path(); // CW
  h.moveTo(iRx, iRy);                             // mouth right
  h.lineTo(oRx, oRy);                             // right edge
  arcCW(h, p1x, p1y, halfW, vAng, vAng + Math.PI, 32); // tip arc CW
  h.lineTo(iLx, iLy);                             // left edge
  h.lineTo(iRx, iRy);                             // flat mouth chord (tangent plane)
  h.closePath();
  return h;
}

/* clockwise arc helper */
function arcCW(path, cx, cy, r, aStart, aEnd, seg = 24) {
  let a0 = aStart, a1 = aEnd;
  if (a1 >= a0) a1 -= 2 * Math.PI; // force decreasing angle (CW)
  const step = (a1 - a0) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = a0 + step * i;
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/* ---------------- TRUE 3D tilted capsule cutter ---------------- */
function makeTiltedCapsuleCutter(p, vFrac, holeR, capH, options) {
  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll  ?? 0;
  const mouth = options.slotMouth ?? 0;
  const tilt  = options.slotTilt  ?? 0;

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

  const p0 = new THREE.Vector3(ux*rInner, uy*rInner, 0); // mouth center (on cap plane)
  const p1 = new THREE.Vector3(ux*rTip,   uy*rTip,   0); // tip center (on cap plane)

  // Build capsule: cylinder + two spheres (radius = halfW)
  const cylLen = p0.distanceTo(p1);
  const cyl = new THREE.CylinderGeometry(halfW, halfW, cylLen + 2*halfW, 32);
  const cylMesh = new THREE.Mesh(cyl);
  const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
  const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
  cylMesh.quaternion.copy(qAlign);
  cylMesh.position.copy(p0.clone().add(p1).multiplyScalar(0.5));

  const s0 = new THREE.Mesh(new THREE.SphereGeometry(halfW, 32, 16));
  s0.position.copy(p0);
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(halfW, 32, 16));
  s1.position.copy(p1);

  // Union into a single cutter mesh
  const cutterMesh = CSG.toMesh(
    CSG.fromMesh(cylMesh).union(CSG.fromMesh(s0)).union(CSG.fromMesh(s1)),
    cylMesh.matrix,
    new THREE.MeshStandardMaterial()
  );

  // Apply TRUE tilt around the mouth width axis (blue axis through p0 along v)
  const axis = new THREE.Vector3(vx, vy, 0).normalize();
  const qTilt = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
  cutterMesh.position.sub(p0); cutterMesh.applyQuaternion(qTilt); cutterMesh.position.add(p0);

  // Make sure it fully cuts through the cap thickness (pad in Z)
  const pad = new THREE.BoxGeometry(width*3, width*3, p.height + 20);
  const padMesh = new THREE.Mesh(pad);
  padMesh.position.set(p0.x + (p1.x - p0.x)/2, p0.y + (p1.y - p0.y)/2, p.height/2);
  const cutterPadded = CSG.toMesh(
    CSG.fromMesh(cutterMesh).union(CSG.fromMesh(padMesh)),
    cutterMesh.matrix,
    cutterMesh.material
  );

  return cutterPadded;
}

/* ---------------- Debug guides ---------------- */
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

  // Centerline
  grp.add(line([[ux*rInner, uy*rInner, 0], [ux*rTip, uy*rTip, 0]], 0x4ec9b0));
  // Width edges
  grp.add(line([[ux*rInner + vx*halfW, uy*rInner + vy*halfW, 0],
                [ux*rTip   + vx*halfW, uy*rTip   + vy*halfW, 0]], 0xf78c6c));
  grp.add(line([[ux*rInner - vx*halfW, uy*rInner - vy*halfW, 0],
                [ux*rTip   - vx*halfW, uy*rTip   - vy*halfW, 0]], 0xf78c6c));

  // Tip circle
  grp.add(circle([ux*rTip, uy*rTip, 0], halfW, 32, 0xd19a66));
  // Rim marker
  grp.add(circle([ux*rAuto, uy*rAuto, 0], 1.2, 20, 0x61afef));
  // Mouth chord (flat)
  grp.add(line([[ux*rInner + vx*halfW, uy*rInner + vy*halfW, 0],
                [ux*rInner - vx*halfW, uy*rInner - vy*halfW, 0]], 0xe5c07b));

  return grp;
}

function line(points, color) {
  const geom = new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
  const mat = new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geom, mat);
}
function circle(center, r, seg, color) {
  const pts = [];
  for (let i=0;i<=seg;i++){
    const a = (i/seg)*Math.PI*2;
    pts.push(new THREE.Vector3(center[0]+r*Math.cos(a), center[1]+r*Math.sin(a), center[2]));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color });
  return new THREE.LineLoop(geom, mat);
}
