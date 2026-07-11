import React, { useState, useEffect, useRef, useCallback } from "react";
import Login from "./Login.jsx";
import { C, Btn, Input, Card, ErrMsg, TopBar, Spinner, Pill } from "../components/UI.jsx";
import { sb, getSession, setSession, signOut } from "../supabase.js";

export default function ConductorPage() {
  const [session, setLocalSession] = useState(null);
  const [checked, setChecked]      = useState(false);
  const urlParams                  = new URLSearchParams(window.location.search);
  const scanParam                  = urlParams.get("scan");

  useEffect(() => {
    const s = getSession();
    if (s) setLocalSession(s);
    setChecked(true);
  }, []);

  async function handleLogout() {
    await signOut();
    setLocalSession(null);
  }

  if (!checked) return null;
  if (!session) {
    return <Login expectedRole="conductor" onSuccess={(s) => { setSession(s); setLocalSession(s); }} />;
  }

  return (
    <div style={{ minHeight:"100vh", background:C.surface }}>
      <TopBar title="Conductor Portal" onLogout={handleLogout} />
      <div style={{ maxWidth:520, margin:"0 auto", padding:"28px 16px 60px" }}>
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

  useEffect(() => {
    if (autoScan) search(autoScan);
  }, []);

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
      else setQuery(""); // clear field after successful find
    } catch(e) {
      setErr("Search failed. " + e.message);
      setResults([]);
    } finally { setLoading(false); }
  }

  async function checkIn(id) {
    setCheckingIn(id);
    try {
      await sb(`bookings?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ checked_in: true }),
        prefer: "return=minimal",
      });
      setResults(p => p.map(b => b.id === id ? { ...b, checked_in: true } : b));
      setScanSuccess("✓ Passenger successfully checked in!");
      setTimeout(() => setScanSuccess(""), 5000);
    } catch(e) {
      setErr("Couldn't update check-in. " + e.message);
    } finally { setCheckingIn(null); }
  }

  function handleScan(rawValue) {
    // QR encodes a URL like: https://site.com/conductor?scan=GCG-XXXXXX
    // Extract the reference from the URL, or use the raw value directly
    try {
      const url = new URL(rawValue);
      const ref = url.searchParams.get("scan");
      search(ref || rawValue);
    } catch {
      search(rawValue);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>Passenger check-in</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
          Scan a QR code or search by reference
        </div>
      </div>

      {scanSuccess && (
        <div style={{ background:"#E0FBF4", color:"#06A87E", fontWeight:700, fontSize:14,
                      padding:"12px 16px", borderRadius:12, marginBottom:16, textAlign:"center" }}>
          {scanSuccess}
        </div>
      )}

      {/* Camera scanner */}
      {cameraOpen ? (
        <QrScanner
          onScan={handleScan}
          onClose={() => setCameraOpen(false)}
        />
      ) : (
        <Card style={{ marginBottom: 20 }} accent={C.green}>
          <div style={{ padding:"24px 20px", textAlign:"center" }}>
            <div style={{ width:72, height:72, borderRadius:20, background:"#E0FBF4",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:36, margin:"0 auto 14px" }}>📷</div>
            <div style={{ fontWeight:700, color:C.text, fontSize:16, marginBottom:4 }}>
              Scan passenger QR code
            </div>
            <div style={{ fontSize:12.5, color:C.muted, marginBottom:18 }}>
              Point your camera at the QR code on the passenger's ticket
            </div>
            <Btn color="green" fullWidth onClick={() => { setErr(""); setCameraOpen(true); }}>
              Open camera to scan
            </Btn>
          </div>
        </Card>
      )}

      {/* Manual search */}
      <Card style={{ marginBottom: 20, padding:"16px 20px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1.2, marginBottom:10 }}>
          OR SEARCH MANUALLY
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Reference e.g. GCG-AB12CD or seat no."
            style={{ flex: 1 }}
          />
          <Btn color="navy" disabled={loading} onClick={() => search()}
            style={{ padding:"11px 20px", borderRadius:10, flexShrink:0 }}>
            {loading ? <Spinner/> : "Search"}
          </Btn>
        </div>
      </Card>

      <ErrMsg msg={err} />

      {searched && !loading && results.length === 0 && !err && (
        <div style={{ textAlign:"center", padding:"32px 0" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
          <div style={{ fontWeight:700, color:C.text, marginBottom:4 }}>No booking found</div>
          <div style={{ fontSize:13, color:C.muted }}>Check the reference and try again.</div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {results.map(b => {
          const trip  = b.trips;
          const route = trip?.routes ? `${trip.routes.origin} → ${trip.routes.destination}` : "";
          return (
            <Card key={b.id} accent={b.checked_in ? C.green : C.orange}>
              <div style={{ padding:"16px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontWeight:800, color:C.text, fontSize:16 }}>{b.passenger_name}</div>
                    <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>{route}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>SEAT</div>
                    <div style={{ fontSize:32, fontWeight:900, color:C.text, lineHeight:1 }}>{b.seat_number}</div>
                  </div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                  <Detail label="Date"      value={trip?.travel_date || "—"} />
                  <Detail label="Departs"   value={trip ? String(trip.departure_time).slice(0,5) : "—"} />
                  <Detail label="Reference" value={b.reference} mono />
                  <Detail label="Paid"      value={`GHS ${Number(b.total).toFixed(2)}`} />
                </div>

                {b.checked_in ? (
                  <div style={{ background:"#E0FBF4", borderRadius:10, padding:"12px 14px",
                                display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22 }}>✅</span>
                    <span style={{ fontWeight:700, color:"#06A87E", fontSize:15 }}>
                      Passenger has boarded
                    </span>
                  </div>
                ) : (
                  <Btn color="green" fullWidth disabled={checkingIn === b.id} onClick={() => checkIn(b.id)}>
                    {checkingIn === b.id
                      ? <><Spinner color={C.navy}/> Checking in…</>
                      : "✓ Mark as boarded"}
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

/* ================================================================
   QR Scanner using Html5-QRCode library (much better mobile support)
   ================================================================ */
const SCANNER_ID = "gcg-qr-scanner";

function QrScanner({ onScan, onClose }) {
  const [status, setStatus]   = useState("Loading scanner…");
  const [ready, setReady]     = useState(false);
  const scannerRef            = useRef(null);
  const scannedRef            = useRef(false); // prevent double-fire

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // state 2 = SCANNING
        if (state === 2) await scannerRef.current.stop();
      } catch(e) { /* already stopped */ }
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    function loadLibrary() {
      return new Promise((resolve, reject) => {
        if (window.Html5Qrcode) { resolve(); return; }
        const script = document.createElement("script");
        script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load QR library"));
        document.head.appendChild(script);
      });
    }

    async function init() {
      try {
        await loadLibrary();
        if (cancelled) return;

        const scanner = new window.Html5Qrcode(SCANNER_ID);
        scannerRef.current = scanner;

        const cameras = await window.Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          setStatus("No camera found on this device.");
          return;
        }

        // Prefer back camera on mobile
        const cam = cameras.find(c =>
          c.label.toLowerCase().includes("back") ||
          c.label.toLowerCase().includes("rear") ||
          c.label.toLowerCase().includes("environment")
        ) || cameras[cameras.length - 1];

        await scanner.start(
          cam.id,
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (scannedRef.current) return;
            scannedRef.current = true;
            stopScanner().then(() => onScan(decodedText));
          },
          () => { /* scan miss — ignore */ }
        );

        if (!cancelled) { setReady(true); setStatus("Point camera at the QR code"); }
      } catch(e) {
        if (!cancelled) {
          setStatus("Camera error: " + (e.message || "Permission denied. Please allow camera access."));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [onScan, stopScanner]);

  function handleClose() {
    stopScanner().then(onClose);
  }

  return (
    <Card style={{ marginBottom:20, overflow:"hidden" }} accent={C.green}>
      <div style={{ padding:"14px 20px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontWeight:700, color:C.text }}>Camera scanner</div>
        <button className="gcg-btn" onClick={handleClose}
          style={{ background:C.surface, borderRadius:8, padding:"6px 14px", fontSize:13, color:C.text }}>
          ✕ Close
        </button>
      </div>

      {/* The html5-qrcode library renders the video feed into this div */}
      <div style={{ position:"relative", background:"#000" }}>
        <div id={SCANNER_ID} style={{ width:"100%" }} />
        {!ready && (
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
                        alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)",
                        gap:14, minHeight:260 }}>
            <Spinner color={C.white} size={32}/>
            <div style={{ color:"rgba(255,255,255,0.7)", fontSize:13 }}>{status}</div>
          </div>
        )}
      </div>

      <div style={{ padding:"10px 20px 16px", textAlign:"center", fontSize:13, color:C.muted }}>
        {ready ? status : "Starting camera…"}
      </div>
    </Card>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize:10.5, color:C.muted, fontWeight:700, letterSpacing:0.8, marginBottom:2 }}>{label}</div>
      <div className={mono ? "gcg-mono" : ""} style={{ fontSize:mono?12:14, fontWeight:600, color:C.text, wordBreak:"break-all" }}>{value}</div>
    </div>
  );
}
