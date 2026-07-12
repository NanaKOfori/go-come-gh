import React, { useState, useEffect, useMemo } from "react";
import "./utilities.css";
import { C, GLOBAL_STYLE, Btn, Input, Card, ErrMsg, SectionLabel, Row, PageHead, TopBar, Spinner, Pill } from "./components/UI.jsx";
import { RealQr } from "./components/QrCode.jsx";
import { sb, todayStr } from "./supabase.js";

const STATIONS    = { Accra:"STC Bus Terminal, off Ring Road East, Circle, Accra", Kumasi:"Kejetia Bus Terminal, Adum, Kumasi" };
const SEAT_FEE    = 4.99;
const LUGGAGE_FEE = 10;
const TOTAL_SEATS = 34;
const TRIP_HOURS  = 6.5;

function arrivalTime(depTime) {
  const [h, m] = String(depTime).split(":").map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  d.setTime(d.getTime() + TRIP_HOURS * 3600000);
  return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}

export default function App() {
  return (
    <div style={{ minHeight:"100vh", background:C.surface }}>
      {GLOBAL_STYLE}
      <TopBar title="Book your ticket" />
      <div style={{ maxWidth:520, margin:"0 auto", padding:"20px 16px 60px" }}>
        <BookingFlow />
      </div>
    </div>
  );
}

function BookingFlow() {
  const [step, setStep]               = useState("search");
  const [from, setFrom]               = useState("Accra");
  const [to, setTo]                   = useState("Kumasi");
  const [date, setDate]               = useState(todayStr());
  const [results, setResults]         = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [searchErr, setSearchErr]     = useState("");
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [seatMode, setSeatMode]       = useState(null);
  const [seatNumber, setSeatNumber]   = useState(null);
  const [name, setName]               = useState("");
  const [phone, setPhone]             = useState("");
  const [momoSame, setMomoSame]       = useState(true);
  const [momoNumber, setMomoNumber]   = useState("");
  const [luggage, setLuggage]         = useState(0);
  const [lastBooking, setLastBooking] = useState(null);
  const [error, setError]             = useState("");
  const [paying, setPaying]           = useState(false);

  const seatFeeApplies = seatMode === "choose";
  const total = useMemo(() => {
    if (!selectedTrip) return 0;
    return Number(selectedTrip.price) + (seatFeeApplies ? SEAT_FEE : 0) + luggage * LUGGAGE_FEE;
  }, [selectedTrip, seatFeeApplies, luggage]);

  // Load trips for current from/to/date automatically
  useEffect(() => {
    loadTrips();
  }, [from, to, date]);

  async function loadTrips() {
    if (from === to) { setResults([]); return; }
    setLoadingTrips(true); setSearchErr("");
    try {
      const routes = await sb(`routes?origin=eq.${encodeURIComponent(from)}&destination=eq.${encodeURIComponent(to)}&select=id`);
      if (!routes.length) { setResults([]); setLoadingTrips(false); return; }
      const trips = await sb(`trips?route_id=eq.${routes[0].id}&travel_date=eq.${date}&select=*&order=departure_time.asc`);
      const isToday = date === todayStr();
      const nowHHMM = new Date().toTimeString().slice(0, 8);
      const upcoming = isToday ? trips.filter(t => String(t.departure_time) > nowHHMM && !t.arrived_at) : trips.filter(t => !t.arrived_at);
      const withSeats = await Promise.all(upcoming.map(async t => {
        const bk = await sb(`bookings?trip_id=eq.${t.id}&select=seat_number`);
        return { ...t, bookedSeats: bk.map(b => b.seat_number) };
      }));
      setResults(withSeats);
    } catch(e) { setSearchErr("Couldn't load buses. " + e.message); }
    finally { setLoadingTrips(false); }
  }

  function availableSeats(trip) {
    const booked = new Set(trip.bookedSeats);
    return Array.from({ length: TOTAL_SEATS }, (_, i) => i + 1).filter(s => !booked.has(s));
  }

  function goLucky() {
    const avail = availableSeats(selectedTrip);
    if (!avail.length) return;
    setSeatMode("lucky");
    setSeatNumber(avail[Math.floor(Math.random() * avail.length)]);
    setStep("payment");
  }

  async function pay() {
    if (!phone.trim() || phone.trim().length < 9) { setError("Enter a valid phone number."); return; }
    if (!momoSame && momoNumber.trim().length < 9) { setError("Enter a valid mobile money number."); return; }
    setError(""); setPaying(true);
    const ref = "GCG-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const payMomo = momoSame ? phone.trim() : momoNumber.trim();
    try {
      const inserted = await sb("bookings", {
        method: "POST",
        body: JSON.stringify({
          trip_id: selectedTrip.id, reference: ref,
          passenger_name: name.trim() || "Passenger",
          email: "noemail@gocomagh.com",
          seat_number: seatNumber,
          seat_fee: seatFeeApplies ? SEAT_FEE : 0,
          luggage_bags: luggage, luggage_fee: luggage * LUGGAGE_FEE,
          base_price: selectedTrip.price, total,
          pay_method: "momo", momo_number: payMomo,
        }),
      });
      setLastBooking({ ...inserted[0], from, to, time: selectedTrip.departure_time, travelDate: date, carNumber: selectedTrip.car_number });
      setStep("ticket");
    } catch(e) {
      if (e.message.includes("duplicate") || e.message.includes("unique")) {
        setError("That seat was just taken — please pick another.");
        const bk = await sb(`bookings?trip_id=eq.${selectedTrip.id}&select=seat_number`);
        setSelectedTrip(t => ({ ...t, bookedSeats: bk.map(b => b.seat_number) }));
        setStep("seats"); setSeatMode("choose");
      } else { setError("Payment couldn't be saved. " + e.message); }
    } finally { setPaying(false); }
  }

  function startOver() {
    setStep("search"); setSelectedTrip(null); setSeatMode(null); setSeatNumber(null);
    setName(""); setPhone(""); setMomoNumber(""); setMomoSame(true);
    setLuggage(0); setLastBooking(null); setError("");
  }

  function pickTrip(trip) {
    setSelectedTrip(trip); setSeatMode(null); setSeatNumber(null); setStep("seats");
  }

  /* ── SEARCH / LANDING ── */
  if (step === "search") return (
    <div>
      {/* Hero */}
      <div style={{ background:C.navy, borderRadius:20, padding:"28px 24px", marginBottom:20 }}>
        <div style={{ color:C.yellow, fontSize:13, fontWeight:700, letterSpacing:1.2, marginBottom:6 }}>BOOK YOUR SEAT</div>
        <div style={{ color:C.white, fontSize:28, fontWeight:800, lineHeight:1.2, marginBottom:4 }}>
          Where are you<br/>headed today?
        </div>
        <div style={{ color:"rgba(255,255,255,0.5)", fontSize:14 }}>GHS 160 per seat · ~6½ hrs journey</div>
      </div>

      {/* Route + date selector */}
      <Card style={{ marginBottom:20 }}>
        <div style={{ position:"relative" }}>
          <div style={{ padding:"16px 18px 12px", borderBottom:`1px solid ${C.surface}` }}>
            <div style={{ fontSize:12, color:C.muted, fontWeight:700, marginBottom:6 }}>FROM</div>
            <select value={from} onChange={e=>setFrom(e.target.value)}
              style={{ fontSize:18, fontWeight:700, color:C.text, border:"none", background:"transparent", outline:"none", width:"100%", cursor:"pointer" }}>
              <option>Accra</option><option>Kumasi</option>
            </select>
          </div>
          <div style={{ padding:"16px 18px 12px" }}>
            <div style={{ fontSize:12, color:C.muted, fontWeight:700, marginBottom:6 }}>TO</div>
            <select value={to} onChange={e=>setTo(e.target.value)}
              style={{ fontSize:18, fontWeight:700, color:C.text, border:"none", background:"transparent", outline:"none", width:"100%", cursor:"pointer" }}>
              <option>Accra</option><option>Kumasi</option>
            </select>
          </div>
          <button className="gcg-btn" onClick={() => { setFrom(to); setTo(from); }}
            style={{ position:"absolute", right:18, top:"50%", transform:"translateY(-50%)",
                     width:38, height:38, borderRadius:"50%", background:C.orange,
                     color:C.white, fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>⇅</button>
        </div>
        <div style={{ padding:"14px 18px", borderTop:`1px solid ${C.surface}` }}>
          <div style={{ fontSize:12, color:C.muted, fontWeight:700, marginBottom:6 }}>DATE</div>
          <input type="date" value={date} min={todayStr()} onChange={e=>setDate(e.target.value)}
            style={{ fontSize:18, fontWeight:700, color:C.text, border:"none", background:"transparent", outline:"none", width:"100%", cursor:"pointer" }} />
        </div>
      </Card>

      {/* Available buses */}
      <div style={{ fontSize:17, fontWeight:800, color:C.text, marginBottom:12 }}>
        {loadingTrips ? "Finding buses…" : from === to ? "Select different towns above" : `Available buses`}
      </div>

      {loadingTrips && <div style={{display:"flex",justifyContent:"center",padding:32}}><Spinner color={C.navy} size={28}/></div>}
      {searchErr && <ErrMsg msg={searchErr} />}

      {!loadingTrips && !searchErr && results.length === 0 && from !== to && (
        <Card style={{ padding:"24px 20px", textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:10 }}>🚌</div>
          <div style={{ fontWeight:700, color:C.text, fontSize:16, marginBottom:6 }}>
            {date === todayStr() ? "No more buses today" : "No buses on this date"}
          </div>
          <div style={{ fontSize:14, color:C.muted }}>
            {date === todayStr() ? "All departures have passed. Try tomorrow." : "No trips scheduled. Try another date."}
          </div>
        </Card>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {results.map(trip => {
          const left = TOTAL_SEATS - trip.bookedSeats.length;
          const soldOut = left === 0;
          const depTime = String(trip.departure_time).slice(0,5);
          const eta = arrivalTime(trip.departure_time);
          return (
            <Card key={trip.id} accent={soldOut ? C.border : C.orange}
              style={{ opacity: soldOut ? 0.7 : 1 }}>
              <div style={{ padding:"18px 20px" }}>
                {/* Times row */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1, marginBottom:4 }}>DEPARTURE</div>
                    <div style={{ fontSize:34, fontWeight:900, color:C.text, lineHeight:1 }}>{depTime}</div>
                    <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>Arrives ~{eta}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1, marginBottom:4 }}>FARE</div>
                    <div style={{ fontSize:28, fontWeight:900, color:C.text }}>GHS {trip.price}</div>
                  </div>
                </div>
                {/* Details row */}
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
                  {soldOut
                    ? <Pill color="red" text="Sold out" />
                    : <Pill color="green" text={`${left} of ${TOTAL_SEATS} seats left`} />}
                  {trip.car_number && (
                    <Pill color="orange" text={`🚌 ${trip.car_number}`} />
                  )}
                </div>
                <Btn color={soldOut ? "surface" : "orange"} fullWidth disabled={soldOut} onClick={() => pickTrip(trip)}
                  style={{ fontSize:16, padding:"14px" }}>
                  {soldOut ? "Bus full" : "Book this bus →"}
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>
      <div style={{ marginTop:20, fontSize:13, color:C.muted, lineHeight:1.8, textAlign:"center" }}>
        2 bags up to 15kg ride free · Extra 25kg bag GHS {LUGGAGE_FEE}
      </div>
    </div>
  );

  /* ── SEATS ── */
  if (step === "seats" && selectedTrip) {
    const avail = new Set(availableSeats(selectedTrip));
    const depTime = String(selectedTrip.departure_time).slice(0,5);
    const eta = arrivalTime(selectedTrip.departure_time);
    return (
      <div>
        <PageHead onBack={() => setStep("search")} title="Choose your seat"
          sub={`${from} → ${to} · Departs ${depTime} · Arrives ~${eta}`} />
        <ErrMsg msg={error} />

        {/* Seat choice cards — shown always */}
        <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:20 }}>
          <button className="gcg-btn" onClick={goLucky}
            style={{ background:C.navy, color:C.white, borderRadius:16, padding:"22px 20px",
                     display:"flex", justifyContent:"space-between", alignItems:"center", textAlign:"left" }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:6 }}>🍀 I'm feeling lucky</div>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)" }}>We'll pick a random available seat for you</div>
            </div>
            <Pill color="green" text="FREE" />
          </button>
          <button className="gcg-btn" onClick={() => setSeatMode(seatMode === "choose" ? null : "choose")}
            style={{ background:seatMode==="choose"?C.navy:C.white, color:seatMode==="choose"?C.white:C.text,
                     border:`2px solid ${seatMode==="choose"?C.navy:C.border}`, borderRadius:16, padding:"22px 20px",
                     display:"flex", justifyContent:"space-between", alignItems:"center", textAlign:"left" }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:6 }}>🎯 Choose your own seat</div>
              <div style={{ fontSize:14, color:seatMode==="choose"?"rgba(255,255,255,0.6)":C.muted }}>
                Select from available seats below
              </div>
            </div>
            <Pill color="yellow" text={`+GHS ${SEAT_FEE.toFixed(2)}`} />
          </button>
        </div>

        {/* Seat map — always visible so customers can see availability */}
        <div>
          <div style={{ fontSize:15, color:C.muted, marginBottom:14, textAlign:"center" }}>
            {seatMode === "choose" ? "Tap a green seat to select your spot" : "Current seat availability"}
          </div>
          <SeatGrid
            avail={avail}
            onPick={seatMode === "choose" ? seat => { setSeatNumber(seat); setStep("payment"); } : null}
          />
          <div style={{ display:"flex", gap:20, justifyContent:"center", marginTop:14, fontSize:14, color:C.muted }}>
            <span><span style={{ display:"inline-block", width:14, height:14, borderRadius:4, background:"#E0FBF4", border:`2px solid ${C.green}`, verticalAlign:-3, marginRight:6 }}/>Available</span>
            <span><span style={{ display:"inline-block", width:14, height:14, borderRadius:4, background:"#F0F2F5", border:`1.5px solid ${C.border}`, verticalAlign:-3, marginRight:6 }}/>Taken</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── PAYMENT ── */
  if (step === "payment" && selectedTrip) {
    const depTime = String(selectedTrip.departure_time).slice(0,5);
    const eta = arrivalTime(selectedTrip.departure_time);
    return (
      <div>
        <PageHead onBack={() => setStep("seats")} title="Your details"
          sub={`${from} → ${to} · ${depTime} · Seat ${seatNumber}`} />

        {/* Summary */}
        <Card style={{ padding:"18px 20px", marginBottom:16 }} accent={C.yellow}>
          <SectionLabel>Booking summary</SectionLabel>
          <Row label="Ticket" value={`GHS ${Number(selectedTrip.price).toFixed(2)}`} />
          {seatFeeApplies && <Row label="Seat selection fee" value={`GHS ${SEAT_FEE.toFixed(2)}`} />}
          {luggage > 0 && <Row label={`Extra luggage ×${luggage}`} value={`GHS ${(luggage * LUGGAGE_FEE).toFixed(2)}`} />}
          <div style={{ borderTop:`1px solid ${C.surface}`, marginTop:10, paddingTop:10 }}>
            <Row label={`Total — Seat ${seatNumber}`} value={`GHS ${total.toFixed(2)}`} bold large />
          </div>
          <div style={{ marginTop:10, fontSize:13, color:C.muted }}>
            Departs {depTime} · Arrives ~{eta}
          </div>
        </Card>

        {/* Passenger details */}
        <Card style={{ padding:"18px 20px", marginBottom:16 }}>
          <SectionLabel>Passenger details</SectionLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <div style={{ fontSize:14, color:C.muted, marginBottom:6 }}>Name <span style={{fontSize:12}}>(optional)</span></div>
              <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={{ fontSize:16 }} />
            </div>
            <div>
              <div style={{ fontSize:14, color:C.muted, marginBottom:6 }}>Phone number <span style={{color:C.red}}>*</span></div>
              <Input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="e.g. 024 123 4567" type="tel" style={{ fontSize:16 }} />
            </div>
            {/* Same as MoMo toggle */}
            <button className="gcg-btn" onClick={() => setMomoSame(!momoSame)}
              style={{ display:"flex", alignItems:"center", gap:12, background:"transparent", padding:0, textAlign:"left" }}>
              <div style={{ width:24, height:24, borderRadius:6, border:`2px solid ${momoSame?C.green:C.border}`,
                            background:momoSame?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center",
                            flexShrink:0 }}>
                {momoSame && <span style={{ color:C.white, fontSize:14, fontWeight:800 }}>✓</span>}
              </div>
              <span style={{ fontSize:15, color:C.text }}>My mobile money number is the same as my phone number</span>
            </button>
            {!momoSame && (
              <div>
                <div style={{ fontSize:14, color:C.muted, marginBottom:6 }}>Mobile money number <span style={{color:C.red}}>*</span></div>
                <Input value={momoNumber} onChange={e=>setMomoNumber(e.target.value)} placeholder="MoMo number" type="tel" style={{ fontSize:16 }} />
              </div>
            )}
          </div>
          {/* Luggage */}
          <div style={{ marginTop:18, paddingTop:16, borderTop:`1px solid ${C.surface}` }}>
            <div style={{ fontSize:14, color:C.muted, marginBottom:10 }}>Extra 25kg bags (GHS {LUGGAGE_FEE} each) · 2 bags up to 15kg are free</div>
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              <Btn color="surface" size="sm" onClick={()=>setLuggage(n=>Math.max(0,n-1))} style={{ fontSize:20, width:40, height:40 }}>−</Btn>
              <span style={{ fontSize:22, fontWeight:800, width:28, textAlign:"center" }}>{luggage}</span>
              <Btn color="surface" size="sm" onClick={()=>setLuggage(n=>Math.min(4,n+1))} style={{ fontSize:20, width:40, height:40 }}>+</Btn>
            </div>
          </div>
        </Card>

        <ErrMsg msg={error} />
        <Btn color="orange" size="lg" fullWidth disabled={paying} onClick={pay} style={{ fontSize:18 }}>
          {paying ? <><Spinner color={C.white}/> Processing…</> : `Pay GHS ${total.toFixed(2)} →`}
        </Btn>
        <div style={{ marginTop:14, fontSize:13, color:C.muted, textAlign:"center", lineHeight:1.7 }}>
          By paying you agree to our refund policy: 80% refund if you miss your bus.
        </div>
      </div>
    );
  }

  /* ── TICKET ── */
  if (step === "ticket" && lastBooking) {
    const b = lastBooking;
    const [h,m] = String(b.time).split(":").map(Number);
    const dep = new Date(); dep.setHours(h,m,0,0);
    const arrive30 = new Date(dep.getTime() - 30 * 60000);
    const fmt = d => d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const eta = arrivalTime(b.time);
    return (
      <div>
        <div style={{ background:C.green, borderRadius:20, padding:"28px 20px", marginBottom:20, textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:8 }}>✓</div>
          <div style={{ fontSize:26, fontWeight:800, color:C.navy }}>You're booked!</div>
          <div style={{ fontSize:15, color:C.navy, opacity:0.75, marginTop:6 }}>Show this ticket to your conductor</div>
        </div>

        <Card style={{ marginBottom:16, overflow:"hidden" }}>
          {/* Top: boarding pass info */}
          <div style={{ padding:"22px 22px 18px", background:C.navy }}>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontWeight:700, letterSpacing:1.5, marginBottom:10 }}>BOARDING PASS · GO-COME-GH</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
              <div>
                <div style={{ fontSize:28, fontWeight:900, color:C.white }}>{b.from}</div>
                <div style={{ color:C.orange, fontSize:18, fontWeight:700, margin:"6px 0" }}>→</div>
                <div style={{ fontSize:28, fontWeight:900, color:C.white }}>{b.to}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontWeight:700, letterSpacing:1 }}>SEAT</div>
                <div style={{ fontSize:72, fontWeight:900, color:C.yellow, lineHeight:1 }}>{b.seat_number}</div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {[
                ["PASSENGER", b.passenger_name, false],
                ["REFERENCE", b.reference, true],
                ["DATE", b.travelDate, false],
                ["DEPARTS", String(b.time).slice(0,5), false],
                ["ARRIVES ~", eta, false],
                ["BE THERE BY", fmt(arrive30), false],
                ["PAID", `GHS ${Number(b.total).toFixed(2)}`, false],
                b.carNumber ? ["BUS", b.carNumber, false] : null,
              ].filter(Boolean).map(([lbl,val,mono]) => (
                <div key={lbl}>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", fontWeight:700, letterSpacing:1, marginBottom:3 }}>{lbl}</div>
                  <div className={mono?"gcg-mono":""} style={{ fontSize:mono?13:15, fontWeight:600, color:C.white, wordBreak:"break-all" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Perforation */}
          <div style={{ borderTop:"2px dashed rgba(0,0,0,0.1)", margin:"0 18px" }} />

          {/* Bottom: QR code — large */}
          <div style={{ padding:"22px 22px", display:"flex", flexDirection:"column", alignItems:"center", gap:12, background:"#FAFAF9" }}>
            <RealQr value={`${window.location.origin}/conductor?scan=${b.reference}`} size={220} />
            <div style={{ fontSize:13, color:C.muted, textAlign:"center" }}>
              <div style={{ fontWeight:700, color:C.text, marginBottom:4 }}>{STATIONS[b.from]}</div>
              <div className="gcg-mono" style={{ fontSize:15, fontWeight:700, color:C.text }}>{b.reference}</div>
            </div>
          </div>
        </Card>

        {/* Notices */}
        <Card style={{ padding:"16px 18px", marginBottom:16, background:"#FFF6DC" }}>
          <div style={{ fontSize:15, color:"#7A5C00", lineHeight:1.9, fontWeight:500 }}>
            <div><strong>⚠️ Miss your bus?</strong> 80% of your total fare is refunded.</div>
            <div><strong>🧳 Free luggage:</strong> 2 bags up to 15kg. Extra 25kg bag = GHS {LUGGAGE_FEE}.</div>
            <div><strong>🕐 Arrive by:</strong> {fmt(arrive30)} — at least 30 min before departure.</div>
          </div>
        </Card>

        <Btn color="surface" fullWidth onClick={startOver} style={{ fontSize:16 }}>← Book another ticket</Btn>
      </div>
    );
  }
  return null;
}

/* ── Seat grid: 3 columns (1 single + 2 double), 10 rows + last row of 5 = 34 seats ── */
function SeatGrid({ avail, onPick }) {
  // Layout: col B col C (double) | aisle | col A (single on right)
  // Rows 1-10: 3 seats per row = 30 seats. Last row: 4 seats = 34 total
  // Numbering: B=left, C=middle-left, A=right (single)

  const rows = [];

  // Rows 1–10
  for (let r = 0; r < 10; r++) {
    const sB = r * 3 + 1; // double left
    const sC = r * 3 + 2; // double right
    const sA = r * 3 + 3; // single (right side)
    rows.push(
      <div key={r} style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:8 }}>
        <SeatBtn n={sB} free={avail.has(sB)} onPick={onPick} />
        <SeatBtn n={sC} free={avail.has(sC)} onPick={onPick} />
        <div style={{ width:24 }} /> {/* aisle */}
        <SeatBtn n={sA} free={avail.has(sA)} onPick={onPick} />
      </div>
    );
  }
  // Last row: 4 seats across full width (31,32,33,34)
  rows.push(
    <div key="last" style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:8, marginTop:4 }}>
      {[31,32,33,34].map(n => <SeatBtn key={n} n={n} free={avail.has(n)} onPick={onPick} />)}
    </div>
  );

  return (
    <div style={{ background:C.white, borderRadius:16, padding:"18px 14px", border:`1px solid ${C.border}` }}>
      {/* Labels */}
      <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:12 }}>
        <div style={{ width:46, textAlign:"center", fontSize:12, color:C.muted, fontWeight:700 }}>B</div>
        <div style={{ width:46, textAlign:"center", fontSize:12, color:C.muted, fontWeight:700 }}>C</div>
        <div style={{ width:24 }}/>
        <div style={{ width:46, textAlign:"center", fontSize:12, color:C.muted, fontWeight:700 }}>A</div>
      </div>
      {rows}
      <div style={{ textAlign:"center", fontSize:12, color:C.muted, marginTop:8 }}>← Front of bus</div>
    </div>
  );
}

function SeatBtn({ n, free, onPick }) {
  const clickable = free && onPick;
  return (
    <button
      disabled={!clickable}
      onClick={() => clickable && onPick(n)}
      className={clickable ? "gcg-seat" : ""}
      style={{ width:46, height:42, borderRadius:8, fontSize:13, fontWeight:700,
               border: free ? `2px solid ${C.green}` : `1.5px solid ${C.border}`,
               background: free ? "#E0FBF4" : C.surface,
               color: free ? "#06A87E" : C.border,
               cursor: clickable ? "pointer" : "default" }}>
      {n}
    </button>
  );
}
