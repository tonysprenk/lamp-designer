import * as THREE from "three";
import { innerRadiusAt } from "./geometry.js";

/**
 * Conforming cap extruded along +Z that matches the inner profile of the shade
 * @param {object} p       current params
 * @param {number} vFrac   0 for bottom, 1 for top
 * @param {number} capH    cap thickness (mm)
 * @param {number} holeR   hole radius (mm) — default 20mm for E27 (~40mm Ø)
 */
export function buildConformingCap(p, vFrac, capH, holeR = 20) {
  const radialSeg = p.res==="low" ? 96 : (p.res==="med" ? 180 : 300);
  const EPS = 1e-4;

  // Outer boundary: inner wall profile at this height
  const shape = new THREE.Shape();
  for (let i=0;i<=radialSeg;i++){
    const u=(i%radialSeg)/radialSeg;
    const ang=u*2*Math.PI + EPS;
    const r = innerRadiusAt(p, vFrac, ang) * 0.995; // tiny shrink
    const x = r*Math.cos(ang), y = r*Math.sin(ang);
    if (i===0) shape.moveTo(x,y); else shape.lineTo(x,y);
  }
  shape.closePath();

  // Central hole
  const hole = new THREE.Path();
  const seg = 96;
  for (let j=0;j<=seg;j++){
    const a=(j/seg)*2*Math.PI;
    const x=holeR*Math.cos(a), y=holeR*Math.sin(a);
    if (j===0) hole.moveTo(x,y); else hole.lineTo(x,y);
  }
  hole.closePath();
  shape.holes.push(hole);

  const extrude = new THREE.ExtrudeGeometry(shape, { depth: capH, bevelEnabled:false, curveSegments: radialSeg });
  const zOffset = (vFrac===1) ? (p.height - capH) : 0;
  extrude.translate(0,0,zOffset);
  return extrude;
}
