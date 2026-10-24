(sel) => {
 const vw = window.innerWidth;
 return Array.from(document.querySelectorAll(sel)).slice(0,8).map(b => {
  const r = b.getBoundingClientRect();
  const kids = Array.from(b.querySelectorAll('[dir="auto"], svg, img')).map(k => {
    const kr = k.getBoundingClientRect();
    return {tag: k.tagName, txt: (k.innerText||'').trim().slice(0,40), l: Math.round(kr.left), r: Math.round(kr.right), w: Math.round(kr.width),
      trunc: k.scrollWidth > k.clientWidth + 1, out: (kr.left < r.left - 1 || kr.right > r.right + 1)};
  }).filter(k => k.w > 0);
  return {tid: b.dataset.testid, l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), vw, offscreen: r.right > vw+1 || r.left < -1, kids};
 });
}
