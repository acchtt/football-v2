/* ARC XI clear-glass interaction light, demo only.
   A single delegated pointer handler serves the transient control layer.
   No global animation, canvas, SVG displacement or wallpaper modifications. */
(() => {
  "use strict";
  const root = document.getElementById("app");
  if (!root) return;
  const controls = [
    ".scheduleDateNav .dateBtn",
    ".scheduleDateNav > button",
    ".scheduleMenuButton",
    ".scheduleBoardRoute .statusFilters button",
    ".scheduleBoardRoute .scheduleSearch",
    ".scheduleBoardRoute .scheduleCompetitionList"
  ].join(",");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const noTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
  let pending = null;
  let frame = 0;
  let last = null;
  root.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || reduced.matches || noTransparency.matches) return;
    const target = event.target instanceof Element ? event.target.closest(controls) : null;
    if (!target) return;
    pending = {target,x:event.clientX,y:event.clientY};
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pending || !pending.target.isConnected) return;
      const current = pending.target;
      const bounds = current.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(0,Math.min(100,100*(pending.x-bounds.left)/bounds.width));
      const y = Math.max(0,Math.min(100,100*(pending.y-bounds.top)/bounds.height));
      current.style.setProperty("--lg-x",x.toFixed(1)+"%");
      current.style.setProperty("--lg-y",y.toFixed(1)+"%");
      last = current;
    });
  },{passive:true});
  root.addEventListener("pointerout", event => {
    if (!last || (event.relatedTarget instanceof Node && last.contains(event.relatedTarget))) return;
    if (event.target instanceof Node && (event.target===last || last.contains(event.target))) {
      last.style.removeProperty("--lg-x");
      last.style.removeProperty("--lg-y");
      last = null;
      pending = null;
    }
  },{passive:true});
})();
