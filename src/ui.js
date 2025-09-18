export function bindRange(id, key, params, rebuild, fmt) {
  const el=document.getElementById(id), lab=document.getElementById("val_"+id);
  function update(){ params[key]=parseFloat(el.value); if(lab) lab.textContent = fmt? fmt(el.value): el.value; rebuild(); }
  el.addEventListener("input", update); update();
}
export function bindSelect(id, key, params, rebuild) {
  const el=document.getElementById(id);
  el.addEventListener("change", e=>{ params[key]=e.target.value; rebuild(); });
}
