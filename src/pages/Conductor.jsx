import React, { useState, useEffect, useRef, useCallback } from "react";
import Login from "./Login.jsx";
import { C, Btn, Input, Card, ErrMsg, TopBar, Spinner, Pill } from "../components/UI.jsx";
import { sb, todayStr, getSession, setSession, signOut } from "../supabase.js";

const TOTAL_SEATS = 34;
const SCANNER_ID  = "gcg-qr-scanner";

export default function ConductorPage() {
  const [session, setLocalSession] = useState(null);
  const [checked, setChecked]      = useState(false);
  const scanParam = new URLSearchParams(window.location.search).get("scan");

  useEffect(() => {
    const s = getSession();
    if (s) setLocalSession(s);
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (!session) return <Login expectedRole="conductor" onSuccess={(s) => { setSession(s); setLocalSession(s); }} />;

  return (
    <div style={{ minHeight:"100vh", background:C.surface }}>
      <TopBar title="Conductor Portal" onLogout={async()=>{ await signOut(); setLocalSession(null); }} />
      <div style={{ maxWidth:520, margin:"0 auto", padding:"24px 16px 60px" }}>
        <ConductorPanel autoScan={scanParam} />
      </div>
    </div>
  );
}

function ConductorPanel({ autoScan }) {
  const [query, setQuery]             = useState(autoScan || "");
  const [results, setResults]         = useState([]);
  const [searched, setSearched]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState("");
  const [checkingIn, setCheckingIn]   = useState(null);
  const [cameraOpen, setCameraOpen]   = useState(false);
  const [scanSuccess, setScanSuccess] = useState("");

  // Upcoming buses in next 2 hours
  const [upcomingBuses, setUpcomingBuses] = useState([]);
  const [busLoading, setBusLoading]       = useState(true);
  const [markingDepart, setMarkingDepart] = useState(null);
  const [markingArrive, setMarkingArrive] = useState(null);

  useEffect(() => {
    if (autoScan) search(autoScan);
    loadUpcoming();
  }, []);

  async function loadUpcoming() {
    setBusLoading(true);
    try {
      const nowDate = todayStr();
      const nowTime = new Date().toTimeString().slice(0,8);

      // All trips for today that haven't arrived yet
      const trips = await sb(
        `trips?travel_date=eq.${nowDate}&arrived_at=is.null&select=*,routes(origin,destination)&order=departure_time.asc`
      );

      // Show all of today's trips — underway or not yet departed
      const relevant = trips.filter(t => !t.arrived_at);

      // Fetch booking counts for each
      const withCounts = await Promise.all(relevant.map(async t => {
        const bk = await sb(`bookings?trip_id=eq.${t.id}&select=seat_number,checked_in`);
        return { ...t, totalBooked: bk.length, totalCheckedIn: bk.filter(b=>b.checked_in).length };
      }));
      setUpcomingBuses(withCounts);
    } catch(e) { console.error(e); }
    finally { setBusLoading(false); }
  }

  async function markDepart(id) {
    setMarkingDepart(id);
    try {
      await sb(`trips?id=eq.${id}`,{ method:"PATCH", prefer:"return=minimal",
        body:JSON.stringify({ departed_at: new Date().toISOString() }) });
      await loadUpcoming();
    } catch(e) { setErr("Couldn't mark departure. "+e.message); }
    finally { setMarkingDepart(null); }
  }

  async function markArrive(id) {
    setMarkingArrive(id);
    try {
      await sb(`trips?id=eq.${id}`,{ method:"PATCH", prefer:"return=minimal",
        body:JSON.stringify({ arrived_at: new Date().toISOString() }) });
      await loadUpcoming();
    } catch(e) { setErr("Couldn't mark arrival. "+e.message); }
    finally { setMarkingArrive(null); }
  }

  async function search(q) {
    const term = (q || query).trim();
    if (!term) return;
    setQuery(term);
    setLoading(true); setErr(""); setSearched(true); setCameraOpen(false);
    try {
      const rows = /^\d+$/.test(term)
        ? await sb(`bookings?seat_number=eq.${term}&select=*,trips(travel_date,departure_time,routes(origin,destination))&order=created_at.desc&limit=10`)
        : await sb(`bookings?reference=ilike.*${encodeURIComponent(term)}*&select=*,trips(travel_date,departure_time,routes(origin,destination))`);
      setResults(rows);
      if (rows.length === 0) setErr("No booking found for this reference.");
      else setQuery("");
    } catch(e) { setErr("Search failed. "+e.message); setResults([]); }
    finally { setLoading(false); }
  }

  async function checkIn(id) {
    setCheckingIn(id);
    try {
      await sb(`bookings?id=eq.${id}`,{ method:"PATCH", body:JSON.stringify({checked_in:true}), prefer:"return=minimal" });
      setResults(p => p.map(b => b.id===id ? {...b,checked_in:true} : b));
      setScanSuccess("✓ Passenger successfully checked in!");
      setTimeout(()=>setScanSuccess(""),5000);
      loadUpcoming(); // refresh counts
    } catch(e) { setErr("Couldn't update check-in. "+e.message); }
    finally { setCheckingIn(null); }
  }

  function handleScan(rawValue) {
    try {
      const url = new URL(rawValue);
      const ref = url.searchParams.get("scan");
      search(ref || rawValue);
    } catch { search(rawValue); }
  }

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:26, fontWeight:800, color:C.text }}>Conductor panel</div>
        <div style={{ fontSize:14, color:C.muted, marginTop:2 }}>Check in passengers and manage departures</div>
      </div>

      {/* Upcoming / ongoing buses */}
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:12 }}>🚌 Today's buses</div>
        {busLoading && <div style={{display:"flex",justifyContent:"center",padding:20}}><Spinner color={C.navy}/></div>}
        {!busLoading && upcomingBuses.length===0 && (
          <div style={{fontSize:14,color:C.muted,padding:"16px 0"}}>No buses scheduled for today.</div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {upcomingBuses.map(t => {
            const depTime = String(t.departure_time).slice(0,5);
            const underway = t.departed_at && !t.arrived_at;
            const scheduledMs = new Date(`${t.travel_date}T${t.departure_time}`).getTime();
            const departedMs  = t.departed_at ? new Date(t.departed_at).getTime() : null;
            const delayMins   = departedMs ? Math.round((departedMs - scheduledMs) / 60000) : 0;
            const isDelayed   = departedMs && delayMins > 2;
            const route = t.routes ? `${t.routes.origin} → ${t.routes.destination}` : "";

            return (
              <Card key={t.id} accent={underway ? C.green : C.orange}>
                <div style={{ padding:"16px 18px" }}>
                  {/* Route + time */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:17, fontWeight:800, color:C.text }}>{route}</div>
                      <div style={{ fontSize:24, fontWeight:900, color:C.navy, marginTop:2 }}>{depTime}</div>
                      {t.car_number && <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>🚌 {t.car_number}</div>}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                      {underway && <Pill color="green" text="Underway" />}
                      {isDelayed && <Pill color="red" text={`⚠ Delayed ${delayMins}min`} />}
                      {!underway && !isDelayed && <Pill color="orange" text="Departing soon" />}
                    </div>
                  </div>

                  {/* Seat counts */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14,
                                background:C.surface, borderRadius:10, padding:"12px 14px" }}>
                    <div>
                      <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:2 }}>BOOKED</div>
                      <div style={{ fontSize:22, fontWeight:900, color:C.text }}>{t.totalBooked}<span style={{fontSize:13,fontWeight:500,color:C.muted}}>/{TOTAL_SEATS}</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:2 }}>CHECKED IN</div>
                      <div style={{ fontSize:22, fontWeight:900, color:C.green }}>{t.totalCheckedIn}<span style={{fontSize:13,fontWeight:500,color:C.muted}}>/{t.totalBooked}</span></div>
                    </div>
                  </div>

                  {/* Delayed warning */}
                  {isDelayed && (
                    <div style={{ background:"#FFE5E9", borderRadius:10, padding:"10px 14px", marginBottom:12,
                                  fontSize:14, color:C.red, fontWeight:600 }}>
                      ⚠️ This bus departed {delayMins} minute{delayMins!==1?"s":""} late.
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display:"flex", gap:10 }}>
                    {!t.departed_at && (
                      <Btn color="orange" fullWidth disabled={markingDepart===t.id} onClick={()=>markDepart(t.id)} style={{fontSize:15}}>
                        {markingDepart===t.id?<><Spinner color={C.white}/>Marking…</>:"✓ Mark as departed"}
                      </Btn>
                    )}
                    {underway && (
                      <Btn color="green" fullWidth disabled={markingArrive===t.id} onClick={()=>markArrive(t.id)} style={{fontSize:15}}>
                        {markingArrive===t.id?<><Spinner color={C.navy}/>Marking…</>:"🏁 Mark as arrived"}
                      </Btn>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop:`2px solid ${C.border}`, marginBottom:28 }} />

      {/* Check-in section */}
      <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:16 }}>🎫 Passenger check-in</div>

      {scanSuccess && (
        <div style={{ background:"#E0FBF4", color:"#06A87E", fontWeight:700, fontSize:16,
                      padding:"14px 18px", borderRadius:12, marginBottom:16, textAlign:"center" }}>
          {scanSuccess}
        </div>
      )}

      {/* Camera */}
      {cameraOpen ? (
        <QrScanner onScan={handleScan} onClose={()=>setCameraOpen(false)} />
      ) : (
        <Card style={{ marginBottom:20 }} accent={C.green}>
          <div style={{ padding:"24px 20px", textAlign:"center" }}>
            <div style={{ width:80, height:80, borderRadius:20, background:"#E0FBF4",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:40, margin:"0 auto 16px" }}>📷</div>
            <div style={{ fontWeight:800, color:C.text, fontSize:18, marginBottom:6 }}>Scan QR code</div>
            <div style={{ fontSize:14, color:C.muted, marginBottom:20 }}>
              Point camera at the QR code on the passenger's ticket
            </div>
            <Btn color="green" fullWidth onClick={()=>{setErr("");setCameraOpen(true);}} style={{fontSize:16}}>
              Open camera to scan
            </Btn>
          </div>
        </Card>
      )}

      {/* Manual search */}
      <Card style={{ marginBottom:20, padding:"18px 20px" }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1.2, marginBottom:12 }}>
          OR SEARCH MANUALLY
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Input value={query} onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&search()}
            placeholder="Reference e.g. GCG-AB12CD or seat no."
            style={{ flex:1, fontSize:15 }} />
          <Btn color="navy" disabled={loading} onClick={()=>search()}
            style={{ padding:"12px 20px", borderRadius:10, flexShrink:0, fontSize:15 }}>
            {loading?<Spinner/>:"Search"}
          </Btn>
        </div>
      </Card>

      <ErrMsg msg={err} />

      {searched && !loading && results.length===0 && !err && (
        <div style={{ textAlign:"center", padding:"32px 0" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🔍</div>
          <div style={{ fontWeight:800, color:C.text, fontSize:18, marginBottom:6 }}>No booking found</div>
          <div style={{ fontSize:14, color:C.muted }}>Check the reference and try again.</div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {results.map(b => {
          const trip  = b.trips;
          const route = trip?.routes ? `${trip.routes.origin} → ${trip.routes.destination}` : "";
          return (
            <Card key={b.id} accent={b.checked_in?C.green:C.orange}>
              <div style={{ padding:"18px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div>
                    <div style={{ fontWeight:800, color:C.text, fontSize:18 }}>{b.passenger_name}</div>
                    <div style={{ fontSize:14, color:C.muted, marginTop:2 }}>{route}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:12, color:C.muted, fontWeight:700 }}>SEAT</div>
                    <div style={{ fontSize:40, fontWeight:900, color:C.text, lineHeight:1 }}>{b.seat_number}</div>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                  <Detail label="Date"      value={trip?.travel_date||"—"} />
                  <Detail label="Departs"   value={trip?String(trip.departure_time).slice(0,5):"—"} />
                  <Detail label="Reference" value={b.reference} mono />
                  <Detail label="Paid"      value={`GHS ${Number(b.total).toFixed(2)}`} />
                </div>
                {b.checked_in ? (
                  <div style={{ background:"#E0FBF4", borderRadius:12, padding:"14px 16px",
                                display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:28 }}>✅</span>
                    <span style={{ fontWeight:800, color:"#06A87E", fontSize:17 }}>Passenger has boarded</span>
                  </div>
                ) : (
                  <Btn color="green" fullWidth disabled={checkingIn===b.id} onClick={()=>checkIn(b.id)} style={{fontSize:17}}>
                    {checkingIn===b.id?<><Spinner color={C.navy}/>Checking in…</>:"✓ Mark as boarded"}
                  </Btn>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function QrScanner({ onScan, onClose }) {
  const [status, setStatus] = useState("Loading scanner…");
  const [ready, setReady]   = useState(false);
  const scannerRef          = useRef(null);
  const scannedRef          = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { if (scannerRef.current.getState()===2) await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (!window.Html5Qrcode) {
          await new Promise((res,rej) => {
            const s = document.createElement("script");
            s.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
            s.onload=res; s.onerror=()=>rej(new Error("Failed to load QR library"));
            document.head.appendChild(s);
          });
        }
        if (cancelled) return;
        const scanner = new window.Html5Qrcode(SCANNER_ID);
        scannerRef.current = scanner;
        const cameras = await window.Html5Qrcode.getCameras();
        if (!cameras?.length) { setStatus("No camera found."); return; }
        const cam = cameras.find(c=>c.label.toLowerCase().includes("back")||c.label.toLowerCase().includes("rear")) || cameras[cameras.length-1];
        await scanner.start(
          cam.id,
          { fps:10, qrbox:{width:220,height:220}, aspectRatio:1.0 },
          (decoded) => {
            if (scannedRef.current) return;
            scannedRef.current = true;
            stopScanner().then(()=>onScan(decoded));
          },
          ()=>{}
        );
        if (!cancelled) { setReady(true); setStatus("Point camera at the QR code"); }
      } catch(e) { if (!cancelled) setStatus("Camera error: "+(e.message||"Permission denied")); }
    }
    init();
    return () => { cancelled=true; stopScanner(); };
  }, [onScan, stopScanner]);

  return (
    <Card style={{ marginBottom:20, overflow:"hidden" }} accent={C.green}>
      <div style={{ padding:"14px 20px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontWeight:700, color:C.text, fontSize:16 }}>Camera scanner</div>
        <Btn color="surface" size="sm" onClick={()=>{ stopScanner(); onClose(); }}>✕ Close</Btn>
      </div>
      <div style={{ position:"relative", background:"#000" }}>
        <div id={SCANNER_ID} style={{ width:"100%" }} />
        {!ready && (
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
                        alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", gap:14, minHeight:260 }}>
            <Spinner color={C.white} size={32}/>
            <div style={{ color:"rgba(255,255,255,0.7)", fontSize:14 }}>{status}</div>
          </div>
        )}
      </div>
      <div style={{ padding:"10px 20px 16px", textAlign:"center", fontSize:14, color:C.muted }}>{status}</div>
    </Card>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize:12, color:C.muted, fontWeight:700, letterSpacing:0.8, marginBottom:3 }}>{label}</div>
      <div className={mono?"gcg-mono":""} style={{ fontSize:mono?13:15, fontWeight:600, color:C.text, wordBreak:"break-all" }}>{value}</div>
    </div>
  );
}
