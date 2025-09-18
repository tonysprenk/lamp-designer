// src/caps.js
import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Cap that conforms to the inner profile at vFrac (0 bottom, 1 top) and
 * is extruded along +Z by capH. Includes a central E27 hole (default 20 mm R).
 * Optional radial cable slot runs from the hole edge to the rim at angle theta.
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

  // Outer boundary: follow inner wall at this height
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * 2 * Math.PI + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995;
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  // Central E27 hole
  addCircleHole(shape, holeR, 96);

  // Optional cable slot (bottom cap only)
  if (options.bottomSlot && vFrac === 0) {
    const theta = (typeof options.slotAngle === "number") ? options.slotAngle : 0;
    const width = Math.max(6, options.slotWidth || 8);

    // Clamp inner to hole edge, outer to rim at this angle
    const rInner = holeR;
    const rOuter = innerRadiusAt(p, vFrac, theta) * 0.995;
    if (rOuter > rInner + 2) addRadialSlot(shape, rInner, rOuter, width, theta);
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
 * Add a straight radial slot (“pill”): from rInner (hole edge) to rOuter (rim),
 * centered at angle theta, width `width`. Semicircle caps are swept so that
 * the flat edges are tangent to the slot, avoiding the 90°-off artifact.
 *
 * theta reference: 0=+X, π/2=+Y, π=−X, 3π/2=−Y
 */
function addRadialSlot(shape, rInner, rOuter, width, theta, seg = 48) {
  const halfW = width / 2;

  // Unit vectors: u = radial direction, v = perp for width
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vx = -uy, vy = ux;

  // Centers of rounded ends
  const p0x = ux * rInner, p0y = uy * rInner; // inner end (hole edge)
  const p1x = ux * rOuter, p1y = uy * rOuter; // outer end (rim)

  const slot = new THREE.Path();

  // Start on the "right" edge at inner end
  slot.moveTo(p0x + vx * halfW, p0y + vy * halfW);
  // Straight to right edge at outer end
  slot.lineTo(p1x + vx * halfW, p1y + vy * halfW);

  // --- Outer semicircle ---
  // Current point corresponds to angle θ+π/2 (vector +v from center).
  // Sweep to θ−π/2 to reach the left edge, keeping tangency.
  arcPoints(slot, p1x, p1y, halfW, theta + Math.PI / 2, theta - Math.PI / 2, seg);

  // Back along the left edge
  slot.lineTo(p0x - vx * halfW, p0y - vy * halfW);

  // --- Inner semicircle ---
  // Current point is θ−π/2 at inner center; sweep back to θ+π/2.
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
