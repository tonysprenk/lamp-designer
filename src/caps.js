// src/caps.js
import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap at vFrac (0 bottom, 1 top) extruded along +Z by capH.
 * Includes central E27 hole (default 20 mm radius).
 * Optionally adds a radial cable slot from the hole edge to the rim.
 *
 * @param {object} p
 * @param {number} vFrac      0 = bottom, 1 = top
 * @param {number} capH       cap thickness (mm)
 * @param {number} holeR      E27 hole radius (mm), default 20
 * @param {object} options    { bottomSlot?: boolean, slotWidth?: number, slotAngle?: number }
 *                            - bottomSlot: only when vFrac===0
 *                            - slotWidth:  default 8 mm (min 6)
 *                            - slotAngle:  radians; 0=+X, π/2=+Y, π=−X, 3π/2=−Y
 */
export function buildConformingCap(
  p,
  vFrac,
  capH,
  holeR = 20,
  options = {}
) {
  const radialSeg = p.res === "low" ? 96 : (p.res === "med" ? 180 : 300);
  const EPS = 1e-4;

  // Outer boundary: inner wall profile at this height
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * 2 * Math.PI + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995; // slight shrink avoids z-fighting
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  // Central E27 hole
  addCircleHole(shape, holeR, 96);

  // Optional cable slot (only for bottom cap)
  if (options.bottomSlot && vFrac === 0) {
    const theta = (typeof options.slotAngle === "number") ? options.slotAngle : 0;
    const width = Math.max(6, options.slotWidth || 8);

    // Clamp inner to hole edge; measure rim at this angle
    const rInner = holeR;
    const rOuterRim = innerRadiusAt(p, vFrac, theta) * 0.995;

    if (rOuterRim > rInner + 2) {
      addRadialSlot(shape, rInner, rOuterRim, width, theta);
    }
  }

  // Extrude along +Z
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });
  const zOffset = (vFrac === 1) ? (p.height - capH) : 0;
  extrude.translate(0, 0, zOffset);
  return extrude;
}

/* ---------------- helpers ---------------- */

function addCircleHole(shape, radius, seg = 64) {
  const h = new THREE.Path();
  for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * 2 * Math.PI;
    const x = radius * Math.cos(a), y = radius * Math.sin(a);
    if (j === 0) h.moveTo(x, y); else h.lineTo(x, y);
  }
  h.closePath();
  shape.holes.push(h);
}

/**
 * Straight radial “pill” slot from rInner (E27 edge) to rim.
 * We overshoot the rim by (width/2 + 0.6) so the cap outline trims it flush.
 * Semicircle caps are swept along the slot direction (no 90° flip).
 */
function addRadialSlot(shape, rInner, rOuterRim, width, theta, seg = 48) {
  const halfW = width / 2;
  const overshoot = 0.6;                   // small extra so trimming is clean

  // Radial (u) and perpendicular (v)
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vx = -uy, vy = ux;

  // Centers of rounded ends
  const rOuterEnd = rOuterRim + halfW + overshoot; // go past rim
  const p0x = ux * rInner,     p0y = uy * rInner;      // inner end (at hole)
  const p1x = ux * rOuterEnd,  p1y = uy * rOuterEnd;   // outer end (beyond rim)

  const slot = new THREE.Path();

  // Right edge (inner → outer)
  slot.moveTo(p0x + vx * halfW, p0y + vy * halfW);
  slot.lineTo(p1x + vx * halfW, p1y + vy * halfW);

  // Outer semicircle: sweep from θ+π/2 → θ−π/2 (faces along +u)
  arcPoints(slot, p1x, p1y, halfW, theta + Math.PI / 2, theta - Math.PI / 2, seg);

  // Left edge (outer → inner)
  slot.lineTo(p0x - vx * halfW, p0y - vy * halfW);

  // Inner semicircle: sweep from θ−π/2 → θ+π/2 (tangent to hole)
  arcPoints(slot, p0x, p0y, halfW, theta - Math.PI / 2, theta + Math.PI / 2, seg);

  slot.closePath();
  shape.holes.push(slot);
}

function arcPoints(path, cx, cy, r, a0, a1, seg = 24) {
  const step = (a1 - a0) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = a0 + step * i;
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}
