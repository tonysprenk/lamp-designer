import * as THREE from "three";

export function makeMaterial(finish) {
  const glossy = { clearcoat:1.0, clearcoatRoughness:0.04, roughness:0.12, envMapIntensity:1.3, side:THREE.DoubleSide };
  let opts;
  switch (finish) {
    case "translucent_white": opts = { color:0xffffff, transmission:0.55, thickness:3.0, metalness:0.0 }; break;
    case "bronze":            opts = { color:0x8c6a3f, metalness:1.0, roughness:0.22 }; break;
    case "silver":            opts = { color:0xcfd3d8, metalness:1.0, roughness:0.12 }; break;
    case "gold":              opts = { color:0xd4af37, metalness:1.0, roughness:0.18 }; break;
    case "opaque_white":
    default:                  opts = { color:0xf5f7fb, metalness:0.0 }; break;
  }
  return new THREE.MeshPhysicalMaterial(Object.assign({}, glossy, opts));
}
