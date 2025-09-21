// src/caps.js
import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap at vFrac (0 bottom, 1 top) extruded along +Z by capH.
 * - Always supports a central E27 hole (default 20 mm radius).
 * - If bottomSlot=true, makes a SINGLE "keyhole" hole: circle + radial slot
 *   (so there are no touching/overlapping holes).
 *
 * @param {object} p         current params
 * @param {number} vFrac     0 for bottom, 1 for top
 * @param {number} capH      cap thickness (mm)
 * @param {number} holeR     E27 hole radius (mm) – default 20 (≈40 mm Ø)
 * @param {object} options   { bottomSlot?: boolean, slotWidth?: number, slotAngle?: number }
 *                            - slotAngle in radians: 0=+X, π/2=+Y, π=−X, 3π/2=−Y
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

  // ---- Outer boundary: follow inner wall at this height ----
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * 2 * Math.PI + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995; // tiny shrink avoids z-fighting
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  // ---- Hole(s) ----
  const wantSlot = !!(options.bottomSlot && vFrac === 0);
  if (wantSlot) {
    // Build ONE "keyhole" path: circle (minus mouth arc) + slot to rim
    const theta = (typeof options.slotAngle === "number") ? options.slotAngle : 0;
    const width = Math.max(6, options.slotWidth || 8);
    const rOuterRim = innerRadiusAt(p, vFrac, theta) * 0.995;
    if (rOuterRim > holeR + 2) {
      addKeyholeHole(shape, holeR, rOuterRim, width, theta);
    } else {
      // Fallback: just the circle if geometry is too tight
      addCircleHole(shape, holeR, 96);
    }
  } else {
    // Simple circular E27 hole (no slot)
    addCircleHole(shape, holeR, 96);
  }

  // ---- Extrude along +Z ----
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
  // For holes, clockwise orientation is preferred (but triangulator is tolerant)
  for (let j = seg; j >= 0; j--) {
    const a = (j / seg) * 2 * Math.PI;
    const x = radius * Math.cos(a), y = radius * Math.sin(a);
    if (j === seg) h.moveTo(x, y); else h.lineTo(x, y);
  }
  h.closePath();
  shape.holes.push(h);
}

/**
 * Create a SINGLE "keyhole" hole: a circular E27 opening with a straight
 * radial slot (rounded outer end) to the rim, at angle `theta`.
 * This avoids overlapping/touching holes and produces a clean toolpath.
 *
 * theta reference: 0=+X, π/2=+Y, π=−X, 3π/2=−Y
 */
function addKeyholeHole(shape, holeR, rOuterRim, width, theta, segCirc = 96, segSlot = 48) {
  const halfW = width / 2;
  const overshoot = 0.6; // push beyond rim so the rim trims the slot cleanly

  // Unit vectors: u = slot direction, v = perpendicular (width)
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vx = -uy, vy = ux;

  // Tangency on the circle: the slot edges touch the circle at angles θ±α
  const sinAlpha = Math.min(1 - 1e-6, halfW / holeR);
  const alpha = Math.asin(sinAlpha);
  const phiR = theta - alpha;   // "right" contact on the circle
  const phiL = theta + alpha;   // "left"  contact on the circle

  // Outer end center (beyond rim so no wedge remains)
  const rOuterEnd = rOuterRim + halfW + overshoot;
  const pOuterX = ux * rOuterEnd, pOuterY = uy * rOuterEnd;

  // Build the keyhole boundary as one clockwise path
  const h = new THREE.Path();

  // Start at right contact on circle
  const cRx = holeR * Math.cos(phiR), cRy = holeR * Math.sin(phiR);
  h.moveTo(cRx, cRy);

  // Go CLOCKWISE around the circle from phiR to phiL via the long arc
  // (i.e., decreasing angle from phiR down to phiL - 2π)
  arcPoints(h, 0, 0, holeR, phiR, phiL - 2 * Math.PI, Math.max(16, Math.floor((2 * Math.PI - 2 * alpha) / (2 * Math.PI) * segCirc)));

  // From left contact to outer-left edge
  const leftEdgeX = pOuterX - vx * halfW;
  const leftEdgeY = pOuterY - vy * halfW;
  h.lineTo(leftEdgeX, leftEdgeY);

  // Outer semicircle: from left edge to right edge, CLOCKWISE
  arcPoints(h, pOuterX, pOuterY, halfW, theta + Math.PI / 2, theta - Math.PI / 2, segSlot);

  // From outer-right edge back to right contact on the circle
  const rightEdgeX = pOuterX + vx * halfW;
  const rightEdgeY = pOuterY + vy * halfW;
  h.lineTo(rightEdgeX, rightEdgeY);
  h.lineTo(cRx, cRy);

  h.closePath();
  shape.holes.push(h);
}

/**
 * Append arc points from angle a0 to a1. Works for increasing (CCW) or decreasing (CW).
 */
function arcPoints(path, cx, cy, r, a0, a1, seg = 24) {
  const step = (a1 - a0) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = a0 + step * i;
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}
