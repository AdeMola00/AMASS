# Iteration 82 helpers: exec(open('/app/tests/i82_helpers.py').read(), globals()) after i81_helpers.
# Samples money-rain note positions (bounding rect centers + opacity) every ~50ms while a layer is present.
SAMPLER_INIT = """
(() => {
  if (window.__rainSampler) return;
  window.__rainSamples = [];
  window.__rainSampler = setInterval(() => {
    const el = document.querySelector('[data-testid^="money-rain-"]');
    if (!el) return;
    const notes = Array.from(el.children).map(c => {
      const r = c.getBoundingClientRect(); const cs = getComputedStyle(c);
      const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
      const rot = Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI);
      return { cy: Math.round(r.top + r.height / 2), cx: Math.round(r.left + r.width / 2), op: +(+cs.opacity).toFixed(2), rot, ty: Math.round(m.m42) };
    });
    window.__rainSamples.push({ t: Math.round(performance.now()), v: el.getAttribute('data-testid'), aria: el.getAttribute('aria-hidden'), notes });
  }, 50);
})();
"""

async def samples(page):
    return await page.evaluate("() => window.__rainSamples || []")

async def reset_samples(page):
    await page.evaluate("() => { window.__rainSamples = []; window.__rains = []; }")


def summarize(samps, height=844):
    if not samps:
        return "NO SAMPLES"
    counts = sorted({len(s['notes']) for s in samps})
    vis = [n for s in samps for n in s['notes'] if n['op'] > 0.05]
    ys = [n['cy'] for n in vis]
    per_note_ty = {}
    for s in samps:
        for i, n in enumerate(s['notes']):
            per_note_ty.setdefault(i, []).append(n['ty'])
    travel = max((max(v) - min(v)) for v in per_note_ty.values()) if per_note_ty else 0
    rots = {}
    for s in samps:
        for i, n in enumerate(s['notes']):
            rots.setdefault(i, []).append(n['rot'])
    rot_change = max((max(v) - min(v)) for v in rots.values()) if rots else 0
    return {
        'variant': samps[0]['v'], 'aria': samps[0]['aria'], 'note_counts': counts,
        'visible_y_min': min(ys) if ys else None, 'visible_y_max': max(ys) if ys else None,
        'max_translateY_travel': travel, 'max_rotation_change': rot_change,
        'first_visible_y': sorted(n['cy'] for n in samps[0]['notes'])[:3],
        'span_ms': samps[-1]['t'] - samps[0]['t'], 'n_samples': len(samps),
    }
