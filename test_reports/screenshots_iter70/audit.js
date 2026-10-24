() => {
 const vw = window.innerWidth; const res = {docW: document.documentElement.scrollWidth, vw, issues: []};
 const els = Array.from(document.querySelectorAll('[dir="auto"]'));
 for (const el of els) {
  const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
  if (r.bottom < 0 || r.top > window.innerHeight * 3) continue;
  if (el.querySelector('[dir="auto"]')) continue;
  const txt = (el.innerText||'').trim().replace(/\s+/g,' ').slice(0,45); if (!txt || /^[\uf000-\uf8ff]$/.test(txt)) continue;
  const cs = getComputedStyle(el); const tid = ((el.closest('[data-testid]')||{}).dataset||{}).testid || '';
  let inScroll = false; let p = el.parentElement; let clipBy = null;
  for (let i=0; p && i<10; i++, p=p.parentElement) {
    const pcs = getComputedStyle(p);
    if (['auto','scroll'].includes(pcs.overflowX)) { inScroll = true; break; }
    if (!clipBy && (pcs.overflow==='hidden' || pcs.overflowX==='hidden' || pcs.overflowY==='hidden')) {
      const pr = p.getBoundingClientRect();
      if (pr.width < vw - 2 && (r.right > pr.right + 2 || r.left < pr.left - 2 || r.bottom > pr.bottom + 2 || r.top < pr.top - 2)) clipBy = {pw: Math.round(pr.width), ph: Math.round(pr.height), dx: Math.round(r.right-pr.right), dy: Math.round(r.bottom-pr.bottom)};
    }
  }
  const lc = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
  if (el.scrollWidth > el.clientWidth + 1) res.issues.push({t: 'truncX', txt, tid, fs: cs.fontSize, w: Math.round(r.width)});
  else if (el.scrollHeight > el.clientHeight + 2 && cs.overflow !== 'visible') res.issues.push({t: lc ? 'lineClamp' : 'clipY', txt, tid, sh: el.scrollHeight, ch: el.clientHeight, fs: cs.fontSize});
  if (clipBy) res.issues.push({t: 'clippedByParent', txt, tid, ...clipBy});
  if (!inScroll && (r.right > vw + 1 || r.left < -1)) res.issues.push({t: 'offscreen', txt, tid, l: Math.round(r.left), r: Math.round(r.right)});
 }
 const btns = Array.from(document.querySelectorAll('[role="button"],button,[data-testid$="-btn"],[data-testid$="-button"]'));
 for (const b of btns) { const r = b.getBoundingClientRect(); if (r.width<1) continue; let q=b.parentElement, sc=false; for(let i=0;q&&i<12;i++,q=q.parentElement){ if(['auto','scroll'].includes(getComputedStyle(q).overflowX)){sc=true;break;} } if (sc) continue; if (r.right > vw + 1 || r.left < -1) res.issues.push({t:'btnOffscreen', tid: b.dataset.testid||'', txt:(b.innerText||'').slice(0,30), l: Math.round(r.left), r: Math.round(r.right)}); }
 return res;
}
