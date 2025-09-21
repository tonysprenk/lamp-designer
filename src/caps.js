// src/caps.js
import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap at vFrac (0 bottom, 1 top) extruded along +Z by capH.
 * Central E27 hole (default 20 mm radius). If bottomSlot=true, the hole
 * becomes a single CW “keyhole”: circle minus mouth + radial slot to rim.
 *
 * @param {object} p
 * @param {number} vFrac      0=bottom, 1=top
 * @param {number} capH       thickness (mm)
 * @param {number} holeR      E27 hole radius (mm), default 20
 * @param {object} options    { bottomSlot?: boolean, slotWidth?: number, slotAngle?: number }
 */
export function buildConformingCap(p, vFrac, capH, holeR = 20, options = {}) {
  const radialSeg = p.res === "low" ? 96 : (p.res === "med" ? 180 : 300);
  const EPS = 1e-4;

  // Outer boundary: conform to inner wall at this height
  const shape = new THREE.Shape();
  for (let i = 0; i <= radialSeg; i++) {
    const u = (i % radialSeg) / radialSeg;
    const ang = u * Math.PI * 2 + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995; // slight shrink
    const x = r * Math.cos(ang), y = r * Math.sin(ang);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();

  const wantSlot = !!(options.bottomSlot && vFrac === 0);
  if (wantSlot) {
    const theta = (typeof options.slotAngle === "number") ? options.slotAngle : 0;
    const width = Math.max(6, options.slotWidth || 8);

    const rOuterRim = innerRadiusAt(p, vFrac, theta) * 0.995;
    if (rOuterRim > holeR + 2) {
      shape.holes.push(buildKeyholePath(holeR, rOuterRim, width, theta));
    } else {
      shape.holes.push(buildCirclePath(holeR, 96));
    }
  } else {
    shape.holes.push(buildCirclePath(holeR, 96));
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

function buildCirclePath(radius, seg = 64) {
  // CW circle (holes should be opposite winding of the outer shape)
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
 * 1) From right tangency on circle, go out along right slot edge to the tip.
 * 2) CW around tip semicircle to the left edge.
 * 3) Back in along left edge to left tangency on circle.
 * 4) CW around the big circle arc back to right tangency.
 */
function buildKeyholePath(holeR, rOuterRim, width, theta, segCirc = 96, segSlot = 48) {
  const halfW = width / 2;
  const overshoot = 0.6; // push the tip past the rim so the outer boundary trims it

  // Directions
  const ux = Math.cos(theta), uy = Math.sin(theta); // radial
  const vx = -uy,          vy = ux;                 // perpendicular (width)

  // Tangency angles on the circle (slot edges)
  const sinAlpha = Math.min(1 - 1e-6, halfW / holeR);
  const alpha = Math.asin(sinAlpha);
  const phiR = theta - alpha;   // right tangency
  const phiL = theta + alpha;   // left  tangency

  // Points
  const cRx = holeR * Math.cos(phiR), cRy = holeR * Math.sin(phiR); // right tangent on circle
  const cLx = holeR * Math.cos(phiL), cLy = holeR * Math.sin(phiL); // left  tangent on circle

  const rOuterEnd = rOuterRim + halfW + overshoot; // beyond rim
  const tipX = ux * rOuterEnd, tipY = uy * rOuterEnd; // slot tip center
  const tipRightX = tipX + vx * halfW, tipRightY = tipY + vy * halfW;
  const tipLeftX  = tipX - vx * halfW, tipLeftY  = tipY - vy * halfW;

  const h = new THREE.Path();

  // Start at right tangency (CW path)
  h.moveTo(cRx, cRy);

  // 1) Outward along right edge to tip-right
  h.lineTo(tipRightX, tipRightY);

  // 2) CW semicircle around the tip: right → left
  // CW means decreasing angle: start at θ - π/2, end at θ + π/2
  arcLineTo(h, tipX, tipY, halfW, theta - Math.PI / 2, theta + Math.PI / 2, segSlot, /*clockwise=*/true);

  // 3) Back along left edge to left tangency
  h.lineTo(cLx, cLy);

  // 4) CW around the BIG arc of the circle back to right tangency
  // CW: decreasing angle from phiL down to phiR
  arcLineTo(h, 0, 0, holeR, phiL, phiR, Math.max(16, Math.floor((2 * Math.PI - 2 * alpha) / (2 * Math.PI) * segCirc)), /*clockwise=*/true);

  h.closePath();
  return h;
}

/**
 * Append points along an arc from a0 to a1. If clockwise=true, sweep decreasing angle.
 */
function arcLineTo(path, cx, cy, r, a0, a1, seg = 24, clockwise = false) {
  let start = a0, end = a1;
  if (clockwise && end > start) {
    // force decreasing sweep
    end -= 2 * Math.PI;
  }
  const step = (end - start) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = start + step * i;
    path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}
