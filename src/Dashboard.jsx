import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Shield, ChevronDown, CalendarDays, ArrowUpRight, Check, RefreshCw, UserRound, LogOut, Save, X, Clock3, ImagePlus, Sun, Moon } from 'lucide-react';
import { kpis, alertTypes, sources, solutions, attacks } from './data.js';
import AttackMap from './AttackMap.jsx';
const samples = Array.from({ length: 24 }, (_, i) => ({ time: `${String((6 + i) % 24).padStart(2, '0')}:00`, events: 3.5 + Math.sin(i * .47) * 1.5 + i * .075 + (i % 6 === 0 ? .6 : 0) }));
const demoTotalAlerts = alertTypes.reduce((total, row) => total + Number(row[2]), 0);
const attackBars = [['Brute Force', 1.76, '#f13e59'], ['Web Attack', 1.24, '#ff853b'], ['Malware', .89, '#ffc33f'], ['Reconnaissance', .64, '#8b52f7'], ['DoS/DDoS', .41, '#198dff'], ['Others', .26, '#16c8c1']].map(([name, value, color]) => ({ name, value, color }));
const emptyProfile = { username: '', password: '', fullName: '', birthDate: '', jobTitle: '', department: '', phone: '', portrait: '' };
const shortDate = d => d ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short' }).format(d) : '';
const kpiMetricKeys = ['events', 'alerts', 'blockedAlerts', 'protectedSystems', 'activeSolutions'];
const severityMetricKeys = ['severityHigh', 'severityMedium', 'severityLow'];
const severityLabels = ['Cao', 'Trung bình', 'Thấp'];
const metricKeys = [...kpiMetricKeys, ...severityMetricKeys];
const metricErrorLabel = type => ({ connection: 'MẤT KẾT NỐI QRADAR', backend: 'MẤT KẾT NỐI BE', aql: 'AQL LỖI', auth: 'SAI TOKEN/QUYỀN', api: 'LỖI API', search: 'QRADAR SEARCH LỖI', configuration: 'CHƯA CẤU HÌNH', unknown: 'QRADAR LỖI' })[type] || 'QRADAR LỖI';
const formatPercent = value => value === null || !Number.isFinite(value) ? '—' : value > 0 && value < 0.01 ? '<0,01%' : `${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
const rowFields = row => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value]));
const geoName = value => {
  if (value && typeof value === 'object') return value.names?.en || value.name || value.name_en || Object.values(value.names || {})[0] || 'Không xác định';
  if (typeof value !== 'string' || !value) return 'Không xác định';
  try { return geoName(JSON.parse(value)) } catch { return value }
};
const countryFlag = code => typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(char => char.charCodeAt(0) + 127397)) : '🌐';
const attackColor = type => ({ 'Brute Force': '#f13e59', 'Web Attack': '#ff853b', Malware: '#ffc33f', Reconnaissance: '#8b52f7', 'DoS/DDoS': '#198dff' })[type] || '#16c8c1';
const geoCoordinate = value => value == null || String(value).trim() === '' ? Number.NaN : Number(value);
const flowTime = value => { const numeric = Number(value); const date = new Date(Number.isFinite(numeric) && numeric < 1e12 ? numeric * 1000 : value); return Number.isNaN(date.getTime()) ? String(value || '—') : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
const flowStatus = fields => {
  const direct = fields.status || fields.action || fields.outcome || fields.event_action;
  const value = String(direct || fields.event_payload || fields.payload || '');
  const match = value.match(/\b(block(?:ed)?|drop(?:ped)?|deny|denied|pass(?:ed)?|allow(?:ed)?|accept(?:ed)?|reject(?:ed)?)\b/i);
  const status = String(direct || match?.[0] || '').toLowerCase();
  if (/^(block|blocked)$/.test(status)) return 'Blocked';
  if (/^(drop|dropped)$/.test(status)) return 'Drop';
  if (/^(deny|denied)$/.test(status)) return 'Deny';
  if (/^(pass|passed)$/.test(status)) return 'Pass';
  if (/^(allow|allowed)$/.test(status)) return 'Allow';
  if (/^(accept|accepted)$/.test(status)) return 'Accept';
  if (/^(reject|rejected)$/.test(status)) return 'Reject';
  return 'Không rõ';
};
function LoadingNumber({ target }) { const limit = Number(String(target).replaceAll(',', '')) || 1000; const [value, setValue] = useState(0); useEffect(() => { const id = setInterval(() => setValue(Math.floor(Math.random() * Math.max(30, limit * 1.2))), 170); return () => clearInterval(id) }, [limit]); return value.toLocaleString('en-US') }
function newQueryGroup() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` }
function cancelDashboardQuery(groupId) { fetch(`/api/dashboard/queries/${encodeURIComponent(groupId)}`, { method: 'DELETE', keepalive: true }).catch(() => {}) }
function loadDashboard(url, signal, groupId) { return fetch(url, { signal, headers: { 'X-Dashboard-Query-Group': groupId } }).then(r => r.ok ? r.json() : null) }
function makePortrait(file) { return new Promise((resolve, reject) => { const url = URL.createObjectURL(file), image = new Image(); image.onload = () => { const ratio = 2 / 3, sourceRatio = image.width / image.height; let sx = 0, sy = 0, sw = image.width, sh = image.height; if (sourceRatio > ratio) { sw = image.height * ratio; sx = (image.width - sw) / 2 } else { sh = image.width / ratio; sy = Math.max(0, (image.height - sh) * .1) } const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 720; canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, 480, 720); URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', .82)) }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')) }; image.src = url }) }
function PortraitFrame({ src, name = 'Ảnh chân dung', className = '' }) { return <div className={`portrait-frame ${className}`}>{src ? <img src={src} alt={name} /> : <div className="portrait-empty"><UserRound size={30} /><span>Chưa có ảnh</span></div>}</div> }
function PortraitPicker({ src, onSelect }) { return <div className="portrait-picker"><PortraitFrame src={src} /><label className="portrait-pick-btn"><ImagePlus size={14} />{src ? 'Đổi ảnh chân dung' : 'Tải ảnh chân dung'}<input type="file" accept="image/*" onChange={async e => { const file = e.target.files?.[0]; if (file) try { onSelect(await makePortrait(file)) } catch { } }} /></label><small>Ảnh được căn về khung dọc 4:6.</small></div> }
function Panel({ title, children, className = '', extra }) { return <section className={`panel ${className}`}><header className="panel-head"><h2>{title}</h2>{extra}</header>{children}</section> }
class MapErrorBoundary extends React.Component { constructor(props) { super(props); this.state = { error: null } } static getDerivedStateFromError(error) { return { error } } componentDidCatch(error, info) { console.error('SOC map render failed:', error, info.componentStack) } render() { if (this.state.error) return this.props.fallback !== undefined ? this.props.fallback : <div className="map-error" role="status"><strong>Bản đồ tạm thời không khả dụng</strong><span>{this.state.error.message || 'Lỗi khi hiển thị luồng tấn công.'}</span><button onClick={() => this.setState({ error: null })}>Thử lại</button></div>; return this.props.children } }
function Modal({ title, onClose, children, className = '' }) { return <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className={`modal-card ${className}`}><header><h2>{title}</h2><button className="bare-icon" onClick={onClose} aria-label="Đóng"><X size={18} /></button></header>{children}</section></div> }
function Auth({ onLogin, onRegister }) {
  const [register, setRegister] = useState(false), [form, setForm] = useState(emptyProfile), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const put = (key, value) => { setForm(v => ({ ...v, [key]: value })); setError('') };
  async function submit(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      if (register) await onRegister(form);
      else await onLogin(form);
    } catch (requestError) {
      setError(requestError.message || 'Không thể kết nối máy chủ tài khoản.');
    } finally { setBusy(false) }
  }
  return <main className="auth-screen"><div className="auth-card"><div className="auth-logo"><span className="brand-mark"><Shield size={25} /></span><div><b>SOC <i>MONITORING</i></b><small>DETECT · ANALYZE · RESPOND</small></div></div><h1>{register ? 'Tạo tài khoản' : 'Đăng nhập'}</h1><p>{register ? 'Điền thông tin để tạo hồ sơ SOC Analyst.' : 'Đăng nhập để tiếp tục vào hệ thống giám sát.'}</p><form onSubmit={submit}>{register && <><label>Họ và tên<input autoComplete="name" value={form.fullName} onChange={e => put('fullName', e.target.value)} required /></label><div className="form-pair"><label>Ngày sinh<input type="date" value={form.birthDate} onChange={e => put('birthDate', e.target.value)} required /></label><label>Số điện thoại<input type="tel" value={form.phone} onChange={e => put('phone', e.target.value)} required /></label></div><label>Chức vụ<input value={form.jobTitle} onChange={e => put('jobTitle', e.target.value)} required /></label><label>Bộ phận công tác<input value={form.department} onChange={e => put('department', e.target.value)} required /></label><PortraitPicker src={form.portrait} onSelect={portrait => setForm(v => ({ ...v, portrait }))} /></>}<label>Tên đăng nhập<input autoComplete="username" value={form.username} onChange={e => put('username', e.target.value)} required /></label><label>Mật khẩu<input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={e => put('password', e.target.value)} required minLength={register ? 6 : undefined} /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button className="primary-btn" type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'}</button></form><button className="auth-switch" type="button" disabled={busy} onClick={() => { setRegister(v => !v); setError('') }}>{register ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}</button><small className="local-note">Tài khoản được lưu ở máy chủ nội bộ.</small></div></main>
}
function App() {
  const mapRef = useRef(null);
  const liveRangeRef = useRef(null);
  const [profile, setProfile] = useState(null); const [loggedIn, setLoggedIn] = useState(false); const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('soc-auth-token') || ''); const [authLoading, setAuthLoading] = useState(() => Boolean(sessionStorage.getItem('soc-auth-token'))); const [accountSaveError, setAccountSaveError] = useState(''); const [theme, setTheme] = useState(() => localStorage.getItem('soc-theme') === 'light' ? 'light' : 'dark'); const [active, setActive] = useState('Tổng quan'), [mode, setMode] = useState('global'), [dataMode, setDataMode] = useState('demo'), [apiData, setApiData] = useState(null), [loadingKeys, setLoadingKeys] = useState([]), [clock, setClock] = useState(new Date()); const [period, setPeriod] = useState('24h'), [openFilter, setOpenFilter] = useState(null), [custom, setCustom] = useState({ start: '', end: '' }), [customRange, setCustomRange] = useState(null); const [accountMenu, setAccountMenu] = useState(false), [modal, setModal] = useState(null), [edit, setEdit] = useState(false), [draft, setDraft] = useState(null), [metric, setMetric] = useState(null), [hoverAlert, setHoverAlert] = useState(null);
  useEffect(() => { localStorage.setItem('soc-theme', theme) }, [theme]);
  useEffect(() => {
    if (!authToken) { setAuthLoading(false); return }
    let current = true;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Phiên đăng nhập đã hết hạn.')))
      .then(user => { if (current) { setProfile(user); setLoggedIn(true); setAuthLoading(false) } })
      .catch(() => { if (current) { sessionStorage.removeItem('soc-auth-token'); setAuthToken(''); setProfile(null); setLoggedIn(false); setAuthLoading(false) } });
    return () => { current = false };
  }, [authToken]);
  const [liveSeries, setLiveSeries] = useState(null), [seriesLoading, setSeriesLoading] = useState(false), [seriesError, setSeriesError] = useState('');
  const [liveSolutions, setLiveSolutions] = useState(null), [solutionsLoading, setSolutionsLoading] = useState(false), [solutionsError, setSolutionsError] = useState('');
  const [liveSources, setLiveSources] = useState(null), [sourcesLoading, setSourcesLoading] = useState(false), [sourcesError, setSourcesError] = useState('');
  const [liveAttackTypes, setLiveAttackTypes] = useState(null), [liveGeography, setLiveGeography] = useState(null), [liveVietnamGeo, setLiveVietnamGeo] = useState(null), [liveRecentFlows, setLiveRecentFlows] = useState(null);
  const [vietnamGeoLoading, setVietnamGeoLoading] = useState(false), [vietnamGeoError, setVietnamGeoError] = useState('');
  const [liveExtrasLoading, setLiveExtrasLoading] = useState(false), [liveExtrasError, setLiveExtrasError] = useState('');
  const [allFlows, setAllFlows] = useState(null), [allFlowsLoading, setAllFlowsLoading] = useState(false), [allFlowsError, setAllFlowsError] = useState(''), [flowPage, setFlowPage] = useState(0);
  const [donutProgress, setDonutProgress] = useState(0);
  useEffect(() => { const id = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(id) }, []);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const queryGroup = newQueryGroup();
    if (dataMode !== 'live') { setLoadingKeys([]); return () => { current = false } }
    const selectionKey = period === 'custom' && customRange ? `custom:${customRange.start.toISOString()}:${customRange.end.toISOString()}` : period;
    const to = period === 'custom' && customRange ? customRange.end : new Date();
    const from = period === 'custom' && customRange ? customRange.start : new Date(to.getTime() - (({ '1h': 1, '6h': 6, '12h': 12, '24h': 24 })[period] || 24) * 3600000);
    liveRangeRef.current = { key: selectionKey, from: from.toISOString(), to: to.toISOString() };
    const params = new URLSearchParams({ from: liveRangeRef.current.from, to: liveRangeRef.current.to });
    setApiData({ qradar: { connected: true, mode: 'connecting' }, kpis: metricKeys.map(key => ({ key, live: false })) });
    setLoadingKeys(metricKeys);
    metricKeys.forEach(key => {
      const query = new URLSearchParams(params); query.set('key', key);
      loadDashboard(`/api/dashboard/metric?${query.toString()}`, controller.signal, queryGroup).then(result => result || ({ key, live: false, errorType: 'api', error: 'API dashboard không trả dữ liệu.' }))
        .catch(error => ({ key, live: false, errorType: 'backend', error: error.message || 'Không gọi được API dashboard.' }))
        .then(result => {
          if (!current) return;
          setApiData(previous => {
            const next = [...(previous?.kpis || [])];
            const index = next.findIndex(item => item.key === key);
            if (index >= 0) next[index] = { ...result, key }; else next.push({ ...result, key });
            const connected = next.some(item => item.live);
            const complete = metricKeys.every(metricKey => next.some(item => item.key === metricKey && (item.live || item.error)));
            return { kpis: next, qradar: { connected, mode: connected ? 'qradar' : complete ? 'error' : 'connecting', error: next.find(item => item.error)?.error } };
          });
          setLoadingKeys(previous => previous.filter(metricKey => metricKey !== key));
        });
    });
    return () => { current = false; cancelDashboardQuery(queryGroup); controller.abort() };
  }, [dataMode, period, customRange]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const queryGroup = newQueryGroup();
    if (dataMode !== 'live') { setLiveAttackTypes(null); setLiveGeography(null); setLiveVietnamGeo(null); setLiveRecentFlows(null); setLiveExtrasLoading(false); setLiveExtrasError(''); return () => { current = false } }
    const selectionKey = period === 'custom' && customRange ? `custom:${customRange.start.toISOString()}:${customRange.end.toISOString()}` : period;
    if (liveRangeRef.current?.key !== selectionKey) {
      const to = period === 'custom' && customRange ? customRange.end : new Date();
      const from = period === 'custom' && customRange ? customRange.start : new Date(to.getTime() - (({ '1h': 1, '6h': 6, '12h': 12, '24h': 24 })[period] || 24) * 3600000);
      liveRangeRef.current = { key: selectionKey, from: from.toISOString(), to: to.toISOString() };
    }
    const params = new URLSearchParams({ from: liveRangeRef.current.from, to: liveRangeRef.current.to });
    const load = path => fetch(`/api/dashboard/${path}?${params}`, { signal: controller.signal, headers: { 'X-Dashboard-Query-Group': queryGroup } }).then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)));
    setLiveExtrasLoading(true); setLiveExtrasError('');
    Promise.allSettled([load('attack-types'), load('geography'), load('flows/recent')]).then(results => {
      if (!current) return;
      const [types, countries, recent] = results.map(result => result.status === 'fulfilled' ? result.value : null);
      setLiveAttackTypes(types?.live ? types : null); setLiveGeography(countries?.live ? countries : null); setLiveRecentFlows(recent?.live ? recent : null);
      const failure = results.find(result => result.status === 'rejected')?.reason;
      const apiFailure = [types, countries, recent].find(result => result && !result.live)?.error;
      setLiveExtrasError(failure?.message || apiFailure || '');
    }).finally(() => { if (current) setLiveExtrasLoading(false) });
    return () => { current = false; cancelDashboardQuery(queryGroup); controller.abort() };
  }, [dataMode, period, customRange]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const queryGroup = newQueryGroup();
    if (modal !== 'vietnam-geo' || dataMode !== 'live') { setLiveVietnamGeo(null); setVietnamGeoLoading(false); setVietnamGeoError(''); return () => { current = false } }
    const selectionKey = period === 'custom' && customRange ? `custom:${customRange.start.toISOString()}:${customRange.end.toISOString()}` : period;
    const range = liveRangeRef.current?.key === selectionKey ? liveRangeRef.current : null;
    const to = range ? new Date(range.to) : period === 'custom' && customRange ? customRange.end : new Date();
    const from = range ? new Date(range.from) : period === 'custom' && customRange ? customRange.start : new Date(to.getTime() - (({ '1h': 1, '6h': 6, '12h': 12, '24h': 24 })[period] || 24) * 3600000);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    setVietnamGeoLoading(true); setVietnamGeoError('');
    fetch(`/api/dashboard/geography/vietnam?${params}`, { signal: controller.signal, headers: { 'X-Dashboard-Query-Group': queryGroup } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(result => { if (current) { setLiveVietnamGeo(result.live ? result : null); if (!result.live) setVietnamGeoError(result.error || 'Không tải được dữ liệu tỉnh/thành.') } })
      .catch(error => { if (current) { setLiveVietnamGeo(null); setVietnamGeoError(error.message || 'Không gọi được API địa lý Việt Nam.') } })
      .finally(() => { if (current) setVietnamGeoLoading(false) });
    return () => { current = false; cancelDashboardQuery(queryGroup); controller.abort() };
  }, [dataMode, period, customRange, modal]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const queryGroup = newQueryGroup();
    if (modal !== 'all-flows' || dataMode !== 'live') { setAllFlows(null); setAllFlowsLoading(false); setAllFlowsError(''); return () => { current = false } }
    const selectionKey = period === 'custom' && customRange ? `custom:${customRange.start.toISOString()}:${customRange.end.toISOString()}` : period;
    if (liveRangeRef.current?.key !== selectionKey) {
      const to = period === 'custom' && customRange ? customRange.end : new Date();
      const from = period === 'custom' && customRange ? customRange.start : new Date(to.getTime() - (({ '1h': 1, '6h': 6, '12h': 12, '24h': 24 })[period] || 24) * 3600000);
      liveRangeRef.current = { key: selectionKey, from: from.toISOString(), to: to.toISOString() };
    }
    const params = new URLSearchParams({ from: liveRangeRef.current.from, to: liveRangeRef.current.to, page: String(flowPage), pageSize: '30' });
    setAllFlowsLoading(true); setAllFlowsError('');
    fetch(`/api/dashboard/flows?${params}`, { signal: controller.signal, headers: { 'X-Dashboard-Query-Group': queryGroup } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(result => { if (!current) return; if (result.live) setAllFlows(result); else { setAllFlows(null); setAllFlowsError(result.error || 'Không tải được danh sách luồng.') } })
      .catch(error => { if (current) { setAllFlows(null); setAllFlowsError(error.message || 'Không gọi được API luồng tấn công.') } })
      .finally(() => { if (current) setAllFlowsLoading(false) });
    return () => { current = false; cancelDashboardQuery(queryGroup); controller.abort() };
  }, [dataMode, period, customRange, modal, flowPage]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const queryGroup = newQueryGroup();
    if (dataMode !== 'live') { setLiveSeries(null); setSeriesLoading(false); setSeriesError(''); return () => { current = false } }
    const selectionKey = period === 'custom' && customRange ? `custom:${customRange.start.toISOString()}:${customRange.end.toISOString()}` : period;
    const range = liveRangeRef.current?.key === selectionKey ? liveRangeRef.current : null;
    const to = range ? new Date(range.to) : period === 'custom' && customRange ? customRange.end : new Date();
    const from = range ? new Date(range.from) : period === 'custom' && customRange ? customRange.start : new Date(to.getTime() - (({ '1h': 1, '6h': 6, '12h': 12, '24h': 24 })[period] || 24) * 3600000);
    const hours = (to - from) / 3600000;
    const bucketMinutes = hours <= 1 ? 5 : hours <= 6 ? 15 : hours <= 24 ? 60 : 240;
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), bucketMinutes: String(bucketMinutes) });
    setSeriesLoading(true); setSeriesError('');
    setLiveSeries(null);
    fetch(`/api/dashboard/timeseries?${params}`, { signal: controller.signal, headers: { 'X-Dashboard-Query-Group': queryGroup } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(result => { if (!current) return; if (result.live) setLiveSeries(result); else { setLiveSeries(null); setSeriesError(result.error || 'Không lấy được dữ liệu biểu đồ.') } })
      .catch(error => { if (current) { setLiveSeries(null); setSeriesError(error.message || 'Không gọi được API biểu đồ.') } })
      .finally(() => { if (current) setSeriesLoading(false) });
    return () => { current = false; cancelDashboardQuery(queryGroup); controller.abort() };
  }, [dataMode, period, customRange]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const queryGroup = newQueryGroup();
    if (dataMode !== 'live') { setLiveSolutions(null); setSolutionsLoading(false); setSolutionsError(''); return () => { current = false } }
    const selectionKey = period === 'custom' && customRange ? `custom:${customRange.start.toISOString()}:${customRange.end.toISOString()}` : period;
    if (liveRangeRef.current?.key !== selectionKey) {
      const to = period === 'custom' && customRange ? customRange.end : new Date();
      const from = period === 'custom' && customRange ? customRange.start : new Date(to.getTime() - (({ '1h': 1, '6h': 6, '12h': 12, '24h': 24 })[period] || 24) * 3600000);
      liveRangeRef.current = { key: selectionKey, from: from.toISOString(), to: to.toISOString() };
    }
    const params = new URLSearchParams({ from: liveRangeRef.current.from, to: liveRangeRef.current.to });
    setSolutionsLoading(true); setSolutionsError('');
    fetch(`/api/dashboard/solutions?${params}`, { signal: controller.signal, headers: { 'X-Dashboard-Query-Group': queryGroup } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(result => { if (!current) return; if (result.live) setLiveSolutions(result); else { setLiveSolutions(null); setSolutionsError(result.error || 'Không lấy được dữ liệu giải pháp.') } })
      .catch(error => { if (current) { setLiveSolutions(null); setSolutionsError(error.message || 'Không gọi được API giải pháp.') } })
      .finally(() => { if (current) setSolutionsLoading(false) });
    return () => { current = false; cancelDashboardQuery(queryGroup); controller.abort() };
  }, [dataMode, period, customRange]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const queryGroup = newQueryGroup();
    if (dataMode !== 'live') { setLiveSources(null); setSourcesLoading(false); setSourcesError(''); return () => { current = false } }
    const selectionKey = period === 'custom' && customRange ? `custom:${customRange.start.toISOString()}:${customRange.end.toISOString()}` : period;
    if (liveRangeRef.current?.key !== selectionKey) {
      const to = period === 'custom' && customRange ? customRange.end : new Date();
      const from = period === 'custom' && customRange ? customRange.start : new Date(to.getTime() - (({ '1h': 1, '6h': 6, '12h': 12, '24h': 24 })[period] || 24) * 3600000);
      liveRangeRef.current = { key: selectionKey, from: from.toISOString(), to: to.toISOString() };
    }
    const params = new URLSearchParams({ from: liveRangeRef.current.from, to: liveRangeRef.current.to });
    setSourcesLoading(true); setSourcesError('');
    fetch(`/api/dashboard/sources?${params}`, { signal: controller.signal, headers: { 'X-Dashboard-Query-Group': queryGroup } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(result => { if (!current) return; if (result.live) setLiveSources(result); else { setLiveSources(null); setSourcesError(result.error || 'Không lấy được top nguồn tấn công.') } })
      .catch(error => { if (current) { setLiveSources(null); setSourcesError(error.message || 'Không gọi được API top nguồn tấn công.') } })
      .finally(() => { if (current) setSourcesLoading(false) });
    return () => { current = false; cancelDashboardQuery(queryGroup); controller.abort() };
  }, [dataMode, period, customRange]);
  async function authRequest(path, body, token, method = 'POST') {
    const response = await fetch(path, { method: body ? method : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.message || (response.status === 409 ? 'Tên đăng nhập đã tồn tại.' : response.status === 401 ? 'Tên đăng nhập hoặc mật khẩu không chính xác.' : `Máy chủ tài khoản trả lỗi HTTP ${response.status}.`);
      throw Object.assign(new Error(message), { status: response.status });
    }
    return result;
  }
  function activateSession(session) {
    sessionStorage.setItem('soc-auth-token', session.token);
    sessionStorage.removeItem('soc-auth');
    localStorage.removeItem('soc-profile');
    setAuthToken(session.token); setProfile(session.user); setLoggedIn(true); setAuthLoading(false);
  }
  async function enter(user) { activateSession(await authRequest('/api/auth/register', user)) }
  async function login(user) {
    let session;
    try { session = await authRequest('/api/auth/login', user) }
    catch (loginError) {
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem('soc-profile') || 'null') } catch { }
      if (!legacy || legacy.username !== user.username || legacy.password !== user.password) throw loginError;
      try { session = await authRequest('/api/auth/register', legacy) }
      catch (migrationError) {
        if (migrationError.status !== 409) throw migrationError;
        session = await authRequest('/api/auth/login', user);
      }
    }
    activateSession(session);
  }
  function signOut() {
    if (authToken) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }).catch(() => {});
    sessionStorage.removeItem('soc-auth-token'); sessionStorage.removeItem('soc-auth');
    setAuthToken(''); setProfile(null); setLoggedIn(false); setAccountMenu(false);
  }
  function selectPeriod(value) { if (value === 'custom') { setOpenFilter('header-custom'); return } setPeriod(value); setCustomRange(null); setOpenFilter(null) }
  function applyCustom() { if (!custom.start || !custom.end) return; const range = { start: new Date(custom.start), end: new Date(custom.end) }; if (!(range.start < range.end)) return; setPeriod('custom'); setCustomRange(range); setOpenFilter(null) }
  function periodLabel(value, range) { if (value === 'custom' && range) return `${shortDate(range.start)} ${range.start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} — ${shortDate(range.end)} ${range.end.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`; return ({ '24h': '24 giờ qua', '12h': '12 giờ qua', '6h': '6 giờ qua', '1h': '1 giờ qua' })[value] }
  const qradarLive = dataMode === 'live' && apiData?.qradar?.connected === true && apiData?.qradar?.mode === 'qradar';
  const liveMetricCount = dataMode === 'live' ? (apiData?.kpis?.filter(item => kpiMetricKeys.includes(item.key) && item.live).length || 0) : 0;
  const failedMetrics = apiData?.kpis?.filter(item => item.error) || [];
  const failedKpiMetrics = failedMetrics.filter(item => kpiMetricKeys.includes(item.key));
  const qradarError = dataMode === 'live' && loadingKeys.length === 0 && liveMetricCount === 0 && failedKpiMetrics.length > 0;
  const qradarStatus = qradarError ? (failedKpiMetrics.every(item => item.errorType === 'connection') ? 'MẤT KẾT NỐI QRADAR' : failedKpiMetrics.every(item => item.errorType === 'backend') ? 'MẤT KẾT NỐI BACKEND' : failedKpiMetrics.every(item => item.errorType === 'aql') ? 'LỖI TRUY VẤN AQL' : failedKpiMetrics.every(item => item.errorType === 'configuration') ? 'CHƯA CẤU HÌNH QRADAR' : failedKpiMetrics.every(item => item.errorType === 'auth') ? 'LỖI TOKEN / QUYỀN API' : 'QRADAR/API LỖI') : '';
  const qradarErrorTitle = failedMetrics.map(item => `${item.key}: ${item.error}`).join('\n');
  const severityMetricData = severityMetricKeys.map(key => apiData?.kpis?.find(item => item.key === key));
  const alertTotalMetric = apiData?.kpis?.find(item => item.key === 'alerts');
  const eventTotalMetric = apiData?.kpis?.find(item => item.key === 'events');
  const severityReady = dataMode === 'demo' || (alertTotalMetric?.live === true && severityMetricData.every(item => item?.live === true));
  const severityFailed = Boolean(alertTotalMetric?.error) || severityMetricData.some(item => item?.error);
  const totalAlerts = dataMode === 'demo' ? demoTotalAlerts : severityReady ? Number(alertTotalMetric.value || 0) : null;
  const alertCounts = alertTypes.map((row, index) => dataMode === 'demo' ? Number(row[2]) : Number(severityMetricData[index]?.value || 0));
  const alertPercentages = totalAlerts ? alertCounts.map(count => count / totalAlerts * 100) : alertCounts.map(() => 0);
  const displayedAlertTypes = alertTypes.map((row, index) => [severityLabels[index], totalAlerts === null ? null : alertPercentages[index], alertCounts[index], row[3]]);
  const donutAnimationKey = displayedAlertTypes.map(row => `${row[1]}:${row[2]}`).join('|');
  useEffect(() => { setDonutProgress(0); const frame = requestAnimationFrame(() => setDonutProgress(1)); return () => cancelAnimationFrame(frame) }, [donutAnimationKey]);
  const demoChartData = useMemo(() => { if (period === '1h') return samples.slice(-2); if (period === '6h') return samples.slice(-6); if (period === '12h') return samples.slice(-12); if (period === 'custom' && customRange) return samples.slice(-Math.max(2, Math.min(24, Math.ceil((customRange.end - customRange.start) / 3600000)))); return samples }, [period, customRange]);
  const liveChartData = useMemo(() => {
    if (!liveSeries) return [];
    const step = Number(liveSeries.bucketMinutes) * 60000;
    const from = Date.parse(liveSeries.from);
    const to = Date.parse(liveSeries.to);
    if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
    const firstBucket = Math.floor(from / step);
    const lastBucket = Math.ceil(to / step);
    // QRadar's numeric starttime buckets are returned in the local wall-clock
    // basis, while `from` and `to` are ISO UTC timestamps. Align the bucket id
    // with the browser's local timezone before comparing it to the UTC range.
    const localOffsetBuckets = (-new Date(from).getTimezoneOffset() * 60000) / step;
    const readField = (row, names) => Object.entries(row || {}).find(([key]) => names.includes(key.toLowerCase()))?.[1];
    const values = new Map();
    for (const row of liveSeries.rows || []) {
      const fields = Object.entries(row || {});
      const bucketValue = readField(row, ['bucket']) ?? fields.find(([key]) => /starttime|long\(/i.test(key))?.[1] ?? fields[0]?.[1];
      const eventValue = readField(row, ['events', 'count', 'count(*)', 'eventcount', 'sum(eventcount)']) ?? fields.find(([key]) => !/bucket|starttime|long\(/i.test(key) && Number.isFinite(Number(row[key])))?.[1];
      const rawBucket = Number(bucketValue);
      const rawEvents = Number(eventValue ?? 0);
      if (!Number.isFinite(rawBucket)) continue;
      const candidates = [rawBucket, rawBucket / step, rawBucket * 1000 / step]
        .map(value => Math.floor(value + localOffsetBuckets))
        .filter(value => value >= firstBucket && value < lastBucket);
      if (candidates.length) {
        const bucket = candidates[0];
        values.set(bucket, (values.get(bucket) || 0) + (Number.isFinite(rawEvents) ? rawEvents : 0));
      }
    }
    const longRange = to - from > 24 * 60 * 60 * 1000;
    const points = [];
    for (let bucket = firstBucket; bucket < lastBucket; bucket += 1) {
      const time = bucket * step;
      const date = new Date(time);
      points.push({
        time: longRange
          ? date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        events: values.get(bucket) ?? 0,
      });
    }
    return points;
  }, [liveSeries]);
  const chartData = dataMode === 'live' ? liveChartData : demoChartData;
  const periodScale = period === '24h' ? 1 : period === '12h' ? 0.5 : period === '6h' ? 0.25 : period === '1h' ? 0.05 : customRange ? Math.max(0.01, (customRange.end - customRange.start) / 86400000) : 1;
  const scaleValue = value => String(value).split(' / ').map(part => { const n = Number(part.replaceAll(',', '')); return Number.isFinite(n) ? Math.max(1, Math.round(n * periodScale)).toLocaleString('en-US') : part }).join(' / ');
  const displayKpiValue = (value, isLive) => { if (!isLive) return scaleValue(value); return String(value).split(' / ').map(part => { const n = Number(part.replaceAll(',', '')); return Number.isFinite(n) ? n.toLocaleString('en-US') : part }).join(' / ') };
  const liveAttackBars = (liveAttackTypes?.rows || []).map(row => { const fields = rowFields(row); return { name: fields.attack_type || fields.categoryname || 'Khác', value: Number(fields.events || 0), color: attackColor(fields.attack_type || fields.categoryname) } });
  const barData = dataMode === 'live' ? liveAttackBars : attackBars.map(row => ({ ...row, value: Number((row.value * periodScale).toFixed(2)) }));
  const displayedSolutions = dataMode === 'live' ? (liveSolutions?.rows || []).map((row, index) => { const fields = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value])); const count = Number(fields.alerts || 0); return [fields.solution || 'Nguồn log không xác định', totalAlerts ? count / totalAlerts * 100 : 0, count, solutions[index % solutions.length][3]] }) : solutions;
  const displayedSources = dataMode === 'live' ? (liveSources?.rows || []).slice(0, 10).map((row, index) => { const fields = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value])); const count = Number(fields.alerts || 0); const percentage = totalAlerts ? count / totalAlerts * 100 : 0; return ['🌐', fields.source_ip || fields.sourceip || 'Không rõ IP', count, `${percentage.toFixed(2)}%`, ['#f54762', '#ff883d', '#ffc63e', '#19c9d6', '#9eabc1'][index % 5]] }) : sources;
  const liveFlowRows = (liveRecentFlows?.rows || []).map(row => { const fields = rowFields(row); return { time: flowTime(fields.starttime), src: fields.source_ip || fields.sourceip || '—', dst: fields.destination_ip || fields.destinationip || '—', type: fields.attack_type || 'Sự kiện', color: attackColor(fields.attack_type), severity: fields.severity, status: flowStatus(fields), from: [geoCoordinate(fields.source_latitude), geoCoordinate(fields.source_longitude)], to: [geoCoordinate(fields.destination_latitude), geoCoordinate(fields.destination_longitude)] } });
  const displayRecentFlows = dataMode === 'live' ? liveFlowRows : attacks.slice(0, period === '1h' ? 1 : period === '6h' ? 2 : period === 'custom' ? Math.max(1, Math.min(attacks.length, Math.ceil((customRange?.end - customRange?.start || 86400000) / 86400000 * attacks.length))) : attacks.length).map(row => ({ ...row, severity: 8 }));
  const displayAttacks = (dataMode === 'live' ? liveFlowRows.filter(row => row.from.every(Number.isFinite) && row.to.every(Number.isFinite)).map(row => ({ ...row, dst: `${row.dst} • ${row.dst}`, type: row.type })) : displayRecentFlows).slice(0, 50);
  const countryRows = (liveGeography?.rows || []).map(row => { const fields = rowFields(row); return { name: fields.country || 'Không xác định', code: fields.country_code, events: Number(fields.events || 0) } });
  const countryTotal = countryRows.reduce((sum, row) => sum + row.events, 0);
  const displayedCountries = countryRows.slice(0, 8).map((row, index) => ({ ...row, pct: countryTotal ? row.events / countryTotal * 100 : 0, color: ['#1689ff', '#8958f6', '#13c7c1', '#9258f5', '#ff913e', '#f54862', '#35a1ff', '#7a92ad'][index] }));
  const provinceRows = (liveVietnamGeo?.rows || []).map(row => { const fields = rowFields(row); return { name: geoName(fields.subdivisions || fields.province || fields.location), events: Number(fields.events || 0) } });
  const provinceTotal = provinceRows.reduce((sum, row) => sum + row.events, 0);
  const displayedProvinces = provinceRows.slice(0, 34).map((row, index) => ({ ...row, pct: provinceTotal ? row.events / provinceTotal * 100 : 0, color: ['#1689ff', '#8958f6', '#13c7c1', '#9258f5', '#ff913e', '#f54862', '#35a1ff', '#7a92ad'][index % 8] }));
  const flowModalRows = dataMode === 'live' ? (allFlows?.rows || []).map(row => { const fields = rowFields(row); return { time: flowTime(fields.starttime), src: fields.source_ip || fields.sourceip || '—', dst: fields.destination_ip || fields.destinationip || '—', type: fields.attack_type || 'Sự kiện', severity: fields.severity, status: flowStatus(fields), color: attackColor(fields.attack_type) } }) : attacks.map(row => ({ time: row.time, src: row.src, dst: row.dst.split(' • ').at(-1), type: row.type, severity: 8, status: 'Blocked', color: attackColor(row.type) }));
  const flowTotalPages = dataMode === 'live' ? Number(allFlows?.totalPages || 0) : 1;
  const nowText = clock.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  if (!loggedIn) return authLoading ? <main className="auth-screen auth-loading"><div>Đang kiểm tra phiên đăng nhập…</div></main> : <Auth onLogin={login} onRegister={enter} />;
  const initial = profile?.fullName?.split(/\s+/).map(x => x[0]).slice(-2).join('').toUpperCase() || profile?.username?.slice(0, 2).toUpperCase() || 'SOC';
  const formField = (key, label, type = 'text') => <label key={key}>{label}<input type={type} value={draft?.[key] || ''} onChange={e => setDraft(v => ({ ...v, [key]: e.target.value }))} /></label>;
  return <main className={`app-shell theme-${theme}`}>
    <div className="main-content"><header className="topbar"><div className="header-ident"><div className="brand"><div className="brand-mark"><Shield size={22} /></div><div><b>SOC <i>MONITORING</i></b><small>DETECT · ANALYZE · RESPOND</small></div></div><div className="page-heading"><span>SECURITY OPERATIONS CENTER</span><h1>{active === 'Tổng quan' ? 'Dashboard' : active}{active !== 'Tổng quan' && <small>SOC Monitoring</small>}</h1></div></div><div className="top-actions"><div className="filter-wrap"><button className="range-btn" onClick={() => setOpenFilter(openFilter === 'header' ? null : 'header')}><CalendarDays size={14} />{periodLabel(period, customRange)}{period === 'custom' && customRange && <span className="range-date">{customRange.start.toLocaleDateString('vi-VN')} — {customRange.end.toLocaleDateString('vi-VN')}</span>}<ChevronDown size={14} /></button>{openFilter === 'header' && <div className="filter-menu">{[['24h', '24 giờ qua'], ['12h', '12 giờ qua'], ['6h', '6 giờ qua'], ['1h', '1 giờ qua']].map(([v, l]) => <button key={v} onClick={() => selectPeriod(v)}>{l}{period === v && <Check size={13} />}</button>)}<button onClick={() => selectPeriod('custom')}>Tùy chỉnh ngày<CalendarDays size={13} /></button></div>}{openFilter === 'header-custom' && <div className="custom-menu"><label>Từ ngày và giờ<input type="datetime-local" value={custom.start} onChange={e => setCustom(v => ({ ...v, start: e.target.value }))} /></label><label>Đến ngày và giờ<input type="datetime-local" value={custom.end} onChange={e => setCustom(v => ({ ...v, end: e.target.value }))} /></label><button className="primary-btn" onClick={applyCustom}>Áp dụng</button></div>}</div><span className="server-time"><Clock3 size={14} /><b>{nowText}</b><small>UTC+7</small></span><div className="data-mode-switch" role="group" aria-label="Chế độ dữ liệu"><button className={dataMode === 'demo' ? 'selected' : ''} onClick={() => setDataMode('demo')}>Demo</button><button className={dataMode === 'live' ? 'selected live-selected' : ''} onClick={() => setDataMode('live')}>Live</button></div><button className={`theme-toggle ${theme}`} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} role="switch" aria-checked={theme === 'dark'}><span className="theme-switch-track" aria-hidden="true"><span className="theme-switch-icon sun"><Sun size={13} /></span><span className="theme-switch-icon moon"><Moon size={13} /></span><span className="theme-switch-thumb">{theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}</span></span></button>{dataMode === 'live' && <span className={`live-pill ${qradarError ? 'is-error' : failedMetrics.length ? 'has-errors' : ''}`} title={qradarError || failedMetrics.length ? qradarErrorTitle : 'Dữ liệu lấy trực tiếp từ QRadar theo khoảng thời gian đã chọn.'}><i className="live-dot" />{qradarError ? qradarStatus : qradarLive ? 'LIVE' : 'ĐANG TẢI'}</span>}<button className="icon-button" title="Làm mới trang" aria-label="Làm mới trang" onClick={() => window.location.reload()}><RefreshCw size={16} /></button><div className="account-wrap"><button className="account-button" onClick={() => setAccountMenu(v => !v)}>{profile?.portrait ? <img className="top-avatar-photo" src={profile.portrait} alt={profile.fullName || profile.username} /> : <span className="top-avatar">{initial}</span>}<span className="analyst">{profile?.fullName || profile?.username || 'SOC Analyst'}</span><ChevronDown size={14} /></button>{accountMenu && <div className="account-menu"><button onClick={() => { setDraft({ ...emptyProfile, ...profile }); setEdit(false); setModal('account'); setAccountMenu(false) }}><UserRound size={14} /> Thông tin tài khoản</button><button onClick={signOut}><LogOut size={14} /> Đăng xuất</button></div>}</div></div></header>
      {active !== 'Tổng quan' ? <section className="construction-screen"><div><span className="construction-icon"><Clock3 size={23} /></span><h2>Đang thi công...</h2><p>Vui lòng quay lại sau.</p><button className="primary-btn" onClick={() => setActive('Tổng quan')}>Quay lại tổng quan</button></div></section> : <div className="content"><section className="kpi-grid">{kpis.map((k, i) => { const metricData = apiData?.kpis?.find(item => item.key === k.key); const pending = dataMode === 'live' && loadingKeys.includes(k.key); const live = dataMode === 'live' && metricData?.live === true; const value = dataMode === 'demo' ? k.value : pending ? 'Đang truy vấn' : live ? metricData.value : '—'; const metricError = dataMode === 'live' && metricData?.error; const errorType = metricData?.errorType; return <article className={`kpi-card ${k.tone}`} key={`${period}-${i}`}><div className="kpi-top"><span className="kpi-icon">{k.icon}</span><span className="kpi-label">{k.label}</span><small className={`source-chip ${live ? 'is-live' : metricError ? 'is-error' : ''}`} title={metricError || ''}>{live ? 'QRADAR LIVE' : pending ? 'ĐANG TRUY VẤN' : metricError ? metricErrorLabel(errorType) : 'DEMO'}</small><button className="kpi-more" title={`Chi tiết ${k.label}`} onClick={() => setMetric({ ...k, value, isLive: live, error: metricError, errorType })}>···</button></div><b className="kpi-value">{pending ? <LoadingNumber target={k.value} /> : dataMode === 'demo' ? value : live ? displayKpiValue(value, true) : value}</b><div className="kpi-foot"><span className="up"><ArrowUpRight size={13} />{k.change}</span><small>{periodLabel(period, customRange)}</small></div></article> })}</section>
        <div className="dashboard-grid"><div className="left-stack"><Panel title="Phân loại mức độ cảnh báo" className="alert-panel"><div className="donut-area"><div className="donut"><svg className="donut-svg" viewBox="0 0 120 120" aria-label="Phân loại event theo mức độ cảnh báo">{displayedAlertTypes.map(([name, pct, count, color], index) => { const length = 301.59 * (pct ?? 0) / 100, offset = -301.59 * displayedAlertTypes.slice(0, index).reduce((sum, row) => sum + (row[1] ?? 0), 0) / 100; return <circle key={name} cx="60" cy="60" r="48" fill="none" stroke={color} strokeWidth="17" style={{ strokeDasharray: `${length * donutProgress} 301.59`, transition: 'stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)', transitionDelay: `${index * 90}ms` }} strokeDashoffset={offset} transform="rotate(-90 60 60)" tabIndex="0" aria-label={`${name}: ${severityReady ? `${scaleValue(count)} trên ${scaleValue(totalAlerts)}` : severityFailed ? 'không có dữ liệu' : 'đang truy vấn'}`} onMouseEnter={() => setHoverAlert(index)} onMouseLeave={() => setHoverAlert(null)} onFocus={() => setHoverAlert(index)} onBlur={() => setHoverAlert(null)}><title>{`${name}: ${severityReady ? `${scaleValue(count)} / ${scaleValue(totalAlerts)} events (${formatPercent(pct)})` : severityFailed ? 'Truy vấn lỗi' : 'Đang truy vấn'}`}</title></circle> })}</svg>{hoverAlert !== null && <div className="donut-tooltip"><span>{displayedAlertTypes[hoverAlert][0]}</span><b>{severityReady ? scaleValue(displayedAlertTypes[hoverAlert][2]) : severityFailed ? 'Không tải được dữ liệu' : 'Đang truy vấn'} {severityReady && <small>/ {scaleValue(totalAlerts)} cảnh báo</small>}</b>{severityReady && <em>{formatPercent(displayedAlertTypes[hoverAlert][1])} tổng cảnh báo</em>}</div>}</div><div className="alert-legend">{displayedAlertTypes.map(([name, pct, count, color]) => <div className="legend-row" key={name}><i style={{ background: color }} title={severityReady ? `${count} cảnh báo` : severityFailed ? 'Lỗi truy vấn' : 'Đang truy vấn'} /><span>{name}</span><b>{formatPercent(pct)}</b></div>)}</div></div></Panel><Panel title="Top nguồn tấn công" extra={<span className="subtle">TOP 10</span>} className="sources-panel"><div className="table-head"><span>IP nguồn</span><span>Số lần tấn công</span><span>Tỷ lệ</span></div><div className="source-list">{dataMode === 'live' && !displayedSources.length ? <div className="source-empty">{sourcesLoading ? 'Đang truy vấn…' : sourcesError || 'Không có dữ liệu trong khoảng thời gian này.'}</div> : displayedSources.map(([flag, ip, count, pct, color]) => <div className="source-row" key={ip}><span className="ip"><i>{flag}</i>{ip}</span><b>{dataMode === 'live' ? Number(count).toLocaleString('en-US') : scaleValue(count)}</b><div className="share"><span><i style={{ width: pct, color, background: color }} /></span><small>{pct}</small></div></div>)}</div></Panel></div>
          <div className="center-stack"><Panel title="Bản đồ tấn công toàn cầu" className="map-panel" extra={<div className="segmented"><button className={mode === 'global' ? 'on' : ''} onClick={() => setMode('global')}>Toàn cầu</button><button className={mode === 'vietnam' ? 'on' : ''} onClick={() => setMode('vietnam')}>Việt Nam</button></div>}><MapErrorBoundary><AttackMap ref={mapRef} flights={displayAttacks} provinceTargets={dataMode === 'live' ? displayedProvinces.map(row => ({ name: row.name, count: row.events })) : []} mode={mode} onModeChange={setMode} /></MapErrorBoundary></Panel><div className="bottom-charts"><Panel title="Sự kiện theo loại tấn công"><div className="chart-box bar-chart">{dataMode === 'live' && liveExtrasLoading && !liveAttackTypes ? <div className="chart-message">Đang truy vấn QRadar...</div> : dataMode === 'live' && !barData.length ? <div className="chart-message">{liveExtrasError || 'Không có dữ liệu trong khoảng này.'}</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={barData} margin={{ top: 12, right: 2, left: -15, bottom: 0 }}><CartesianGrid stroke="#15263b" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#8ea3bd', fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#72849b', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#0d1a2b', border: '1px solid #233c58', borderRadius: 8, color: '#ffc83d' }} itemStyle={{ color: '#ffc83d' }} labelStyle={{ color: '#ffc83d' }} /><Bar dataKey="value" radius={[3, 3, 0, 0]}>{barData.map((row, i) => <Cell key={i} fill={row.color} />)}</Bar></BarChart></ResponsiveContainer>}</div></Panel><Panel title="Phân bố sự kiện theo địa lý" extra={<button className="more-link" onClick={() => setModal('vietnam-geo')}>Xem riêng Việt Nam <ArrowUpRight size={12} /></button>}><div className="geo-list">{dataMode === 'live' ? liveExtrasLoading && !liveGeography ? <div className="chart-message">Đang truy vấn QRadar...</div> : displayedCountries.length ? displayedCountries.map(row => <div className="geo-row" key={row.code || row.name}><span>{countryFlag(row.code)}</span><label>{row.name}</label><i><b style={{ width: `${row.pct}%`, background: row.color }} /></i><strong>{formatPercent(row.pct)}</strong></div>) : <div className="chart-message">{liveExtrasError || 'Không có dữ liệu địa lý trong khoảng này.'}</div> : [['🇻🇳', 'Việt Nam', 32.4, '#1689ff'], ['🇺🇸', 'United States', 18.7, '#8958f6'], ['🇨🇳', 'China', 12.6, '#13c7c1'], ['🇷🇺', 'Russia', 8.9, '#9258f5'], ['🇩🇪', 'Germany', 5.3, '#ff913e'], ['🌐', 'Others', 22.1, '#889bb5']].map(([flag, name, pct, color]) => <div className="geo-row" key={name}><span>{flag}</span><label>{name}</label><i><b style={{ width: `${pct * 2.4}%`, background: color }} /></i><strong>{pct}%</strong></div>)}</div></Panel></div></div>
          <div className="right-stack"><Panel title="Số lượng sự kiện theo thời gian" extra={dataMode === 'live' ? <span className="subtle">TỔNG KỲ: {eventTotalMetric?.live ? Number(String(eventTotalMetric.value).replaceAll(',', '')).toLocaleString('en-US') : eventTotalMetric?.error ? 'LỖI KPI' : 'ĐANG TẢI'}</span> : null}><div className="chart-box event-chart">{dataMode === 'live' && seriesLoading ? <div className="chart-message">Đang truy vấn QRadar...</div> : seriesError ? <div className="chart-message is-error">{seriesError}</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 4, left: -23, bottom: 0 }}><defs><linearGradient id="eventGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#f5ae25" stopOpacity={.38} /><stop offset="100%" stopColor="#f5ae25" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#182a3e" vertical /><XAxis dataKey="time" tick={{ fill: '#8da1b8', fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.max(0, Math.ceil(chartData.length / 8) - 1)} /><YAxis tick={{ fill: '#72849b', fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, max => Math.max(1, max)]} ticks={chartData.length > 0 && chartData.every(row => row.events === 0) ? [0] : undefined} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v))} /><Tooltip contentStyle={{ background: '#0d1a2b', border: '1px solid #233c58', borderRadius: 8, color: '#e8f3ff' }} /><Area dataKey="events" stroke="#ffbf37" strokeWidth={2} fill="url(#eventGrad)" /></AreaChart></ResponsiveContainer>}</div></Panel><Panel title="Cảnh báo theo giải pháp bảo mật" className="solution-panel"><div className="solution-list">{dataMode === 'live' && solutionsLoading ? <div className="solution-message">Đang truy vấn QRadar...</div> : solutionsError ? <div className="solution-message is-error">{solutionsError}</div> : displayedSolutions.length === 0 ? <div className="solution-message">Không có cảnh báo trong khoảng này.</div> : displayedSolutions.map(([name, pct, count, color]) => <div className="solution-row" key={name}><label>{name}</label><span className="bar-track"><i style={{ width: `${Math.min(100, pct)}%`, background: color }} /></span><b>{dataMode === 'live' ? displayKpiValue(count, true) : scaleValue(count)}</b><small>{dataMode === 'live' ? formatPercent(pct) : `${pct}%`}</small></div>)}</div></Panel><Panel title="Luồng tấn công gần đây" extra={<button className="more-link" onClick={() => { setFlowPage(0); setModal('all-flows') }}>Xem tất cả <ArrowUpRight size={12} /></button>} className="recent-panel"><div className="recent-head"><span>THỜI GIAN</span><span>NGUỒN → ĐÍCH</span><span>LOẠI TẤN CÔNG</span><span>TRẠNG THÁI</span></div>{dataMode === 'live' && liveExtrasLoading && !liveRecentFlows ? <div className="recent-empty">Đang truy vấn QRadar...</div> : dataMode === 'live' && !displayRecentFlows.length ? <div className="recent-empty">{liveExtrasError || 'Không có luồng trong khoảng thời gian này.'}</div> : displayRecentFlows.slice(0, 5).map((a, index) => <div className="recent-row" key={`${a.src}-${a.time}-${index}`}><time>{a.time}</time><span className="flow-ip">{a.src} <b>→</b> {a.dst.split(' • ').at(-1)}</span><span className="attack-type"><i style={{ background: a.color }} />{a.type}</span><b className={`flow-status ${String(a.status).toLowerCase().replaceAll(' ', '-')}`}>{a.status}</b></div>)}</Panel></div></div><footer><span>SIEM / SOAR <i /> QRadar Integration</span></footer></div>}
      {modal === 'vietnam-geo' && <Modal title="Phân bố sự kiện theo địa lý · Việt Nam" onClose={() => setModal(null)} className="data-modal geo-modal"><div className="geo-list">{dataMode === 'live' && vietnamGeoLoading ? <div className="chart-message">Đang truy vấn QRadar...</div> : displayedProvinces.length ? displayedProvinces.map(row => <div className="geo-row" key={row.name}><span>📍</span><label>{row.name}</label><i><b style={{ width: `${row.pct}%`, background: row.color }} /></i><strong>{formatPercent(row.pct)}</strong></div>) : <div className="chart-message">{dataMode === 'live' ? vietnamGeoError || 'Không có dữ liệu phân khu địa lý của Việt Nam trong khoảng này.' : 'Bật chế độ Live để truy vấn dữ liệu tỉnh/thành từ QRadar.'}</div>}</div></Modal>}
      {modal === 'all-flows' && <Modal title="Tất cả luồng tấn công" onClose={() => setModal(null)} className="data-modal flows-modal"><div className="recent-head"><span>THỜI GIAN</span><span>NGUỒN → ĐÍCH</span><span>LOẠI TẤN CÔNG</span><span>TRẠNG THÁI</span></div>{dataMode === 'live' && allFlowsLoading ? <div className="recent-empty">Đang truy vấn QRadar...</div> : allFlowsError ? <div className="recent-empty is-error">{allFlowsError}</div> : flowModalRows.length ? flowModalRows.map((row, index) => <div className="recent-row" key={`${row.src}-${row.time}-${index}`}><time>{row.time}</time><span className="flow-ip">{row.src} <b>→</b> {row.dst}</span><span className="attack-type"><i style={{ background: row.color }} />{row.type}</span><b className={`flow-status ${String(row.status).toLowerCase().replaceAll(' ', '-')}`}>{row.status}</b></div>) : <div className="recent-empty">Không có luồng trong khoảng thời gian này.</div>}<div className="flow-pagination"><span>{dataMode === 'live' ? `${Number(allFlows?.totalRows || 0).toLocaleString('en-US')} luồng · Trang ${flowTotalPages ? flowPage + 1 : 0}/${flowTotalPages}` : `${flowModalRows.length} luồng · Trang 1/1`}</span><div><button className="secondary-btn" disabled={flowPage <= 0 || allFlowsLoading} onClick={() => setFlowPage(page => Math.max(0, page - 1))}>Trước</button><button className="secondary-btn" disabled={dataMode !== 'live' || flowPage + 1 >= flowTotalPages || allFlowsLoading} onClick={() => setFlowPage(page => page + 1)}>Sau</button></div></div></Modal>}      {modal === 'account' && <Modal title={edit ? 'Chỉnh sửa thông tin' : 'Thông tin tài khoản'} onClose={() => setModal(null)} className="account-modal">{edit ? <div className="account-edit-layout"><PortraitPicker src={draft?.portrait} onSelect={portrait => setDraft(v => ({ ...v, portrait }))} /><form className="account-form" onSubmit={async e => { e.preventDefault(); setAccountSaveError(''); try { const updated = await authRequest('/api/auth/me', draft, authToken, 'PATCH'); setProfile(updated); setEdit(false) } catch (error) { setAccountSaveError(error.message) } }}> {accountSaveError && <div className="auth-error" role="alert">{accountSaveError}</div>}{formField('fullName', 'Họ và tên')}{formField('birthDate', 'Ngày sinh', 'date')}{formField('jobTitle', 'Chức vụ')}{formField('department', 'Bộ phận công tác')}{formField('phone', 'Số điện thoại', 'tel')}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setEdit(false)}>Hủy</button><button className="primary-btn"><Save size={14} /> Lưu thay đổi</button></div></form></div> : <div className="account-profile-layout"><PortraitFrame src={profile?.portrait} name={profile?.fullName || profile?.username} className="account-portrait" /><div className="account-profile-info"><dl className="account-details">{[['Họ và tên', 'fullName'], ['Ngày sinh', 'birthDate'], ['Chức vụ', 'jobTitle'], ['Bộ phận công tác', 'department'], ['Số điện thoại', 'phone']].map(([label, key]) => <React.Fragment key={key}><dt>{label}</dt><dd>{profile?.[key] || 'Chưa cập nhật'}</dd></React.Fragment>)}</dl><div className="modal-actions"><button className="primary-btn" onClick={() => setEdit(true)}>Chỉnh sửa thông tin</button></div></div></div>}</Modal>}{metric && <Modal title={metric.label} onClose={() => setMetric(null)}><p className="metric-detail">Giá trị hiện tại <strong>{metric.value}</strong></p><p className="metric-detail">Khoảng thống kê <strong>{periodLabel(period, customRange)}</strong></p><p className="metric-note">{metric.error ? `${metricErrorLabel(metric.errorType)}: ${metric.error}` : metric.isLive ? (metric.key === 'alerts' ? 'Tổng số cảnh báo được cộng từ ba nhóm severity Cao, Trung bình và Thấp; giá trị này trùng với tổng ở biểu đồ phân loại.' : metric.key === 'blockedAlerts' ? 'Đếm log có nội dung “blocked”; nên cấu hình QRADAR_BLOCKED_ALERTS_AQL theo trường action của log source.' : metric.key === 'protectedSystems' ? 'Số địa chỉ đích riêng biệt có ghi nhận event trong khoảng chọn.' : metric.key === 'activeSolutions' ? 'Số deviceType riêng biệt có gửi event trong khoảng chọn.' : 'Dữ liệu live từ QRadar.') : 'Chỉ số này đang dùng dữ liệu demo.'}</p></Modal>}</div></main>
}
export default App;
