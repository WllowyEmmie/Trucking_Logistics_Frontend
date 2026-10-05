// Schematic stand-in for Leaflet + OSM tiles. Coordinates are normalised 0–1.
(function () {
  const R = window.React, h = R.createElement;
  const T = { land: 'var(--map-land)', block: 'var(--map-block)', road: 'var(--map-road)', casing: 'var(--map-road-casing)', primary: 'var(--map-primary)', primaryCasing: 'var(--map-primary-casing)', water: 'var(--map-water)', park: 'var(--map-park)' };
  function rng(seed) { let s = (seed * 9301 + 49297) >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const cache = {};
  function base(seed) {
    if (cache[seed]) return cache[seed];
    const r = rng(seed), k = [];
    const ns = { vectorEffect: 'non-scaling-stroke', fill: 'none', strokeLinecap: 'round' };
    k.push(h('rect', { key: 'bg', x: 0, y: 0, width: 100, height: 100, fill: T.land }));
    for (let i = 0; i < 26; i++) k.push(h('rect', { key: 'b' + i, x: r() * 95, y: r() * 95, width: 4 + r() * 9, height: 3 + r() * 7, fill: T.block }));
    k.push(h('path', { key: 'p1', d: 'M60 8 h16 v12 h-16 z', fill: T.park }));
    k.push(h('path', { key: 'p2', d: 'M6 72 h12 v16 h-12 z', fill: T.park }));
    k.push(h('path', { key: 'w', d: 'M-5 55 C 18 47, 34 64, 54 58 S 84 45, 105 53 L105 60 C 84 53, 70 66, 54 65 S 18 55, -5 62 Z', fill: T.water }));
    const m = [];
    for (let i = 0; i < 12; i++) { const x = 4 + i * 8.3 + (r() - .5) * 3; m.push(`M${x} -2 L${x + (r() - .5) * 8} 102`); }
    for (let i = 0; i < 10; i++) { const y = 4 + i * 10 + (r() - .5) * 3; m.push(`M-2 ${y} L102 ${y + (r() - .5) * 8}`); }
    const d = m.join(' ');
    k.push(h('path', Object.assign({ key: 'mc', d, stroke: T.casing, strokeWidth: 6 }, ns)));
    k.push(h('path', Object.assign({ key: 'mr', d, stroke: T.road, strokeWidth: 4 }, ns)));
    const M = 'M-2 88 C 25 70, 45 52, 102 20 M 30 -2 C 38 30, 52 70, 58 102 M -2 30 C 30 36, 70 30, 102 42';
    k.push(h('path', Object.assign({ key: 'Mc', d: M, stroke: T.primaryCasing, strokeWidth: 10 }, ns)));
    k.push(h('path', Object.assign({ key: 'Mr', d: M, stroke: T.primary, strokeWidth: 7 }, ns)));
    return (cache[seed] = h('svg', { key: 'base', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%' } }, k));
  }
  function truckIcon(color, size) {
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2' }), h('path', { d: 'M15 18H9' }),
      h('path', { d: 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14' }),
      h('circle', { cx: 17, cy: 18, r: 2 }), h('circle', { cx: 7, cy: 18, r: 2 }));
  }
  const chip = { background: 'var(--map-label-bg)', color: 'var(--map-ink)', border: '1px solid var(--map-ink)', borderRadius: 4, padding: '2px 6px', font: '600 12px/16px var(--font-mono)', whiteSpace: 'nowrap', pointerEvents: 'none' };
  function DispatchMap(p) {
    const stops = p.stops || [], trucks = p.trucks || [], route = p.route || null, dc = p.doneCount || 0, links = p.links || [], dur = p.duration == null ? 10 : p.duration;
    const pts = a => a.map(q => q[0] * 100 + ',' + q[1] * 100).join(' ');
    const ln = { fill: 'none', vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' };
    const kids = [base(p.seed || 3)];
    if (p.dim) kids.push(h('div', { key: 'dim', style: { position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--map-label-bg) 62%, transparent)' } }));
    const lines = [];
    if (route && route.length > 1) {
      const done = route.slice(0, Math.max(dc, 0)), rest = route.slice(Math.max(dc - 1, 0));
      if (done.length > 1) {
        lines.push(h('polyline', Object.assign({ key: 'dc', points: pts(done), stroke: 'var(--map-label-bg)', strokeWidth: 7 }, ln)));
        lines.push(h('polyline', Object.assign({ key: 'd', points: pts(done), stroke: 'var(--marker-stale)', strokeWidth: 3.5 }, ln)));
      }
      if (rest.length > 1) {
        lines.push(h('polyline', Object.assign({ key: 'rc', points: pts(rest), stroke: 'var(--map-label-bg)', strokeWidth: 8 }, ln)));
        lines.push(h('polyline', Object.assign({ key: 'r', points: pts(rest), stroke: 'var(--marker-dropoff)', strokeWidth: 4.5 }, ln)));
      }
    }
    links.forEach((l, i) => {
      lines.push(h('line', Object.assign({ key: 'lc' + i, x1: l.a[0] * 100, y1: l.a[1] * 100, x2: l.b[0] * 100, y2: l.b[1] * 100, stroke: 'var(--map-label-bg)', strokeWidth: 6 }, ln)));
      lines.push(h('line', Object.assign({ key: 'l' + i, x1: l.a[0] * 100, y1: l.a[1] * 100, x2: l.b[0] * 100, y2: l.b[1] * 100, stroke: 'var(--ink)', strokeWidth: 2.5, strokeDasharray: '7 6' }, ln)));
    });
    kids.push(h('svg', { key: 'ov', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' } }, lines));
    stops.forEach(s => {
      const col = s.kind === 'pickup' ? 'var(--marker-pickup)' : 'var(--marker-dropoff)', sz = s.small ? 22 : 30;
      kids.push(h('div', { key: 's' + (s.id || s.n), style: { position: 'absolute', left: s.x * 100 + '%', top: s.y * 100 + '%', width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2, zIndex: 2, pointerEvents: 'none' } },
        h('div', { 'aria-label': (s.kind === 'pickup' ? 'Pickup, stop ' : 'Drop-off, stop ') + s.n + (s.done ? ', done' : ''), style: { width: sz, height: sz, borderRadius: s.kind === 'pickup' ? 6 : 999, background: s.done ? col : 'var(--map-label-bg)', border: '3px solid ' + col, color: s.done ? 'var(--map-label-bg)' : col, boxShadow: '0 0 0 2px var(--map-label-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 13px/1 var(--font-sans)', boxSizing: 'border-box' } }, s.n),
        s.label ? h('span', { style: Object.assign({ position: 'absolute', top: sz + 6, left: '50%', transform: 'translateX(-50%)' }, chip) }, s.label) : null));
    });
    trucks.forEach(t => {
      if (t.x == null || t.y == null) return;
      const stale = t.state === 'stale', idle = t.state === 'idle', sz = t.size === 'sm' ? 22 : 34;
      const c = stale ? 'var(--marker-stale)' : 'var(--marker-truck)';
      const vis = h('span', { style: { width: sz, height: sz, borderRadius: 999, background: stale || idle ? 'var(--map-label-bg)' : c, border: stale ? `2px dashed ${c}` : idle ? `3px solid ${c}` : '2px solid var(--map-label-bg)', boxShadow: t.selected ? '0 0 0 2px var(--map-label-bg), 0 0 0 5px var(--focus-ring)' : (stale || idle ? '0 0 0 2px var(--map-label-bg)' : '0 0 0 1px var(--map-ink)'), display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', flex: 'none' } }, truckIcon(stale || idle ? c : 'var(--map-label-bg)', Math.round(sz * 0.55)));
      const label = t.label ? h('span', { style: Object.assign({ position: 'absolute', top: 22 + sz / 2 + 4, left: '50%', transform: 'translateX(-50%)', color: stale ? 'var(--map-ink-muted)' : 'var(--map-ink)', borderStyle: stale ? 'dashed' : 'solid' }, chip) }, t.label) : null;
      const click = p.onTruck;
      kids.push(h(click ? 'button' : 'div', { key: 't' + t.id, type: click ? 'button' : undefined, onClick: click ? () => click(t.id) : undefined, 'aria-label': t.aria || t.label || t.id, title: t.aria || t.id, style: { position: 'absolute', left: t.x * 100 + '%', top: t.y * 100 + '%', width: 44, height: 44, margin: '-22px 0 0 -22px', padding: 0, border: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: `left ${dur}s linear, top ${dur}s linear`, zIndex: t.selected ? 6 : t.size === 'sm' ? 3 : 4, cursor: click ? 'pointer' : 'default' } }, vis, label));
    });
    if (p.note) kids.push(h('div', { key: 'note', role: 'status', style: { position: 'absolute', left: 12, top: 12, right: 12, maxWidth: 'max-content', background: 'var(--map-label-bg)', color: 'var(--map-ink)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', font: '600 14px/20px var(--font-sans)', zIndex: 8 } }, p.note));
    if (p.controls) kids.push(h('div', { key: 'ctl', style: { position: 'absolute', right: 12, top: 12, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 8 } },
      ['+', '−'].map(s => h('button', { key: s, type: 'button', 'aria-label': s === '+' ? 'Zoom in' : 'Zoom out', style: { width: 44, height: 44, background: 'var(--map-label-bg)', color: 'var(--map-ink)', border: '1px solid var(--border)', borderRadius: 8, font: '600 20px/1 var(--font-sans)', cursor: 'pointer' } }, s))));
    if (p.legend) {
      const item = (el, txt) => h('span', { key: txt, style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, el, txt);
      const dot = (bg, bd) => h('span', { style: { width: 14, height: 14, borderRadius: 999, background: bg, border: bd, boxSizing: 'border-box' } });
      kids.push(h('div', { key: 'lg', style: { position: 'absolute', left: 12, bottom: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', background: 'var(--map-label-bg)', color: 'var(--map-ink)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', font: '500 12px/16px var(--font-sans)', zIndex: 8, maxWidth: 'calc(100% - 24px)' } },
        item(dot('var(--marker-truck)', '2px solid var(--map-label-bg)'), 'Moving'), item(dot('var(--map-label-bg)', '3px solid var(--marker-truck)'), 'Available'), item(dot('var(--map-label-bg)', '2px dashed var(--marker-stale)'), 'Silent 20+ min'),
        item(h('span', { style: { width: 14, height: 14, borderRadius: 3, background: 'var(--marker-pickup)' } }), 'Pickup'), item(dot('var(--marker-dropoff)', 'none'), 'Drop-off')));
    }
    kids.push(h('div', { key: 'attr', style: { position: 'absolute', right: 0, bottom: 0, background: 'color-mix(in srgb, var(--map-label-bg) 85%, transparent)', color: 'var(--map-ink)', font: '400 11px/16px var(--font-sans)', padding: '0 6px', zIndex: 8 } }, '© OpenStreetMap contributors'));
    return h('div', { dir: 'ltr', style: { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: T.land, isolation: 'isolate' } }, kids);
  }
  window.DispatchMap = DispatchMap;
  if (typeof module !== 'undefined') module.exports = { DispatchMap };
})();
