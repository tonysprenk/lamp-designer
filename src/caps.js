// src/caps.js
import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap at vFrac (0 bottom, 1 top), extruded along +Z by capH.
 * Includes a central E27 hole (default 20 mm radius).
 * If options.bottomSlot is true (and vFrac===0), we cut a single CW "keyhole":
 *   - the E27 circle, minus a mouth centered at `theta`
 *   - a straight radial corridor with a rounded tip (capsule), aligned to `theta`
 * Slot options:
 *   slotAngle (rad)   – centerline direction (0=+X, π/2=+Y, …)
 *   slotRoll  (rad)   – rotate slot about its own centerline
 *   slotWidth (mm)
 *   slotLength (mm)   – if 0, auto to rim
 *   slotOvershoot (mm)
 *   slotOffset (mm)   – move the mouth slightly in/out relative to E27 edge
 */
export function buildConformingCap(p, vFrac, capH, holeR = 20, options = {}) {
  const radialSeg = p.res === "low" ? 96 : (p.res === "med" ? 180 : 300);
  const EPS = 1e-4;

  // ----- Outer boundary (follow inner wall at this height) -----
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * Math.PI * 2 + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995;
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  // ----- Hole path (single CW keyhole) -----
  const keyhole = (options.bottomSlot && vFrac === 0)
    ? buildKeyholePath(p, vFrac, holeR, options)
    : buildCirclePath(holeR, 96);
  shape.holes.push(keyhole);

  // ----- Extrude along +Z -----
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });
  const zOff = (vFrac === 1) ? (p.height - capH) : 0;
  geom.translate(0, 0, zOff);
  return geom;
}

/* ------------------------ paths ------------------------ */

/** CW circle path for a hole. */
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
 * Build a SINGLE CW keyhole:
 *   1) Start at the right tangency point on the E27 circle (angle φR).
 *   2) Go straight outward to the tip along the right slot edge.
 *   3) CW around the tip semicircle to the left edge.
 *   4) Straight back to the left tangency on the E27 circle (φL).
 *   5) CW around the big arc of the E27 circle back to start.
 *
 * Uses true circle tangency, so the mouth is “rotated by 90°” relative to the
 * radial direction (exactly what you asked in the screenshot).
 */
function buildKeyholePath(p, vFrac, holeR, options) {
  const theta = options.slotAngle ?? 0;   // slot direction
  const roll  = options.slotRoll  ?? 0;   // rotate width axis about centerline
  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width * 0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset   = options.slotOffset   ?? 0.0;

  // Centerline (u) and rolled width axis (v) in the XY plane
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vAng = theta - Math.PI / 2 + roll;
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  // Inner radius where mouth touches the circle (can be offset slightly)
  const rInner = Math.max(0.1, holeR + offset);

  // True tangency on the *circle* (independent of roll)
  const sinAlpha = Math.min(1 - 1e-6, halfW / rInner);
  const alpha = Math.asin(sinAlpha);
  const phi0 = theta + Math.PI / 2;  // base angle = circle tangent at theta
  const phiR = phi0 - alpha;         // right tangency (corrected)
  const phiL = phi0 + alpha;         // left  tangency (corrected)
  const cRx = rInner * Math.cos(phiR), cRy = rInner * Math.sin(phiR);
  const cLx = rInner * Math.cos(phiL), cLy = rInner * Math.sin(phiL);

  // Corridor length: auto to rim (projected along theta) or forced length
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;

  // Tip center sits past rim so outer boundary trims cleanly
  const rTip = rOuter + halfW + overshoot;
  const tipX = ux * rTip, tipY = uy * rTip;
  const tipRightX = tipX + vx * halfW, tipRightY = tipY + vy * halfW;
  const tipLeftX  = tipX - vx * halfW, tipLeftY  = tipY - vy * halfW;

  // ----- Build CW path -----
  const h = new THREE.Path();

  // (1) Start at circle right tangency
  h.moveTo(cRx, cRy);

  // (2) Right straight edge from circle to tip-right
  h.lineTo(tipRightX, tipRightY);

  // (3) CW tip semicircle (right → left) around the tip center
  // Start angle is vAng (vector from tip center to tip-right), end vAng+π (to tip-left)
  arcCW(h, tipX, tipY, halfW, vAng, vAng + Math.PI, 32);

  // (4) Left straight edge back to circle left tangency
  h.lineTo(cLx, cLy);

  // (5) CW big circle arc from left tangency back to right tangency
  const segBig = Math.max(24, Math.floor((2 * Math.PI - 2 * alpha) / (2 * Math.PI) * 96));
  arcCW(h, 0, 0, rInner, phiL, phiR, segBig);

  h.closePath();
  return h;
}

/** Append a CW (decreasing-angle) arc to path. */
function arcCW(path, cx, cy, r, aStart, aEnd, seg = 24) {
  let a0 = aStart, a1 = aEnd;
  if (a1 >= a0) a1 -= 2 * Math.PI;        // force decreasing sweep
  const step = (a1 - a0) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = a0 + step * i;
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/* ------------------ Debug guides ------------------ */
export function buildSlotDebug(p, vFrac, holeR, options = {}) {
  if (!(options.bottomSlot) || vFrac !== 0) return null;

  const theta = options.slotAngle ?? 0;
  const roll  = options.slotRoll  ?? 0;
  const width = Math.max(0.5, options.slotWidth ?? 8);
  const halfW = width * 0.5;
  const overshoot = options.slotOvershoot ?? 1.0;
  const offset   = options.slotOffset   ?? 0.0;

  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vAng = theta - Math.PI / 2 + roll;
  const vx = Math.cos(vAng),  vy = Math.sin(vAng);

  const rInner = Math.max(0.1, holeR + offset);
  const rAuto  = innerRadiusAt(p, vFrac, theta) * 0.995;
  const rOuter = (options.slotLength && options.slotLength > 0)
    ? (rInner + options.slotLength)
    : rAuto;
  const rTip   = rOuter + halfW + overshoot;

  const sinAlpha = Math.min(1 - 1e-6, halfW / rInner);
  const alpha = Math.asin(sinAlpha);
  const phiR = theta - alpha;
  const phiL = theta + alpha;

  const grp = new THREE.Group();
  // centerline
  grp.add(line([[ux*rInner, uy*rInner, 0], [ux*rTip, uy*rTip, 0]], 0x4ec9b0));
  // edges
  grp.add(line([[ux*rInner + vx*halfW, uy*rInner + vy*halfW, 0], [ux*rTip + vx*halfW, uy*rTip + vy*halfW, 0]], 0xf78c6c));
  grp.add(line([[ux*rInner - vx*halfW, uy*rInner - vy*halfW, 0], [ux*rTip - vx*halfW, uy*rTip - vy*halfW, 0]], 0xf78c6c));
  // tip circle
  grp.add(circle([ux*rTip, uy*rTip, 0], halfW, 32, 0xd19a66));
  // rim marker (auto)
  grp.add(circle([ux*rAuto, uy*rAuto, 0], 1.3, 24, 0x61afef));
  // tangency points on circle
  grp.add(circle([rInner*Math.cos(phiR), rInner*Math.sin(phiR), 0], 1.0, 12, 0xe5c07b));
  grp.add(circle([rInner*Math.cos(phiL), rInner*Math.sin(phiL), 0], 1.0, 12, 0xe5c07b));
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
