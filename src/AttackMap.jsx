import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath, geoGraticule10 } from 'd3-geo';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';
import 'd3-transition';
import { feature, merge } from 'topojson-client';
import { Plus, Minus, Crosshair, Maximize2 } from 'lucide-react';
import worldTopo from './assets/geo/world-50m.topo.json';
import vnTopo from './assets/geo/vn34.topo.json';

const typeColor = (type) => ({ 'Brute Force': '#ff3d5e', 'Web Attack': '#ff8a2a', Malware: '#ffcf33', 'Policy Violation': '#2f8cff', Policy: '#2f8cff', Reconnaissance: '#a66bff', Recon: '#a66bff', 'DoS/DDoS': '#22c7e8', DDoS: '#22c7e8', Others: '#7c8aa8' })[type] || '#7c8aa8';
const fmt = (value) => (value == null || Number.isNaN(value) ? '—' : new Intl.NumberFormat('en-US').format(Math.round(value)));

// ---------------------------------------------------------------- dữ liệu tĩnh

const ANTARCTICA = '010';
const VN_ID = '704';
const worldFeatures = feature(worldTopo, worldTopo.objects.countries).features.filter((f) => f.id !== ANTARCTICA);
const landShape = merge(worldTopo, worldTopo.objects.countries.geometries.filter((g) => g.id !== ANTARCTICA));
const provinces = feature(vnTopo, vnTopo.objects[Object.keys(vnTopo.objects)[0]]).features;

// Quần đảo Hoàng Sa (TP. Đà Nẵng) và Trường Sa (tỉnh Khánh Hòa) — chủ quyền Việt Nam
const HOANG_SA = [
  [112.339, 16.834], [111.608, 16.533], [111.2, 15.783], [112.73, 16.67], [111.7, 16.45],
  [111.53, 16.45], [111.78, 16.05], [112.26, 16.98], [112.05, 16.6],
];
const TRUONG_SA = [
  [111.92, 8.645], [114.33, 11.43], [114.36, 10.18], [114.33, 9.88], [114.48, 10.37], [112.91, 7.89],
  [114.28, 11.05], [114.36, 10.38], [112.2, 8.85], [113.69, 8.97], [115.03, 10.67], [113.3, 9.4],
];
const VN_BOUNDS = { type: 'MultiPoint', coordinates: [[102.1, 8.3], [117.0, 23.4]] };
// Kinh tuyến trung tâm 10°E để Châu Á - Thái Bình Dương không bị cắt mép
const WORLD_BOUNDS = { north: 78, south: -56, centerLon: 10 };

const MAX_ACTIVE = 180;
const IMPACT_MS = 900;
const FADE_MS = 3600;

const qbez = (a, c, b, t) => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
};
const curveControl = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dist = Math.hypot(dx, dy);
  let nx = -dy / (dist || 1), ny = dx / (dist || 1);
  if (ny > 0) { nx = -nx; ny = -ny; }
  const bend = Math.min(dist * 0.32, 260);
  return [(a[0] + b[0]) / 2 + nx * bend, (a[1] + b[1]) / 2 + ny * bend];
};
const makeArcTable = (a, c, b, steps = 64) => {
  const table = [{ t: 0, length: 0 }];
  let previous = qbez(a, c, b, 0), length = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, point = qbez(a, c, b, t);
    length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    table.push({ t, length });
    previous = point;
  }
  return table;
};
const arcParameter = (table, progress) => {
  const target = table[table.length - 1].length * progress;
  const index = table.findIndex(point => point.length >= target);
  if (index <= 0) return 0;
  const before = table[index - 1], after = table[index];
  const span = after.length - before.length;
  return before.t + (after.t - before.t) * (span ? (target - before.length) / span : 0);
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- component

const AttackMap = forwardRef(function AttackMap({ provinceTargets = [], flights = [], mode = 'global', onModeChange }, ref) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const canvasRef = useRef(null);
  const zoomRef = useRef(null);
  const tRef = useRef(zoomIdentity);
  const projRef = useRef(null);
  const pendingRef = useRef([]);
  const activeRef = useRef([]);
  const nodesRef = useRef(new Map());
  const calloutsRef = useRef([]);

  const [size, setSize] = useState({ w: 800, h: 480 });
  const [tf, setTf] = useState(zoomIdentity);
  const [tip, setTip] = useState(null);
  const [view, setView] = useState(mode === 'vietnam' ? 'vn' : 'world');

  // ---- projection theo kích thước khung
  const projection = useMemo(() => {
    // "cover": lấp đầy khung theo chiều rộng/cao, cắt bớt vùng cực (lat 78°N .. 56°S)
    const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const yTop = merc(WORLD_BOUNDS.north);
    const yBot = merc(WORLD_BOUNDS.south);
    const scale = Math.max(size.w / (2 * Math.PI), size.h / (yTop - yBot));
    const midY = (yTop + yBot) / 2;
    const p = geoMercator()
      .scale(scale)
      .rotate([-WORLD_BOUNDS.centerLon, 0])
      .center([0, 0])
      .translate([size.w / 2, size.h / 2 + midY * scale]);
    projRef.current = p;
    return p;
  }, [size]);
  const path = useMemo(() => geoPath(projection), [projection]);

  const countryPaths = useMemo(
    () => worldFeatures.filter((f) => f.id !== VN_ID).map((f) => ({ id: f.id, name: f.properties.name, d: path(f) })),
    [path],
  );
  const vnOutline = useMemo(() => path(worldFeatures.find((f) => f.id === VN_ID)), [path]);
  const landD = useMemo(() => path(landShape), [path]);
  const gratD = useMemo(() => path(geoGraticule10()), [path]);
  const provPaths = useMemo(
    () => provinces.map((f) => ({ ...f.properties, d: path(f), c: projection([f.properties.lon, f.properties.lat]) })),
    [path, projection],
  );
  const islands = useMemo(
    () => ({ hs: HOANG_SA.map((c) => projection(c)), ts: TRUONG_SA.map((c) => projection(c)) }),
    [projection],
  );

  // ---- mật độ tấn công theo tỉnh
  const heat = useMemo(() => {
    const m = new Map(provinceTargets.map((p) => [p.name, p.count]));
    const max = Math.max(1, ...provinceTargets.map((p) => p.count));
    return { m, max };
  }, [provinceTargets]);

  const provFill = (name) => {
    const v = heat.m.get(name) || 0;
    const r = Math.sqrt(v / heat.max);
    // xanh đậm -> xanh sáng theo mức độ bị tấn công
    const a = 0.25 + r * 0.6;
    return `rgba(${Math.round(30 + r * 30)}, ${Math.round(90 + r * 70)}, ${Math.round(200 + r * 55)}, ${a.toFixed(2)})`;
  };

  // ---- resize
  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.max(300, Math.round(width)), h: Math.max(200, Math.round(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- zoom
  useEffect(() => {
    const svg = select(svgRef.current);
    let raf = 0;
    const z = d3zoom()
      .scaleExtent([1, 48])
      .translateExtent([[-size.w * 0.15, -size.h * 0.2], [size.w * 1.15, size.h * 1.2]])
      .on('zoom', (e) => {
        tRef.current = e.transform;
        gRef.current?.setAttribute('transform', e.transform.toString());
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            setTf(tRef.current);
          });
        }
      });
    zoomRef.current = z;
    svg.call(z).on('dblclick.zoom', null);
    svg.call(z.transform, tRef.current);
    return () => svg.on('.zoom', null);
  }, [size]);

  const zoomTo = (geom, dur = 1200) => {
    const [[x0, y0], [x1, y1]] = path.bounds(geom);
    const k = Math.min(48, 0.92 / Math.max((x1 - x0) / size.w, (y1 - y0) / size.h));
    const t = zoomIdentity.translate(size.w / 2 - (k * (x0 + x1)) / 2, size.h / 2 - (k * (y0 + y1)) / 2).scale(k);
    select(svgRef.current).transition().duration(dur).call(zoomRef.current.transform, t);
  };
  const zoomBy = (f) => select(svgRef.current).transition().duration(350).call(zoomRef.current.scaleBy, f);
  const reset = () => {
    setView('world');
    select(svgRef.current).transition().duration(1000).call(zoomRef.current.transform, zoomIdentity);
    onModeChange?.('global');
  };
  const focusVN = () => {
    setView('vn');
    zoomTo(VN_BOUNDS);
    onModeChange?.('vietnam');
  };

  useEffect(() => {
    if (mode === 'vietnam') focusVN();
    else reset();
  }, [mode]);

  // ---- nhận luồng tấn công mới từ App
  useImperativeHandle(ref, () => ({
    launch(flows) {
      if (!flows?.length) return;
      const now = performance.now();
      const t0 = flows[0].ts;
      const span = Math.max(1, flows[flows.length - 1].ts - t0);
      flows.forEach((f, i) => {
        if (f.src?.lat == null || f.dst?.lat == null) return;
        // giãn đều các luồng trong ~2.8s để tạo dòng chảy liên tục
        const offset = flows.length === 1 ? 0 : ((f.ts - t0) / span) * 5000;
        pendingRef.current.push({ f, at: now + offset });
      });
    },
  }));

  const flightKey = flights.map((flight) => `${flight.src}-${flight.dst}-${flight.time}-${flight.type}`).join('|');
  useEffect(() => {
    if (!flights.length) return;
    const playBatch = () => {
      const start = Date.now();
      const mapped = flights.slice(0, 50).map((flight, index) => ({
        src: { lat: Number(flight.from?.[0]), lon: Number(flight.from?.[1]) },
        dst: { lat: Number(flight.to?.[0]), lon: Number(flight.to?.[1]), province: flight.dst?.split(' • ')[0] },
        srcIp: flight.src,
        dstIp: flight.dst?.split(' • ').at(-1),
        type: flight.type,
        severity: flight.severity ?? (['Malware', 'DDoS', 'Brute Force'].includes(flight.type) ? 8 : 5),
        ts: start + index * 100,
      }));
      ref.current?.launch(mapped);
    };
    playBatch();
    const interval = window.setInterval(playBatch, 5000);
    return () => {
      window.clearInterval(interval);
      pendingRef.current = [];
    };
  }, [flightKey]);

  // ---- vòng lặp vẽ canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    let raf;

    const hitProvince = (name) => {
      if (!name) return;
      const el = svgRef.current?.querySelector(`[data-prov="${CSS.escape(name)}"]`);
      if (!el) return;
      el.classList.remove('hit');
      void el.getBoundingClientRect();
      el.classList.add('hit');
    };

    const frame = () => {
      const now = performance.now();
      const T = tRef.current;
      const proj = projRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);

      // đưa luồng đến hạn vào danh sách đang bay
      const pend = pendingRef.current;
      for (let i = pend.length - 1; i >= 0; i--) {
        if (pend[i].at <= now) {
          const { f } = pend[i];
          pend.splice(i, 1);
          if (activeRef.current.length >= MAX_ACTIVE) activeRef.current.shift();
          const sp = proj([f.src.lon, f.src.lat]);
          const dp = proj([f.dst.lon, f.dst.lat]);
          const control = curveControl(sp, dp);
          const arc = makeArcTable(sp, control, dp);
          const dur = Math.max(1, arc[arc.length - 1].length / 0.16);
          activeRef.current.push({ f, sp, dp, arc, start: now, dur, color: typeColor(f.type), hit: false });
          nodesRef.current.set(`s:${f.srcIp}`, { p: sp, kind: 'src', seen: now, color: typeColor(f.type) });
          nodesRef.current.set(`d:${f.dstIp}`, { p: dp, kind: 'dst', seen: now });
          if (f.severity >= 8) {
            calloutsRef.current.push({ f, p: sp, born: now });
            if (calloutsRef.current.length > 3) calloutsRef.current.shift();
          }
        }
      }

      // nút nguồn / đích (chấm phát sáng nhịp)
      ctx.globalCompositeOperation = 'lighter';
      for (const [key, n] of nodesRef.current) {
        const age = now - n.seen;
        if (age > 45_000) {
          nodesRef.current.delete(key);
          continue;
        }
        const life = 1 - age / 45_000;
        const [x, y] = T.apply(n.p);
        if (x < -20 || y < -20 || x > size.w + 20 || y > size.h + 20) continue;
        const col = n.kind === 'src' ? '255,61,94' : '47,140,255';
        const r = 2.5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.45);
        g.addColorStop(0, `rgba(${col},${0.45 * life})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${col},${0.95 * life})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // luồng tấn công
      const act = activeRef.current;
      for (let i = act.length - 1; i >= 0; i--) {
        const a = act[i];
        const el = now - a.start;
        const total = a.dur + IMPACT_MS + FADE_MS;
        if (el > total) {
          act.splice(i, 1);
          continue;
        }
        const S = T.apply(a.sp);
        const D = T.apply(a.dp);
        const dx = D[0] - S[0];
        const dy = D[1] - S[1];
        const dist = Math.hypot(dx, dy);
        if (dist < 2) continue;
        // điểm điều khiển: lệch vuông góc, luôn cong lên trên
        const C = curveControl(S, D);
        const t = Math.min(1, el / a.dur);
        const st = arcParameter(a.arc, t);
        const fade = el > a.dur + IMPACT_MS ? 1 - (el - a.dur - IMPACT_MS) / FADE_MS : 1;
        const rgb = hexToRgb(a.color);

        // vệt quỹ đạo mờ
        ctx.lineCap = 'round';
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = `rgba(${rgb},${0.26 * fade})`;
        ctx.beginPath();
        const upto = Math.max(2, Math.round(40 * st));
        for (let s = 0; s <= upto; s++) {
          const p = qbez(S, C, D, (st * s) / upto);
          if (s === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke();

        if (t < 1) {
          // chớp sáng khi khai hoả
          if (t < 0.3) {
            const k = t / 0.3;
            const r0 = 3 + k * 14;
            const g0 = ctx.createRadialGradient(S[0], S[1], 0, S[0], S[1], r0);
            g0.addColorStop(0, `rgba(255,255,255,${0.8 * (1 - k)})`);
            g0.addColorStop(0.4, `rgba(${rgb},${0.6 * (1 - k)})`);
            g0.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g0;
            ctx.beginPath();
            ctx.arc(S[0], S[1], r0, 0, Math.PI * 2);
            ctx.fill();
          }
          // đuôi sao chổi (đạn)
        const tail = 0.12;
          const segs = 14;
          for (let s = 0; s < segs; s++) {
            const ta = Math.max(0, st - tail * (1 - s / segs));
            const tb = Math.max(0, st - tail * (1 - (s + 1) / segs));
            const pa = qbez(S, C, D, ta);
            const pb = qbez(S, C, D, tb);
            const w = s / segs;
            ctx.strokeStyle = `rgba(${rgb},${0.15 + w * 0.85})`;
            ctx.lineWidth = 0.45 + w * 1.8;
            ctx.beginPath();
            ctx.moveTo(pa[0], pa[1]);
            ctx.lineTo(pb[0], pb[1]);
            ctx.stroke();
          }
          // đầu đạn
          const H = qbez(S, C, D, st);
          const gh = ctx.createRadialGradient(H[0], H[1], 0, H[0], H[1], 7.5);
          gh.addColorStop(0, 'rgba(255,255,255,0.95)');
          gh.addColorStop(0.25, `rgba(${rgb},0.85)`);
          gh.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = gh;
          ctx.beginPath();
          ctx.arc(H[0], H[1], 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(H[0], H[1], 1.35, 0, Math.PI * 2);
          ctx.fill();
        } else {
          if (!a.hit) {
            a.hit = true;
            hitProvince(a.f.dst?.province);
          }
          // hiệu ứng trúng đích: sóng lan + chớp
          const k = Math.min(1, (el - a.dur) / IMPACT_MS);
          if (k < 1) {
            for (let r = 0; r < 2; r++) {
              const kk = Math.min(1, k * 1.25 - r * 0.25);
              if (kk <= 0) continue;
              ctx.strokeStyle = `rgba(${rgb},${0.9 * (1 - kk)})`;
              ctx.lineWidth = 2 - kk * 1.4;
              ctx.beginPath();
              ctx.arc(D[0], D[1], 3 + kk * 22, 0, Math.PI * 2);
              ctx.stroke();
            }
            const gi = ctx.createRadialGradient(D[0], D[1], 0, D[0], D[1], 14);
            gi.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`);
            gi.addColorStop(0.35, `rgba(${rgb},${0.7 * (1 - k)})`);
            gi.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = gi;
            ctx.beginPath();
            ctx.arc(D[0], D[1], 14, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // nhãn chú thích luồng nguy hiểm
      ctx.globalCompositeOperation = 'source-over';
      const cl = calloutsRef.current;
      for (let i = cl.length - 1; i >= 0; i--) {
        const c = cl[i];
        const age = now - c.born;
        if (age > 9000) {
          cl.splice(i, 1);
          continue;
        }
        const alpha = Math.min(1, age / 300) * Math.min(1, (9000 - age) / 600);
        const [x, y] = T.apply(c.p);
        drawCallout(ctx, x, y, c.f, alpha, size);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // khi projection đổi (resize) -> chiếu lại các điểm đang có
  useEffect(() => {
    const p = projRef.current;
    for (const a of activeRef.current) {
      a.sp = p([a.f.src.lon, a.f.src.lat]);
      a.dp = p([a.f.dst.lon, a.f.dst.lat]);
    }
    nodesRef.current.clear();
    calloutsRef.current = [];
  }, [projection]);

  const k = tf.k;
  const showProvLabels = k >= 5;
  const showIslandLabels = k >= 2.6;
  const dotOpacity = Math.max(0, Math.min(0.55, 0.75 - k * 0.09));

  const onMove = (e, content) => {
    const r = wrapRef.current.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, content });
  };

  return (
    <div className="attack-map" ref={wrapRef} onMouseLeave={() => setTip(null)}>
      <svg ref={svgRef} width={size.w} height={size.h} className="map-svg">
        <defs>
          <radialGradient id="ocean" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#0b1a3d" />
            <stop offset="60%" stopColor="#071330" />
            <stop offset="100%" stopColor="#040b1f" />
          </radialGradient>
          <pattern id="landDots" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
            <circle cx="1.6" cy="1.6" r="0.62" fill="#6ea8ff" />
          </pattern>
          <linearGradient id="landFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#13285a" />
            <stop offset="100%" stopColor="#0e1f48" />
          </linearGradient>
          <filter id="vnGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={size.w} height={size.h} fill="url(#ocean)" />
        <g ref={gRef} transform={tRef.current.toString()}>
          <path d={gratD} className="graticule" />
          <g className="countries">
            {countryPaths.map((c) => (
              <path
                key={c.id}
                d={c.d}
                onMouseMove={(e) => onMove(e, <b>{c.name}</b>)}
                onMouseLeave={() => setTip(null)}
              />
            ))}
          </g>
          <path d={landD} fill="url(#landDots)" opacity={dotOpacity} pointerEvents="none" />
          <path d={vnOutline} className="vn-outline" filter="url(#vnGlow)" />
          <g className="provinces">
            {provPaths.map((p) => (
              <path
                key={p.id}
                d={p.d}
                data-prov={p.name}
                fill={provFill(p.name)}
                onMouseMove={(e) =>
                  onMove(
                    e,
                    <>
                      <b>{p.name}</b>
                      {p.formerly?.length > 0 && <div className="tip-sub">Hợp nhất từ: {p.formerly.join(', ')}</div>}
                      <div className="tip-val">
                        Tấn công nhắm tới: <span>{fmt(heat.m.get(p.name) || 0)}</span>
                      </div>
                    </>,
                  )
                }
                onMouseLeave={() => setTip(null)}
              />
            ))}
          </g>
          <g className="islands">
            {islands.hs.map((c, i) => (
              <circle key={`hs-${i}`} cx={c[0]} cy={c[1]} r={Math.min(2.4, 5 / k)} onMouseMove={(e) => onMove(e, <b>Quần đảo Hoàng Sa · TP. Đà Nẵng</b>)} onMouseLeave={() => setTip(null)} />
            ))}
            {islands.ts.map((c, i) => (
              <circle key={`ts-${i}`} cx={c[0]} cy={c[1]} r={Math.min(2.4, 5 / k)} onMouseMove={(e) => onMove(e, <b>Quần đảo Trường Sa · tỉnh Khánh Hòa</b>)} onMouseLeave={() => setTip(null)} />
            ))}
          </g>
          <g className="flow-endpoints">
            {flights.slice(0, 20).map((flight, index) => {
              const src = projection([flight.from?.[1], flight.from?.[0]]);
              const dst = projection([flight.to?.[1], flight.to?.[0]]);
              if (![...src, ...dst].every(Number.isFinite)) return null;
              const details = <><div><b>SRC IP:</b> {flight.src || '—'}</div><div><b>DESC IP:</b> {flight.dst?.split(' • ').at(-1) || flight.dst || '—'}</div><div><b>Kiểu tấn công:</b> {flight.type || 'Sự kiện'}</div></>;
              return <React.Fragment key={`${flight.src}-${flight.dst}-${flight.time}-${index}`}>
                <circle className="flow-endpoint source" cx={src[0]} cy={src[1]} r="2.5" onMouseMove={e => onMove(e, details)} onMouseLeave={() => setTip(null)} />
                <circle className="flow-endpoint destination" cx={dst[0]} cy={dst[1]} r="2.5" onMouseMove={e => onMove(e, details)} onMouseLeave={() => setTip(null)} />
              </React.Fragment>;
            })}
          </g>
        </g>

        {/* Nhãn (toạ độ màn hình để chữ luôn sắc nét) */}
        <g className="map-labels" pointerEvents="none">
          {showProvLabels &&
            placeLabels(provPaths, tf, size, heat.m).map(({ p, x, y }) => {
              return (
                <g key={p.id} transform={`translate(${x},${y})`}>
                  <circle r="1.8" className="cap-dot" />
                  <text y={-5} className="prov-label">
                    {p.name}
                  </text>
                </g>
              );
            })}
          {showIslandLabels && (
            <>
              <IslandLabel pts={islands.hs} tf={tf} text="QĐ. Hoàng Sa" sub="(TP. Đà Nẵng)" />
              <IslandLabel pts={islands.ts} tf={tf} text="QĐ. Trường Sa" sub="(Khánh Hòa)" />
              {(() => {
                const [x, y] = tf.apply(projection([113.2, 13.6]));
                return (
                  <text x={x} y={y} className="sea-label">
                    BIỂN ĐÔNG
                  </text>
                );
              })()}
            </>
          )}
        </g>
      </svg>

      <canvas ref={canvasRef} className="map-canvas" />

      <div className="map-controls">
        <button onClick={() => zoomBy(1.6)} title="Phóng to">
          <Plus size={15} />
        </button>
        <button onClick={() => zoomBy(1 / 1.6)} title="Thu nhỏ">
          <Minus size={15} />
        </button>
        <button onClick={reset} title="Toàn cảnh">
          <Maximize2 size={13} />
        </button>
        <button onClick={focusVN} title="Việt Nam" className={view === 'vn' ? 'on' : ''}>
          <Crosshair size={14} />
        </button>
      </div>
<div className="map-legend">
        <span>
          <i className="lg-dot red" /> Nguồn tấn công
        </span>
        <span>
          <i className="lg-dot blue" /> Đích tấn công
        </span>
        <span>
          <i className="lg-box" /> Cảnh báo mức cao
        </span>
        <span>
          <i className="lg-arrow" /> Luồng tấn công
        </span>
      </div>

      {tip && (
        <div className="map-tip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          {tip.content}
        </div>
      )}
    </div>
  );
});

/** Đặt nhãn tỉnh/thành, bỏ các nhãn chồng lấn (ưu tiên tỉnh bị tấn công nhiều, rồi thủ đô). */
function placeLabels(provs, tf, size, heat) {
  const order = [...provs].sort((a, b) => {
    const pa = (a.name === 'Hà Nội' ? 1e15 : 0) + (heat.get(a.name) || 0);
    const pb = (b.name === 'Hà Nội' ? 1e15 : 0) + (heat.get(b.name) || 0);
    return pb - pa;
  });
  const boxes = [];
  const out = [];
  for (const p of order) {
    const [x, y] = tf.apply(p.c);
    if (x < 0 || y < 0 || x > size.w || y > size.h) continue;
    const w = p.name.length * 5.7 + 6;
    const b = [x - w / 2, y - 16, x + w / 2, y + 3];
    if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
    boxes.push(b);
    out.push({ p, x, y });
  }
  return out;
}

function IslandLabel({ pts, tf, text, sub }) {
  const xs = pts.map((p) => tf.apply(p));
  const x = xs.reduce((s, p) => s + p[0], 0) / xs.length;
  const y = Math.min(...xs.map((p) => p[1]));
  return (
    <g transform={`translate(${x},${y - 8})`}>
      <text className="island-label">{text}</text>
      <text y={11} className="island-sub">
        {sub}
      </text>
    </g>
  );
}

const rgbCache = new Map();
function hexToRgb(hex) {
  if (rgbCache.has(hex)) return rgbCache.get(hex);
  const n = parseInt(hex.slice(1), 16);
  const v = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  rgbCache.set(hex, v);
  return v;
}

function drawCallout(ctx, x, y, f, alpha, size) {
  const color = typeColor(f.type);
  const l1 = f.srcIp;
  const l2 = `→ ${f.dstIp}`;
  const l3 = f.type;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 10.5px Inter, sans-serif';
  const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width, ctx.measureText(l3).width) + 16;
  const h = 46;
  let bx = x + 12;
  let by = y - h - 10;
  if (bx + w > size.w - 4) bx = x - w - 12;
  if (by < 4) by = y + 10;
  // đường dẫn
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(bx < x ? bx + w : bx, by + h / 2);
  ctx.stroke();
  roundRect(ctx, bx, by, w, h, 5);
  ctx.fillStyle = 'rgba(8,16,38,0.92)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = '#e8eefc';
  ctx.fillText(l1, bx + 8, by + 14);
  ctx.font = '500 10px Inter, sans-serif';
  ctx.fillStyle = '#b8c4e0';
  ctx.fillText(l2, bx + 8, by + 27);
  ctx.font = '600 10px Inter, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(l3, bx + 8, by + 40);
  ctx.restore();
}

export default AttackMap;
