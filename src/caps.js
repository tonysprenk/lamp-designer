// src/caps.js
import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap at vFrac (0 bottom, 1 top) extruded along +Z by capH.
 * E27 hole (default 20 mm radius). If bottomSlot, builds a single CW "keyhole":
 * circle with a radial slot (rounded tip) at the given angle.
 * Options:
 *   slotAngle (rad), slotWidth (mm), slotLength (mm | 0=auto), slotOvershoot (mm), slotOffset (mm)
 */
export function buildConformingCap(p, vFrac, capH, holeR = 20, options = {}) {
  const radialSeg = p.res === "low" ? 96 : (p.res === "med" ? 180 : 300);
  const EPS = 1e-4;

  // Outer boundary
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * Math.PI * 2 + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995;
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  const wantSlot = !!(options.bottomSlot && vFrac === 0);
  const holePath = wantSlot
    ? buildKeyholePath(p, vFrac, holeR, options)
    : buildCirclePath(holeR, 96);

  shape.holes.push(holePath);

  // Extrude
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });
  const zOffset = (vFrac === 1) ? (p.height - capH) : 0;
  extrude.translate(0, 0, zOffset);
  return extrude;
}

/** Build a CW circle path (for a hole). */
function buildCirclePath(radius, seg = 64) {
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
 * Build a SINGLE CW “keyhole” path:
 * - Circle portion: CW from right tangency to left tangency (the long arc).
 * - Slot: straight sides to a rounded tip, then back to right tangency.
 * This avoids overlapping holes and renders as a clean pass-through.
 */
function buildKeyholePath(p, vFrac, holeR, options) {
  const theta = options.slotAngle ?? 0;
  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width / 2;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  // Directions
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vx = -uy, vy = ux;

  // Rim radius (auto) or forced length:
  const rAuto = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rInner = Math.max(0.1, holeR + offset);
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;
  const rTip = rOuter + halfW + overshoot; // push past rim

  // Tangency angles on the hole circle (where slot edges touch)
  const sinAlpha = Math.min(1 - 1e-6, halfW / Math.max(0.1, holeR));
  const alpha = Math.asin(sinAlpha);
  const phiR = theta - alpha; // right tangency
  const phiL = theta + alpha; // left  tangency

  // Points
  const cRx = holeR * Math.cos(phiR), cRy = holeR * Math.sin(phiR);
  const cLx = holeR * Math.cos(phiL), cLy = holeR * Math.sin(phiL);

  const tipX = ux * rTip, tipY = uy * rTip;
  const tipRightX = tipX + vx * halfW, tipRightY = tipY + vy * halfW;
  const tipLeftX  = tipX - vx * halfW, tipLeftY  = tipY - vy * halfW;

  const h = new THREE.Path();
  // Start at right tangency
  h.moveTo(cRx, cRy);

  // Go out along right edge to tip-right
  h.lineTo(tipRightX, tipRightY);

  // CW tip semicircle: right -> left (decreasing angle)
  arcCW(h, tipX, tipY, halfW, theta - Math.PI / 2, theta + Math.PI / 2, 32);

  // Back along left edge to left tangency
  h.lineTo(cLx, cLy);

  // CW big circle arc: from left tangency back to right tangency
  const bigSeg = Math.max(24, Math.floor((2 * Math.PI - 2 * alpha) / (2 * Math.PI) * 96));
  arcCW(h, 0, 0, holeR, phiL, phiR, bigSeg);

  h.closePath();
  return h;
}

/** Append a CW (decreasing angle) arc. */
function arcCW(path, cx, cy, r, aStart, aEnd, seg = 24) {
  // Ensure decreasing sweep
  let a0 = aStart, a1 = aEnd;
  if (a1 >= a0) a1 -= 2 * Math.PI;
  const step = (a1 - a0) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = a0 + step * i;
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/* ---------------- Debug helpers ---------------- */

/**
 * Build a THREE.Group with slot debug guides:
 * - centerline, width edges, tip circle, tangency points (tiny rings),
 *   and the auto rim position at `theta`.
 * Returns null if not in bottom mode or if geometry is too tight.
 */
export function buildSlotDebug(p, vFrac, holeR, options = {}) {
  if (!(options.bottomSlot) || vFrac !== 0) return null;

  const theta = options.slotAngle ?? 0;
  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width / 2;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset = options.slotOffset ?? 0.0;

  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vx = -uy, vy = ux;

  const rAuto = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rInner = Math.max(0.1, (holeR + offset));
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;
  const rTip = rOuter + halfW + overshoot;

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

  // Rim marker at theta
  grp.add(circle([ux*rAuto, uy*rAuto, 0], 1.2, 20, 0x61afef));

  // Tangency points on hole
  const sinAlpha = Math.min(1 - 1e-6, halfW / Math.max(0.1, holeR));
  const alpha = Math.asin(sinAlpha);
  const phiR = theta - alpha;
  const phiL = theta + alpha;
  grp.add(circle([holeR*Math.cos(phiR), holeR*Math.sin(phiR), 0], 1.0, 16, 0xe5c07b));
  grp.add(circle([holeR*Math.cos(phiL), holeR*Math.sin(phiL), 0], 1.0, 16, 0xe5c07b));

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
