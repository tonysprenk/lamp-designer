// src/caps.js
import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

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

  // --- Holes: E27 circle + capsule slot (if bottom) ---
  shape.holes.push(buildCircleHole(holeR, 96));

  if (options.bottomSlot && vFrac === 0) {
    shape.holes.push(buildCapsuleSlot(p, vFrac, holeR, options));
  }

  // --- Extrude along +Z ---
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });
  const zOff = (vFrac === 1) ? (p.height - capH) : 0;
  geom.translate(0, 0, zOff);
  return geom;
}

/* ---------------- holes ---------------- */

function buildCircleHole(radius, seg = 64) {
  // Clockwise circle (hole)
  const h = new THREE.Path();
  for (let j = seg; j >= 0; j--) {
    const a = (j / seg) * Math.PI * 2;
    const x = radius * Math.cos(a), y = radius * Math.sin(a);
    if (j === seg) h.moveTo(x, y); else h.lineTo(x, y);
  }
  h.closePath();
  return h;
}

/**
 * Capsule-like slot whose centerline is radial:
 * - Inner end: semicircle of radius w/2 centered at p0 (overlaps the E27 circle)
 * - Two straight edges along the radial direction
 * - Outer end: semicircle of radius w/2 centered beyond the rim (overshoot)
 *
 * Options:
 *   slotAngle (rad)   – direction of the centerline (0=+X, π/2=+Y)
 *   slotRoll (rad)    – rotate the width direction around the centerline
 *   slotWidth (mm)
 *   slotLength (mm)   – if 0, auto to rim
 *   slotOvershoot (mm)
 *   slotOffset (mm)   – move inner center p0 relative to E27 edge (±)
 */
function buildCapsuleSlot(p, vFrac, holeR, options) {
  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll ?? 0;
  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width * 0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  // Centerline (u) and rolled width direction (v) in the XY plane
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vAng = theta + Math.PI/2 + roll;
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  // Inner & outer centers of the capsule
  const rInner = Math.max(0.1, holeR + offset);
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;

  const p0x = ux * rInner,              p0y = uy * rInner;                 // inner center (near circle)
  const p1x = ux * (rOuter + halfW + overshoot), p1y = uy * (rOuter + halfW + overshoot); // tip center (beyond rim)

  // Edge points (right/left) at inner and outer centers
  const iRx = p0x + vx*halfW, iRy = p0y + vy*halfW; // inner-right
  const iLx = p0x - vx*halfW, iLy = p0y - vy*halfW; // inner-left
  const oRx = p1x + vx*halfW, oRy = p1y + vy*halfW; // outer-right
  const oLx = p1x - vx*halfW, oLy = p1y - vy*halfW; // outer-left

  // Build capsule loop – CLOCKWISE
  // Start at inner-right, go out along right edge, round the tip CW,
  // back along left edge, then round the inner end CW to close.
  const h = new THREE.Path();
  h.moveTo(iRx, iRy);                    // start at inner-right
  h.lineTo(oRx, oRy);                    // right edge (outwards)
  arcCW(h, p1x, p1y, halfW, vAng - Math.PI, vAng, 32);  // outer semicircle (CW)
  h.lineTo(iLx, iLy);                    // left edge (inwards)
  arcCW(h, p0x, p0y, halfW, vAng, vAng - Math.PI, 32);  // inner semicircle (CW)
  h.closePath();

  return h;
}

/* ------------- arc helper (clockwise) ------------- */
function arcCW(path, cx, cy, r, aStart, aEnd, seg = 24) {
  let a0 = aStart, a1 = aEnd;
  if (a1 >= a0) a1 -= 2*Math.PI; // force decreasing angle = CW
  const step = (a1 - a0) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = a0 + step*i;
    path.lineTo(cx + r*Math.cos(a), cy + r*Math.sin(a));
  }
}

/* ---------------- Debug: visual guides ---------------- */
export function buildSlotDebug(p, vFrac, holeR, options = {}) {
  if (!(options.bottomSlot) || vFrac !== 0) return null;

  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll ?? 0;
  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width*0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vAng = theta + Math.PI/2 + roll;
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  const rInner = Math.max(0.1, holeR + offset);
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;
  const rTip   = rOuter + halfW + overshoot;

  const grp = new THREE.Group();

  // Centerline
  grp.add(line([[ux*rInner, uy*rInner, 0], [ux*rTip, uy*rTip, 0]], 0x4ec9b0));
  // Edges
  grp.add(line([[ux*rInner + vx*halfW, uy*rInner + vy*halfW, 0], [ux*rTip + vx*halfW, uy*rTip + vy*halfW, 0]], 0xf78c6c));
  grp.add(line([[ux*rInner - vx*halfW, uy*rInner - vy*halfW, 0], [ux*rTip - vx*halfW, uy*rTip - vy*halfW, 0]], 0xf78c6c));
  // Inner/outer semicircle centers
  grp.add(circle([ux*rInner, uy*rInner, 0], halfW, 32, 0xe5c07b));
  grp.add(circle([ux*rTip,   uy*rTip,   0], halfW, 32, 0xd19a66));
  // Rim marker
  grp.add(circle([ux*rAuto,  uy*rAuto,  0], 1.2, 20, 0x61afef));

  return grp;
}

function line(points, color) {
  const geom = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
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
