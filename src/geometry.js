import * as THREE from "three";

export function baseRadius(t, R0, R1) {
  const belly = 1 + 0.18 * (1 - Math.pow(Math.abs(2*t-1), 1.4));
  return THREE.MathUtils.lerp(R0, R1, t) * belly;
}

export function innerRadiusAt(p, v, ang) {
  const R0 = p.rbase;
  const R1 = R0 * p.topscale;
  const br = baseRadius(v, R0, R1);
  const twist = THREE.MathUtils.degToRad(p.twist);
  const phase = twist * v;
  let rOuter;
  if (p.ripdir === "vertical") {
    rOuter = br * (1 + p.amp * Math.sin(p.waves * ang + phase));
  } else {
    rOuter = br * (1 + p.amp * Math.sin((p.waves * 2 * Math.PI) * v + 1.5 * ang));
  }
  return Math.max(1, rOuter - p.wallFixed);
}

export function buildSurface(p) {
  const radialSeg = p.res==="low" ? 96 : (p.res==="med" ? 180 : 300);
  const heightSeg = p.res==="low" ? 120 : (p.res==="med" ? 220 : 360);
  const H = p.height;
  const R0 = p.rbase;
  const R1 = R0 * p.topscale;
  const waves = p.waves;
  const amp = p.amp;
  const twist = THREE.MathUtils.degToRad(p.twist);
  const EPS = 1e-4;

  const verts = new Float32Array((radialSeg)*(heightSeg+1)*3);
  let k=0;
  for (let j=0;j<=heightSeg;j++){
    const v=j/heightSeg, z=H*v, phase=twist*v;
    for (let i=0;i<radialSeg;i++){
      const u=i/radialSeg, ang=u*2*Math.PI + EPS;
      const br=baseRadius(v,R0,R1);
      const r = (p.ripdir==="vertical")
        ? br*(1+amp*Math.sin(waves*ang+phase))
        : br*(1+amp*Math.sin((waves*2*Math.PI)*v + 1.5*ang));
      verts[k++]=r*Math.cos(ang); verts[k++]=r*Math.sin(ang); verts[k++]=z;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts,3));
  const idx = new Uint32Array(radialSeg*heightSeg*6);
  let t=0;
  for (let j=0;j<heightSeg;j++){
    for (let i=0;i<radialSeg;i++){
      const i2=(i+1)%radialSeg;
      const a=j*radialSeg+i, b=j*radialSeg+i2, c=(j+1)*radialSeg+i, d=(j+1)*radialSeg+i2;
      idx[t++]=a; idx[t++]=c; idx[t++]=b; idx[t++]=b; idx[t++]=c; idx[t++]=d;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  const smooth = geo.toNonIndexed();
  smooth.computeVertexNormals();
  return smooth;
}
