import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { io } from 'socket.io-client';
import gsap from 'gsap';
import { Canvas, useFrame } from '@react-three/fiber';
import { Activity, Ambulance, Award, Bell, Building2, CircleAlert, CircleCheck as CheckCircle2, Clock, Coins, Crosshair, Expand, ExternalLink, Gauge, HeartPulse, Hospital, Landmark, LogOut, MapPin, MapPinned, Navigation, PhoneCall, Radio, Route, ShieldCheck, Siren, Sparkles, Stethoscope, Trophy, UserRound, WalletCards, X, Zap } from 'lucide-react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const priorities = ['Critical', 'Moderate', 'Normal'];
const emergencyTypes = ['Cardiac', 'Accident', 'Stroke', 'Respiratory', 'Pregnancy', 'Other'];
const rejectionReasons = ['Already with a patient', 'Currently unavailable', 'Vehicle unavailable', 'Too far', 'Other'];
const maharashtraZones = [
  { name: 'Parel', load: 'High', eta: '4 min', color: '#ef4444' },
  { name: 'Sion', load: 'Rising', eta: '6 min', color: '#f59e0b' },
  { name: 'Andheri West', load: 'Stable', eta: '8 min', color: '#06b6d4' },
  { name: 'Mulund', load: 'Clear', eta: '5 min', color: '#22c55e' }
];
const fleetStats = [
  { icon: <Ambulance />, value: '28', label: 'Mumbai ambulances live' },
  { icon: <Gauge />, value: '92%', label: 'Dispatch confidence' },
  { icon: <Hospital />, value: '74', label: 'Beds visible now' },
  { icon: <Zap />, value: '1.2s', label: 'Realtime sync' }
];
const responseSteps = [
  { label: 'Request verified', time: '00:08', done: true },
  { label: 'Nearest ALS unit assigned', time: '00:21', done: true },
  { label: 'Hospital pre-alert sent', time: '00:36', done: true },
  { label: 'Family contact notified', time: '00:42', done: false }
];
const fleetUnits = [
  { code: 'MH-ALS-2047', crew: 'Rohan + EMT Kavya', zone: 'Parel', eta: '4 min', type: 'ALS' },
  { code: 'MH-BLS-1182', crew: 'Sion Rapid Unit', zone: 'Sion', eta: '6 min', type: 'BLS' },
  { code: 'MH-ICU-4309', crew: 'Andheri ICU Van', zone: 'Andheri West', eta: '8 min', type: 'ICU' }
];
const triageSignals = [
  { label: 'Pulse', value: '118 bpm', tone: 'critical' },
  { label: 'SpO2', value: '91%', tone: 'moderate' },
  { label: 'BP', value: '142/94', tone: 'normal' }
];

const marker = (label, color) =>
  L.divIcon({
    html: `<div class="map-pin" style="--pin:${color}"><span>${label}</span></div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

function Scene() {
  const group = useRef();
  useFrame((state) => {
    group.current.rotation.y = state.clock.elapsedTime * 0.25;
    group.current.position.y = Math.sin(state.clock.elapsedTime) * 0.08;
  });
  return (
    <group ref={group}>
      <mesh position={[0, 0, 0]}>
        <torusKnotGeometry args={[1.1, 0.24, 160, 18]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.14} metalness={0.48} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.72, 48, 48]} />
        <meshStandardMaterial color="#fb7185" emissive="#f43f5e" transparent opacity={0.76} />
      </mesh>
      <ambientLight intensity={0.8} />
      <pointLight position={[4, 3, 4]} intensity={8} color="#7dd3fc" />
      <pointLight position={[-3, -2, 3]} intensity={4} color="#fda4af" />
    </group>
  );
}

function useSocket(token, onEvent) {
  useEffect(() => {
    if (!token) return undefined;
    const socket = io(API, { auth: { token } });
    socket.on('request:new', (data) => onEvent('request:new', data));
    socket.on('request:update', (data) => onEvent('request:update', data));
    socket.on('tracking:update', (data) => onEvent('tracking:update', data));
    socket.on('driver:wallet:update', (data) => onEvent('driver:wallet:update', data));
    return () => socket.disconnect();
  }, [token, onEvent]);
}

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('hec-session') || 'null'));
  const [requests, setRequests] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [schemesLoading, setSchemesLoading] = useState(false);
  const [schemesError, setSchemesError] = useState('');
  const [driver, setDriver] = useState(session?.driver || null);
  const [driverEarnings, setDriverEarnings] = useState(null);
  const [toast, setToast] = useState('');
  const [tracking, setTracking] = useState(null);
  const api = useMemo(() => axios.create({ baseURL: API, headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {} }), [session]);

  const mergeRequest = (incoming) => {
    setRequests((items) => {
      const rest = items.filter((item) => item.id !== incoming.id);
      return [incoming, ...rest].sort((a, b) => ({ Critical: 3, Moderate: 2, Normal: 1 }[b.priority] || 0) - ({ Critical: 3, Moderate: 2, Normal: 1 }[a.priority] || 0));
    });
  };

  useSocket(session?.token, (event, data) => {
    if (event.includes('request')) {
      mergeRequest(data);
      setToast(event === 'request:new' ? 'New emergency request received' : `Request marked ${data.status}`);
    }
    if (event === 'tracking:update') setTracking(data);
    if (event === 'driver:wallet:update') {
      setDriver(data.driver);
      setDriverEarnings((current) => ({ driver: data.driver, transactions: data.transaction ? [data.transaction, ...(current?.transactions || [])].slice(0, 5) : current?.transactions || [] }));
      setToast('Driver wallet updated');
    }
  });

  useEffect(() => {
    gsap.fromTo('.rise', { y: 22, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.8, ease: 'power3.out' });
    gsap.to('.float-card', { y: -10, duration: 2.4, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: 0.18 });
    gsap.fromTo('.pulse-line span', { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 1.3, stagger: 0.16, ease: 'power2.out' });
  }, [session?.user?.role]);

  useEffect(() => {
    if (!session) return;
    Promise.all([api.get('/api/requests'), api.get('/api/hospitals'), api.get('/api/me')]).then(([reqs, hosps, me]) => {
      setRequests(reqs.data);
      setHospitals(hosps.data);
      setDriver(me.data.driver);
      if (me.data.user.role === 'driver') api.get('/api/driver/earnings').then(({ data }) => setDriverEarnings(data)).catch(() => setDriverEarnings(null));
    });
  }, [api, session]);

  useEffect(() => {
    const activeRequest = requests[0];
    if (!session || !activeRequest) {
      setSchemes([]);
      return undefined;
    }
    let cancelled = false;
    setSchemesLoading(true);
    setSchemesError('');
    api.get('/api/schemes', { params: { emergencyType: activeRequest.emergencyType } })
      .then(({ data }) => { if (!cancelled) setSchemes(data); })
      .catch(() => { if (!cancelled) setSchemesError('Government scheme suggestions are unavailable right now. Please use the official services linked by your hospital.'); })
      .finally(() => { if (!cancelled) setSchemesLoading(false); });
    return () => { cancelled = true; };
  }, [api, requests, session]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const saveSession = (data) => {
    localStorage.setItem('hec-session', JSON.stringify(data));
    setSession(data);
    setDriver(data.driver);
  };

  const logout = () => {
    localStorage.removeItem('hec-session');
    setSession(null);
    setRequests([]);
    setDriver(null);
    setDriverEarnings(null);
  };

  return (
    <main>
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <div className="aurora aurora-c" />
      <nav className="nav">
        <div className="brand"><Siren size={22} /> Healthcare Emergency Connect</div>
        {session && <button className="ghost" onClick={logout}><LogOut size={16} /> Logout</button>}
      </nav>
      {!session ? <Landing onAuth={saveSession} /> : session.user.role === 'driver' ? <DriverDashboard api={api} user={session.user} driver={driver} setDriver={setDriver} driverEarnings={driverEarnings} requests={requests} mergeRequest={mergeRequest} hospitals={hospitals} /> : <PatientDashboard api={api} user={session.user} requests={requests} mergeRequest={mergeRequest} hospitals={hospitals} tracking={tracking} schemes={schemes} schemesLoading={schemesLoading} schemesError={schemesError} />}
      {toast && <div className="toast"><Bell size={16} /> {toast}</div>}
    </main>
  );
}

function Landing({ onAuth }) {
  return (
    <section className="landing">
      <div className="hero-copy rise">
        <span className="pill"><Radio size={14} /> Real-time emergency dispatch</span>
        <h1>Patient requests. Driver accepts. Ambulance moves live.</h1>
        <p>A Maharashtra emergency response cockpit with driver dispatch, live ambulance movement, hospital capacity, and priority routing in one polished demo.</p>
        <div className="metrics">
          <Metric value="4 min" label="Critical ETA" />
          <Metric value="Live" label="Socket.io updates" />
          <Metric value="5" label="Maharashtra hospital feeds" />
        </div>
        <div className="city-strip">
          {maharashtraZones.map((zone) => <span key={zone.name} style={{ '--zone': zone.color }}>{zone.name}</span>)}
        </div>
      </div>
      <div className="hero-visual rise">
        <Canvas camera={{ position: [0, 0, 4] }}><Scene /></Canvas>
        <div className="signal-card"><Activity /> Maharashtra network armed</div>
        <div className="float-card float-a"><Navigation size={16} /> KEM corridor</div>
        <div className="float-card float-b"><Route size={16} /> Sion route clear</div>
      </div>
      <AuthPanel onAuth={onAuth} />
    </section>
  );
}

function Metric({ value, label }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function AuthPanel({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('patient');
  const [form, setForm] = useState({ name: '', email: 'patient@test.com', password: '123456', phone: '', licenseNumber: '', vehicleNumber: '' });
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const payload = mode === 'login' ? { email: form.email, password: form.password } : { ...form, role };
      const { data } = await axios.post(`${API}/api/auth/${mode}`, payload);
      onAuth(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not authenticate');
    }
  };

  const demo = (nextRole) => {
    setRole(nextRole);
    setMode('login');
    setForm((old) => ({ ...old, email: nextRole === 'driver' ? 'driver@test.com' : 'patient@test.com', password: '123456' }));
  };

  return (
    <form className="panel auth rise" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
      </div>
      <div className="quick">
        <button type="button" onClick={() => demo('patient')}>Patient demo</button>
        <button type="button" onClick={() => demo('driver')}>Driver demo</button>
      </div>
      {mode === 'register' && <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
      <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      {mode === 'register' && (
        <>
          <select value={role} onChange={(e) => setRole(e.target.value)}><option value="patient">Patient</option><option value="driver">Driver</option></select>
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {role === 'driver' && <><input placeholder="License number" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /><input placeholder="Vehicle number" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} /></>}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary">{mode === 'login' ? 'Enter Command Center' : 'Create Account'}</button>
    </form>
  );
}

function PatientDashboard({ api, user, requests, mergeRequest, hospitals, tracking, schemes, schemesLoading, schemesError }) {
  const [form, setForm] = useState({ name: user.name, contact: user.phone || '+91 98765 43210', emergencyType: 'Cardiac', priority: 'Critical' });
  const active = requests[0];

  const submit = async (event) => {
    event.preventDefault();
    const { data } = await api.post('/api/requests', form);
    mergeRequest(data.request);
  };

  return (
    <section className="dashboard">
      <Header title={`Welcome, ${user.name}`} subtitle="Book an ambulance and watch the dispatch system react in real time." icon={<HeartPulse />} />
      <MaharashtraIntel />
      <RealisticOps request={active} />
      <div className="grid two">
        <form className="panel rise" onSubmit={submit}>
          <h2>Emergency Booking</h2>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Patient name" />
          <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Contact" />
          <select value={form.emergencyType} onChange={(e) => setForm({ ...form, emergencyType: e.target.value })}>{emergencyTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <div className="segmented">{priorities.map((item) => <button type="button" className={form.priority === item ? 'active' : ''} onClick={() => setForm({ ...form, priority: item })} key={item}>{item}</button>)}</div>
          <button className="emergency"><Siren /> Request Ambulance</button>
        </form>
        <StatusPanel request={active} />
      </div>
      <MapAndHospitals request={active} hospitals={hospitals} tracking={tracking} schemes={schemes} schemesLoading={schemesLoading} schemesError={schemesError} />
    </section>
  );
}

function DriverDashboard({ api, user, driver, setDriver, driverEarnings, requests, mergeRequest, hospitals }) {
  const active = requests.find((req) => req.status === 'Accepted') || requests[0];
  const [rejectionReason, setRejectionReason] = useState({});
  const changeStatus = async () => {
    const { data } = await api.patch('/api/driver/status', { status: driver?.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE' });
    setDriver(data);
  };
  const setRequestStatus = async (id, status, reason) => {
    const { data } = await api.patch(`/api/requests/${id}/status`, { status, reason });
    mergeRequest(data);
  };

  return (
    <section className="dashboard">
      <Header title="Driver Command Center" subtitle="Accept the highest priority case and keep availability visible." icon={<Ambulance />} />
      <MaharashtraIntel />
      <RealisticOps request={active} driverView />
      <div className="grid driver-grid">
        <div className="driver-side">
          <div className="panel rise">
            <h2>{driver?.name || user.name}</h2>
            <Info icon={<ShieldCheck />} label="License" value={driver?.licenseNumber} />
            <Info icon={<Ambulance />} label="Vehicle" value={driver?.vehicleNumber} />
            <Info icon={<UserRound />} label="Phone" value={driver?.phone} />
            <button className={`availability ${driver?.status === 'ONLINE' ? 'online' : ''}`} onClick={changeStatus}>{driver?.status || 'OFFLINE'}</button>
            <div className="mini-stats"><Metric value={requests.filter((r) => r.status === 'Accepted').length} label="Active" /><Metric value={driver?.completed || 0} label="Completed" /></div>
          </div>
          <DriverEarnings driver={driverEarnings?.driver || driver} transactions={driverEarnings?.transactions || []} />
        </div>
        <div className="panel rise requests">
          <h2>Incoming Requests</h2>
          {requests.length === 0 && <p className="muted">No active requests yet. Submit one from the patient dashboard.</p>}
          {requests.map((request) => (
            <article className={`request-card ${request.priority.toLowerCase()}`} key={request.id}>
              <div>
                <strong>{request.patientName}</strong>
                <span>{request.emergencyType} - {request.region || 'Maharashtra'} - {request.distance} - ETA {request.eta} min</span>
              </div>
              <b>{request.priority}</b>
              <div className="actions">
                {request.status === 'Pending' && (
                  <>
                    <button onClick={() => setRequestStatus(request.id, 'Accepted')}>Accept</button>
                    <select className="reject-select" value={rejectionReason[request.id] || 'Already with a patient'} onChange={(event) => setRejectionReason({ ...rejectionReason, [request.id]: event.target.value })} aria-label={`Rejection reason for ${request.patientName}`}>
                      {rejectionReasons.map((reason) => <option key={reason}>{reason}</option>)}
                    </select>
                    <button className="ghost" onClick={() => setRequestStatus(request.id, 'Rejected', rejectionReason[request.id] || 'Already with a patient')}>Reject</button>
                  </>
                )}
                {request.status === 'Accepted' && (
                  <button onClick={() => setRequestStatus(request.id, 'Completed')}>Complete</button>
                )}
                {request.status === 'Rejected' && (
                  <span className="status-badge rejected">Rejected{request.rejectionReason ? `: ${request.rejectionReason}` : ''}</span>
                )}
                {request.status === 'Completed' && <span className="paid-chip">Paid ₹{request.driverEarning || 0} / +{request.rewardPointsEarned || 0} pts</span>}
              </div>
            </article>
          ))}
        </div>
      </div>
      <MapAndHospitals request={active} hospitals={hospitals} />
    </section>
  );
}

function Header({ title, subtitle, icon }) {
  return <header className="dash-head rise"><div className="head-icon">{icon}</div><div><h1>{title}</h1><p>{subtitle}</p></div></header>;
}

function MaharashtraIntel() {
  return (
    <div className="intel-grid rise">
      {fleetStats.map((item) => (
        <article className="intel-card" key={item.label}>
          <div>{item.icon}</div>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </article>
      ))}
      <article className="intel-card wide">
        <div><Sparkles /></div>
        <strong>KEM Hospital, Mumbai recommended</strong>
        <span>Fastest route from Parel with ICU and trauma capacity available.</span>
        <div className="pulse-line"><span /><span /><span /></div>
      </article>
    </div>
  );
}

function RealisticOps({ request, driverView = false }) {
  return (
    <div className="ops-grid rise">
      <section className="panel ops-card">
        <div className="section-title"><h2>Emergency Timeline</h2><span><Radio size={15} /> Auto-dispatch log</span></div>
        <div className="timeline">
          {responseSteps.map((step) => (
            <div className={step.done ? 'done' : ''} key={step.label}>
              <CheckCircle2 size={17} />
              <span>{step.label}</span>
              <b>{step.time}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="panel ops-card">
        <div className="section-title"><h2>{driverView ? 'Fleet Backup' : 'Assigned Unit'}</h2><span><Ambulance size={15} /> Live fleet</span></div>
        <div className="fleet-list">
          {fleetUnits.map((unit) => (
            <article key={unit.code}>
              <strong>{unit.code}</strong>
              <span>{unit.crew} - {unit.zone}</span>
              <b>{unit.type} / {unit.eta}</b>
            </article>
          ))}
        </div>
      </section>
      <section className="panel ops-card">
        <div className="section-title"><h2>Patient Signals</h2><span><Stethoscope size={15} /> Simulated triage</span></div>
        <div className="triage-grid">
          {triageSignals.map((signal) => (
            <div className={signal.tone} key={signal.label}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
            </div>
          ))}
        </div>
        <p className="microcopy">{request ? `${request.priority} ${request.emergencyType} case routed via ${request.region || 'Maharashtra'}.` : 'Triage summary activates after booking.'}</p>
      </section>
      <section className="panel ops-card contact-card">
        <div className="section-title"><h2>Notifications</h2><span><PhoneCall size={15} /> Mock alerts</span></div>
        <p>SMS sent to emergency contact, ER desk, and driver crew. Consent and medical ID checks are simulated for demo.</p>
      </section>
    </div>
  );
}

function Info({ icon, label, value }) {
  return <div className="info">{icon}<span>{label}</span><strong>{value || '-'}</strong></div>;
}

function StatusPanel({ request }) {
  return (
    <div className="panel rise status">
      <h2>Live Status</h2>
      {!request ? <p className="muted">Your ambulance status appears here after booking.</p> : (
        <>
          <span className={`status-badge ${request.status.toLowerCase()}`}>{request.status}</span>
          <h3>{request.emergencyType} emergency</h3>
          <Info icon={<Clock />} label="ETA" value={`${request.eta} minutes`} />
          <Info icon={<MapPin />} label="Region" value={request.region || request.distance} />
          <Info icon={<Activity />} label="Priority" value={request.priority} />
        </>
      )}
    </div>
  );
}

function MapResizer({ active }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, active ? 180 : 60);
    return () => clearTimeout(timer);
  }, [active, map]);
  return null;
}

function DispatchMap({ patient, driver, hospitals, expanded = false }) {
  return (
    <MapContainer key={expanded ? 'expanded-map' : 'compact-map'} center={[19.04, 72.87]} zoom={expanded ? 11 : 10} scrollWheelZoom={expanded}>
      <MapResizer active={expanded} />
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[patient.lat, patient.lng]} icon={marker('P', '#22c55e')} />
      <Marker position={[driver.lat, driver.lng]} icon={marker('A', '#ef4444')} />
      {hospitals.filter((hospital) => hospital.location).map((hospital) => (
        <Marker key={hospital.id} position={[hospital.location.lat, hospital.location.lng]} icon={marker('H', '#2563eb')} />
      ))}
      <Polyline positions={[[driver.lat, driver.lng], [patient.lat, patient.lng]]} color="#67e8f9" weight={5} />
    </MapContainer>
  );
}

function MapAndHospitals({ request, hospitals, tracking, schemes = [], schemesLoading = false, schemesError = '' }) {
  const [expanded, setExpanded] = useState(false);
  const patient = request?.patientLocation || { lat: 19.001, lng: 72.8409 };
  const driver = tracking?.driverLocation || request?.driverLocation || { lat: 19.0215, lng: 72.8476 };

  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  return (
    <div className="grid two lower">
      <div className="panel map-wrap rise">
        <div className="section-title"><h2>Maharashtra Live Tracking</h2><span><MapPinned size={15} /> Mumbai emergency network</span></div>
        <button className="map-click-layer" type="button" onClick={() => setExpanded(true)} aria-label="Expand Maharashtra map">
          <span><Expand size={16} /> Click to expand command map</span>
        </button>
        <DispatchMap patient={patient} driver={driver} hospitals={hospitals} />
        {expanded && (
          <div className="map-modal" role="dialog" aria-modal="true" onMouseDown={() => setExpanded(false)}>
            <div className="map-modal-panel" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h2>Maharashtra Command Map</h2>
                  <p>Expanded route view with ambulance, patient, hospitals, and Maharashtra coverage points.</p>
                </div>
                <button className="ghost close-map" type="button" onClick={() => setExpanded(false)}><X size={18} /> Close</button>
              </div>
              <div className="expanded-map"><DispatchMap patient={patient} driver={driver} hospitals={hospitals} expanded /></div>
              <div className="map-legend">
                <span><i style={{ '--legend': '#ef4444' }} /> Ambulance</span>
                <span><i style={{ '--legend': '#22c55e' }} /> Patient</span>
                <span><i style={{ '--legend': '#2563eb' }} /> Hospital</span>
                <span><Route size={15} /> Suggested route corridor</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="panel rise hospitals">
        <div className="section-title"><h2>Hospital Availability</h2><span><Crosshair size={15} /> Live Maharashtra demo data</span></div>
        {hospitals.map((hospital) => (
          <article key={hospital.id}>
            {hospital.trauma ? <Hospital /> : <Building2 />}
            <div><strong>{hospital.name}</strong><span>{hospital.region} - {hospital.distance} away - ICU {hospital.icu}</span></div>
            <b>{hospital.beds} beds</b>
          </article>
        ))}
      </div>
      {request && <GovernmentSchemes schemes={schemes} loading={schemesLoading} error={schemesError} />}
    </div>
  );
}

function DriverEarnings({ driver, transactions }) {
  return (
    <div className="panel rise earnings-panel">
      <div className="section-title"><h2>Driver Earnings</h2><span><WalletCards size={15} /> Simulated wallet</span></div>
      <div className="earnings-grid">
        <Info icon={<Coins />} label="Total Earnings" value={`₹${driver?.totalEarnings || 0}`} />
        <Info icon={<Ambulance />} label="Completed Rides" value={driver?.completedRides ?? driver?.completed ?? 0} />
        <Info icon={<Award />} label="Performance" value="Reliable" />
        <Info icon={<Trophy />} label="Service Points" value={driver?.servicePoints || 0} />
        <Info icon={<ShieldCheck />} label="Driver Level" value={driver?.level || 'Bronze Responder'} />
      </div>
      <div className="transactions">
        <strong>Recent transactions</strong>
        {transactions.length === 0 && <p className="muted">Completed ride earnings will appear here.</p>}
        {transactions.map((transaction) => <article key={transaction.id}><span>Ride #{String(transaction.rideId).slice(-5)}</span><b>₹{transaction.amount}</b><small>+{transaction.servicePoints} Service Points</small></article>)}
      </div>
    </div>
  );
}

function GovernmentSchemes({ schemes, loading, error }) {
  return (
    <section className="panel rise schemes" aria-labelledby="schemes-heading">
      <div className="section-title">
        <h2 id="schemes-heading">Government Healthcare Schemes &amp; Financial Assistance</h2>
        <span><Landmark size={15} /> Official sources</span>
      </div>
      <p className="schemes-intro">These suggestions can help you ask the right questions at the hospital. They are not an eligibility decision or a guarantee of financial support.</p>
      {loading && <p className="scheme-message" role="status">Loading official scheme suggestions…</p>}
      {!loading && error && <p className="scheme-message error" role="alert">{error}</p>}
      {!loading && !error && schemes.length === 0 && <p className="scheme-message">No scheme suggestions match this request. Please ask the hospital help desk about government support.</p>}
      {!loading && !error && schemes.map((scheme) => (
        <article className="scheme-card" key={scheme.id}>
          <div className="scheme-heading"><Landmark aria-hidden="true" /><div><h3>{scheme.name}</h3><p>{scheme.description}</p></div></div>
          <p className="recommendation"><ShieldCheck size={15} /> {scheme.recommendation}</p>
          <dl>
            <div><dt>Eligibility</dt><dd>{scheme.eligibility}</dd></div>
            <div><dt>Benefits</dt><dd>{scheme.benefits}</dd></div>
            <div><dt>How to apply</dt><dd>{scheme.howToApply}</dd></div>
          </dl>
          <p className="scheme-disclaimer"><CircleAlert size={15} /> Verify eligibility, package coverage, and benefits with the official source or hospital before making any treatment or payment decision.</p>
          <a className="learn-more" href={scheme.website} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Learn more on the official website</a>
        </article>
      ))}
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
