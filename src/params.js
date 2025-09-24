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
  mount: "standing",

  // NEW: slot tuning (standing only)
  slotAngleDeg: 90,     // direction, degrees
  slotWidth: 8,         // mm
  slotLength: 0,        // 0 = auto to rim
  slotOvershoot: 1.0,   // mm beyond rim
  slotOffset: 0.0, // mm from hole edge (+ outward)
  slotRollDeg: 0,
  slotMouthDeg: 0,
  slotTiltDeg: 0,   // NEW: tilt around the mouth width axis (blue axis)
  slotDebug: false
};

export function clampForBambu(p) {
  const MAX_RBASE = 64;
  if (p.rbase > MAX_RBASE) p.rbase = MAX_RBASE;

  const safety = 6;
  const maxHalf = 128 - safety;
  const bellyMax = 1 + 0.18;
  const scaleMax = Math.max(1, p.topscale);
  const radialLimit = maxHalf / ((1 + Math.max(0, p.amp)) * bellyMax * scaleMax);
  if (p.rbase > radialLimit) p.rbase = radialLimit;
  if (p.height > 256 - safety) p.height = 256 - safety;
}
