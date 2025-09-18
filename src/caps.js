import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap extruded along +Z that matches the inner profile of the shade.
 * By default it creates a central E27 hole (20 mm radius) and can optionally add
 * a rounded cable slot to the rim (for bottom cap cable routing).
 *
 * @param {object} p        params
 * @param {number} vFrac    0 for bottom, 1 for top
 * @param {number} capH     cap thickness in mm
 * @param {number} holeR    central hole radius (default 20 mm for E27)
 * @param {object} options  { bottomSlot?: boolean, slotWidth?: number, slotAngle?: number }
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
    const r = innerRadiusAt(p, vFrac, ang) * 0.995; // tiny shrink
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  // Central E27 hole
  addCircleHole(shape, holeR, 96);

  // Optional cable slot (for bottom cap when standing)
  if (options.bottomSlot && vFrac === 0) {
    const slotWidth = Math.max(6, options.slotWidth || 8);     // ~6–10 mm wide
    const slotAngle =
  (options && typeof options.slotAngle === "number") ? options.slotAngle : 0;
    // Determine available outer radius at this angle
    const rOuter = innerRadiusAt(p, vFrac, slotAngle) * 0.995;
    // Start just outside the E27 hole, end slightly before the rim
    const startR = holeR + slotWidth * 0.6;
    const endR   = rOuter - 2; // leave 2 mm margin
    if (endR > startR + 2) {
      addRoundedSlot(shape, startR, endR, slotWidth, slotAngle, 48);
    }
  }

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });
  const zOffset = (vFrac === 1) ? (p.height - capH) : 0;
  extrude.translate(0, 0, zOffset);
  return extrude;
}

// --- helpers ---

function addCircleHole(shape, radius, seg = 64) {
  const h = new THREE.Path();
  for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * 2 * Math.PI;
    const x = radius * Math.cos(a);
    const y = radius * Math.sin(a);
    if (j === 0) h.moveTo(x, y); else h.lineTo(x, y);
  }
  h.closePath();
  shape.holes.push(h);
}

/**
 * Adds a rounded "capsule" slot starting at radius r0 and ending at r1,
 * oriented by angle `theta` from the center.
 */
function addRoundedSlot(shape, r0, r1, width, theta = 0, seg = 48) {
  const halfW = width / 2;
  // Local axis along the slot direction
  const ux = Math.cos(theta), uy = Math.sin(theta);
  // Perpendicular for width
  const vx = -uy, vy = ux;

  const p0x = ux * r0, p0y = uy * r0; // inner end center
  const p1x = ux * r1, p1y = uy * r1; // outer end center

  // Build a path approximating a pill/rounded-rectangle
  const slot = new THREE.Path();

  // Start at inner-right
  slot.moveTo(p0x + vx * halfW, p0y + vy * halfW);
  // Straight edge to outer-right
  slot.lineTo(p1x + vx * halfW, p1y + vy * halfW);
  // Outer semicircle
  arcPoints(slot, p1x, p1y, halfW, theta - Math.PI / 2, theta + Math.PI / 2, seg);
  // Back along left edge
  slot.lineTo(p0x - vx * halfW, p0y - vy * halfW);
  // Inner semicircle
  arcPoints(slot, p0x, p0y, halfW, theta + Math.PI / 2, theta - Math.PI / 2, seg);

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
