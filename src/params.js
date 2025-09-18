export const params = {
  height: 230,
  rbase: 90,
  topscale: 0.70,
  waves: 18,
  amp: 0.22,
  twist: 420,
  ripdir: "vertical",
  finish: "opaque_white",
  res: "med",
  wallFixed: 0.7,
  mount: "standing"
};

export function clampForBambu(p) {
  const safety = 6;
  const maxHalf = 128 - safety;
  const bellyMax = 1 + 0.18;
  const scaleMax = Math.max(1, p.topscale);
  const radialLimit = maxHalf / ((1 + Math.max(0, p.amp)) * bellyMax * scaleMax);
  if (p.rbase > radialLimit) p.rbase = radialLimit;
  if (p.height > 256 - safety) p.height = 256 - safety;
}
