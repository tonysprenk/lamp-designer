import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap at vFrac (0 bottom, 1 top), extruded +Z by capH.
 * Central E27 hole (default 20 mm R).
 * If options.bottomSlot && vFrac===0: add a D-shaped slot:
 *   - inner end = FLAT chord tangent to the E27 circle at angle theta
 *   - outer end = semicircle (rounded), overshooting rim for clean trim
 */
export function buildConformingCap(p, vFrac, capH, holeR = 20, options = {}) {
  const radialSeg = p.res === "low" ? 96 : (p.res === "med" ? 180 : 300);
  const EPS = 1e-4;

  // Outer boundary (inner wall at this height)
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
  shape.holes.push(buildCircleHole(holeR, 96));

  // Add D-shaped slot only for bottom cap
  if (options.bottomSlot && vFrac === 0) {
    shape.holes.push(buildDSlot(p, vFrac, holeR, options));
  }

  // Extrude
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });
  const zOff = (vFrac === 1) ? (p.height - capH) : 0;
  geom.translate(0, 0, zOff);
  return geom;
}

/* ---------- holes ---------- */

function buildCircleHole(radius, seg = 64) {
  const h = new THREE.Path(); // clockwise
  for (let j = seg; j >= 0; j--) {
    const a = (j / seg) * Math.PI * 2;
    const x = radius * Math.cos(a), y = radius * Math.sin(a);
    if (j === seg) h.moveTo(x, y); else h.lineTo(x, y);
  }
  h.closePath();
  return h;
}

/**
 * D-shaped slot:
 *  centerline angle: options.slotAngle (rad) (0=+X, π/2=+Y, …)
 *  roll around centerline: options.slotRoll (rad)
 *  width: options.slotWidth (mm)
 *  length: options.slotLength (mm) 0 => auto to rim
 *  overshoot: options.slotOvershoot (mm)
 *  offset: options.slotOffset (mm) shift mouth in/out from E27 edge
 *
 *  Geometry in XY (cap plane):
 *   iR ---- flat mouth ---- iL          (tangent line to circle)
 *             |          |
 *             |          | (edges along +u)
 *            oR  --tip-- oL            (rounded tip beyond rim)
 */
function buildDSlot(p, vFrac, holeR, options) {
  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll  ?? 0;
  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width * 0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  // Centerline u and rolled width axis v (all in cap XY plane)
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vAng = theta + Math.PI / 2 + roll + Math.PI / 2;
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  // Mouth location: exactly on the circle (plus optional offset)
  const rInner = Math.max(0.1, holeR + offset);
  const p0x = ux * rInner, p0y = uy * rInner;      // mouth center (on circle radius)

  // Tip center: beyond the rim
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;
  const rTip = rOuter + halfW + overshoot;
  const p1x = ux * rTip, p1y = uy * rTip;

  // Edge points at inner (mouth) and outer (tip)
  const iRx = p0x + vx*halfW, iRy = p0y + vy*halfW; // inner-right
  const iLx = p0x - vx*halfW, iLy = p0y - vy*halfW; // inner-left
  const oRx = p1x + vx*halfW, oRy = p1y + vy*halfW; // outer-right
  const oLx = p1x - vx*halfW, oLy = p1y - vy*halfW; // outer-left

  // Build the D shape as ONE CW path:
  // start at inner-right → out along right edge → CW tip arc → back along left edge
  // → FLAT mouth (iL → iR) to close (this flat is tangent to the circle).
  const h = new THREE.Path();
  h.moveTo(iRx, iRy);                 // start mouth right
  h.lineTo(oRx, oRy);                 // straight edge to tip
  arcCW(h, p1x, p1y, halfW, vAng, vAng + Math.PI, 32); // tip semicircle CW
  h.lineTo(iLx, iLy);                 // straight back along left edge
  h.lineTo(iRx, iRy);                 // FLAT mouth (tangent) — key difference
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

/* ------------- optional debug (unchanged API) ------------- */
export function buildSlotDebug(p, vFrac, holeR, options = {}) {
  if (!(options.bottomSlot) || vFrac !== 0) return null;

  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll  ?? 0;
  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width * 0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vAng = theta + Math.PI / 2 + roll + Math.PI / 2;
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  const rInner = Math.max(0.1, holeR + offset);
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;
  const rTip   = rOuter + halfW + overshoot;

  const grp = new THREE.Group();
  grp.add(line([[ux*rInner, uy*rInner, 0],[ux*rTip, uy*rTip, 0]], 0x4ec9b0)); // centerline
  grp.add(line([[ux*rInner + vx*halfW, uy*rInner + vy*halfW, 0],[ux*rTip + vx*halfW, uy*rTip + vy*halfW, 0]], 0xf78c6c));
  grp.add(line([[ux*rInner - vx*halfW, uy*rInner - vy*halfW, 0],[ux*rTip - vx*halfW, uy*rTip - vy*halfW, 0]], 0xf78c6c));
  grp.add(circle([ux*rTip, uy*rTip, 0], halfW, 32, 0xd19a66)); // tip circle
  // show flat mouth chord
  grp.add(line([[ux*rInner + vx*halfW, uy*rInner + vy*halfW, 0],[ux*rInner - vx*halfW, uy*rInner - vy*halfW, 0]], 0xe5c07b));
  // rim marker
  grp.add(circle([ux*rAuto, uy*rAuto, 0], 1.2, 24, 0x61afef));
  return grp;
}

function line(points, color){ const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))); return new THREE.Line(g,new THREE.LineBasicMaterial({color})); }
function circle(center,r,seg,color){ const pts=[]; for(let i=0;i<=seg;i++){ const a=(i/seg)*Math.PI*2; pts.push(new THREE.Vector3(center[0]+r*Math.cos(a),center[1]+r*Math.sin(a),center[2])); } const g=new THREE.BufferGeometry().setFromPoints(pts); return new THREE.LineLoop(g,new THREE.LineBasicMaterial({color})); }
