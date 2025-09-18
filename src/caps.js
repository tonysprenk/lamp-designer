// src/caps.js
import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Build a cap that conforms to the inner ripple profile at height vFrac
 * and extrudes along +Z by capH. Always creates a central E27 hole
 * (default 20 mm radius). Optionally adds a radial cable slot from the
 * hole edge to the rim at a chosen angle.
 *
 * @param {object} p         params
 * @param {number} vFrac     0 for bottom, 1 for top
 * @param {number} capH      cap thickness in mm
 * @param {number} holeR     central hole radius in mm (default 20 for E27)
 * @param {object} options   { bottomSlot?: boolean, slotWidth?: number, slotAngle?: number }
 *                            - bottomSlot: add slot only when vFrac===0 (bottom cap)
 *                            - slotWidth:  slot width in mm (default 8, min 6)
 *                            - slotAngle:  slot direction (radians); 0=+X, π/2=+Y
 * @returns {THREE.ExtrudeGeometry}
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

  // ---- Outer boundary (conform to inner wall at this height) ----
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * 2 * Math.PI + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995; // tiny shrink to avoid z-fighting
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  // ---- Central E27 hole ----
  addCircleHole(shape, holeR, 96);

  // ---- Optional cable slot (bottom cap only) ----
  if (options.bottomSlot && vFrac === 0) {
    const slotAngle = (typeof options.slotAngle === "number") ? options.slotAngle : 0; // respect 0/neg
    const slotWidth = Math.max(6, options.slotWidth || 8);

    // Start exactly at E27 edge; end at rim along slotAngle
    const rInner = holeR;
    const rOuter = innerRadiusAt(p, vFrac, slotAngle) * 0.995;

    if (rOuter > rInner + 2) {
      addRadialSlot(shape, rInner, rOuter, slotWidth, slotAngle, 48);
    }
  }

  // ---- Extrude along +Z to make the cap solid ----
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: capH,
    bevelEnabled: false,
    curveSegments: radialSeg
  });

  // Bottom cap: z ∈ [0, capH]; Top cap: z ∈ [H-capH, H]
  const zOffset = (vFrac === 1) ? (p.height - capH) : 0;
  extrude.translate(0, 0, zOffset);

  return extrude;
}

/* -------------------------- Helpers -------------------------- */

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
 * Adds a straight radial "pill" slot from rInner (E27 edge) to rOuter (rim),
 * centered on angle `theta`, width `width`. Semicircle caps are rotated to face
 * along the slot direction (fixes 90° orientation issue).
 *
 * Orientation reference: 0 → +X,  π/2 → +Y,  π → −X,  3π/2 → −Y
 */
function addRadialSlot(shape, rInner, rOuter, width, theta = 0, seg = 48) {
  const halfW = width / 2;

  // Radial direction (u) and perpendicular (v) for width
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vx = -uy, vy = ux;

  // Centers of the two rounded ends
  const p0x = ux * rInner, p0y = uy * rInner; // inner end at E27 hole
  const p1x = ux * rOuter, p1y = uy * rOuter; // outer end at rim

  const slot = new THREE.Path();

  // Right edge (inner → outer)
  slot.moveTo(p0x + vx * halfW, p0y + vy * halfW);
  slot.lineTo(p1x + vx * halfW, p1y + vy * halfW);

  // Rounded cap at outer end (face along +u)
  arcPoints(slot, p1x, p1y, halfW, theta, theta + Math.PI, seg);

  // Left edge (outer → inner)
  slot.lineTo(p0x - vx * halfW, p0y - vy * halfW);

  // Rounded cap at inner end (face along +u, closes loop)
  arcPoints(slot, p0x, p0y, halfW, theta + Math.PI, theta, seg);

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
