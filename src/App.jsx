import React, { useState, useMemo } from "react";
import "./utilities.css";
import { C, GLOBAL_STYLE, Btn, Input, Card, ErrMsg, SectionLabel, Row, PageHead, TopBar, Spinner, Pill } from "./components/UI.jsx";
import { RealQr } from "./components/QrCode.jsx";
import { sb, todayStr } from "./supabase.js";

const STATIONS    = { Accra:"STC Bus Terminal, off Ring Road East, Circle, Accra", Kumasi:"Kejetia Bus Terminal, Adum, Kumasi" };
const SEAT_FEE    = 4.99;
const LUGGAGE_FEE = 10;
const TOTAL_SEATS = 48;

export default function App() {
  return (
    <div style={{ minHeight:"100vh", background:C.surface }}>
      {GLOBAL_STYLE}
      <TopBar title="Book your ticket" />
      <div style={{ maxWidth:480, margin:"0 auto", padding:"24px 16px 60px" }}>
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
  const [searching, setSearching]     = useState(false);
  const [searchErr, setSearchErr]     = useState("");
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [seatMode, setSeatMode]       = useState(null);
  const [seatNumber, setSeatNumber]   = useState(null);
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [payMethod, setPayMethod]     = useState("momo");
  const [momo, setMomo]               = useState("");
  const [luggage, setLuggage]         = useState(0);
  const [lastBooking, setLastBooking] = useState(null);
  const [error, setError]             = useState("");
  const [paying, setPaying]           = useState(false);

  const seatFeeApplies = seatMode === "choose";
  const total = useMemo(() => {
    if (!selectedTrip) return 0;
    return Number(selectedTrip.price) + (seatFeeApplies ? SEAT_FEE : 0) + luggage * LUGGAGE_FEE;
  }, [selectedTrip, seatFeeApplies, luggage]);

  async function findBuses() {
    if (from === to) { setSearchErr("Pick two different towns."); return; }
    setSearchErr(""); setSearching(true);
    try {
      const routes = await sb(`routes?origin=eq.${encodeURIComponent(from)}&destination=eq.${encodeURIComponent(to)}&select=id`);
      if (!routes.length) { setResults([]); setSearchErr("No route found for that pair yet."); setSearching(false); return; }
      const trips = await sb(`trips?route_id=eq.${routes[0].id}&travel_date=eq.${date}&select=*&order=departure_time.asc`);
      const isToday = date === todayStr();
      const nowHHMM = new Date().toTimeString().slice(0, 8);
      const upcoming = isToday ? trips.filter(t => String(t.departure_time) > nowHHMM) : trips;
      const withSeats = await Promise.all(upcoming.map(async t => {
        const bk = await sb(`bookings?trip_id=eq.${t.id}&select=seat_number`);
        return { ...t, bookedSeats: bk.map(b => b.seat_number) };
      }));
      setResults(withSeats); setStep("results");
    } catch(e) { setSearchErr("Couldn't reach the database. " + e.message); }
    finally { setSearching(false); }
  }

  function availableSeats(trip) {
    const booked = new Set(trip.bookedSeats);
    return Array.from({ length: TOTAL_SEATS }, (_, i) => i + 1).filter(s => !booked.has(s));
  }

  function goLucky() {
    const avail = availableSeats(selectedTrip);
    if (!avail.length) return;
    setSeatMode("lucky"); setSeatNumber(avail[Math.floor(Math.random() * avail.length)]); setStep("payment");
  }

  async function pay() {
    if (!name.trim())                              { setError("Enter the name that should appear on the ticket."); return; }
    if (!email.trim())                             { setError("Enter an email so we can send the PDF ticket."); return; }
    if (payMethod === "momo" && momo.trim().length < 9) { setError("Enter a valid mobile money number."); return; }
    setError(""); setPaying(true);
    const ref = "GCG-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    try {
      const inserted = await sb("bookings", {
        method: "POST",
        body: JSON.stringify({
          trip_id: selectedTrip.id, reference: ref, passenger_name: name.trim(),
          email: email.trim(), seat_number: seatNumber, seat_fee: seatFeeApplies ? SEAT_FEE : 0,
          luggage_bags: luggage, luggage_fee: luggage * LUGGAGE_FEE, base_price: selectedTrip.price,
          total, pay_method: payMethod, momo_number: payMethod === "momo" ? momo.trim() : null,
        }),
      });
      setLastBooking({ ...inserted[0], from, to, time: selectedTrip.departure_time, travelDate: date });
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
    setName(""); setEmail(""); setMomo(""); setLuggage(0); setLastBooking(null); setError("");
  }

  /* ── SEARCH ── */
  if (step === "search") return (
    <div>
      <div style={{ background:C.navy, borderRadius:20, padding:"28px 24px 24px", marginBottom:20 }}>
        <div style={{ color:C.yellow, fontSize:12, fontWeight:700, letterSpacing:1.2, marginBottom:6 }}>BOOK YOUR SEAT</div>
        <div style={{ color:C.white, fontSize:26, fontWeight:800, lineHeight:1.2, marginBottom:4 }}>
          Where are you<br/>headed today?
        </div>
        <div style={{ color:"rgba(255,255,255,0.5)", fontSize:13 }}>GHS 160 per seat</div>
      </div>
      <Card style={{ marginBottom:16 }}>
        <div style={{ position:"relative" }}>
          <div style={{ padding:"14px 16px 10px", borderBottom:`1px solid ${C.surface}` }}>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>FROM</div>
            <select value={from} onChange={e=>setFrom(e.target.value)}
              style={{ fontSize:16, fontWeight:700, color:C.text, border:"none", background:"transparent", outline:"none", width:"100%", cursor:"pointer" }}>
              <option>Accra</option><option>Kumasi</option>
            </select>
          </div>
          <div style={{ padding:"14px 16px 10px" }}>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>TO</div>
            <select value={to} onChange={e=>setTo(e.target.value)}
              style={{ fontSize:16, fontWeight:700, color:C.text, border:"none", background:"transparent", outline:"none", width:"100%", cursor:"pointer" }}>
              <option>Accra</option><option>Kumasi</option>
            </select>
          </div>
          <button className="gcg-btn" onClick={() => { setFrom(to); setTo(from); }}
            style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)",
                     width:34, height:34, borderRadius:"50%", background:C.orange,
                     color:C.white, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>⇅</button>
        </div>
        <div style={{ padding:"14px 16px", borderTop:`1px solid ${C.surface}` }}>
          <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>DATE</div>
          <input type="date" value={date} min={todayStr()} onChange={e=>setDate(e.target.value)}
            style={{ fontSize:16, fontWeight:700, color:C.text, border:"none", background:"transparent", outline:"none", width:"100%", cursor:"pointer" }} />
        </div>
      </Card>
      <ErrMsg msg={searchErr} />
      <Btn color="orange" size="lg" fullWidth disabled={searching} onClick={findBuses}>
        {searching ? <><Spinner color={C.white}/> Searching…</> : "Find a bus →"}
      </Btn>
      <div style={{ marginTop:14, fontSize:12.5, color:C.muted, lineHeight:1.7, textAlign:"center" }}>
        2 bags up to 15kg ride free · Extra 25kg bag GHS {LUGGAGE_FEE}
      </div>
    </div>
  );

  /* ── RESULTS ── */
  if (step === "results") return (
    <div>
      <PageHead onBack={() => setStep("search")} title={`${from} → ${to}`} sub={`${date} · ${results.length} buses available`} />
      {results.length === 0 && (
        <Card style={{ padding:"24px 20px", textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🚌</div>
          <div style={{ fontWeight:700, color:C.text, marginBottom:4 }}>
            {date === todayStr() ? "No more buses today" : "No buses on this date"}
          </div>
          <div style={{ fontSize:13, color:C.muted }}>
            {date === todayStr() ? "All departures today have passed. Try a future date." : "No trips scheduled yet. Try another date."}
          </div>
        </Card>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {results.map(trip => {
          const left = TOTAL_SEATS - trip.bookedSeats.length;
          const soldOut = left === 0;
          return (
            <Card key={trip.id} accent={soldOut ? C.border : C.orange}>
              <div style={{ padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:30, fontWeight:800, color:C.text, lineHeight:1 }}>{String(trip.departure_time).slice(0,5)}</div>
                  <div style={{ marginTop:6 }}>
                    {soldOut ? <Pill color="red" text="Sold out"/> : <Pill color="green" text={`${left} seats left`}/>}
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:C.text }}>GHS {trip.price}</div>
                  <div style={{ marginTop:10 }}>
                    <Btn color={soldOut?"surface":"orange"} size="sm" disabled={soldOut}
                      onClick={() => { setSelectedTrip(trip); setSeatMode(null); setSeatNumber(null); setStep("seats"); }}>
                      {soldOut ? "Full" : "Select →"}
                    </Btn>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  /* ── SEATS ── */
  if (step === "seats" && selectedTrip) {
    const avail = new Set(availableSeats(selectedTrip));
    return (
      <div>
        <PageHead onBack={() => setStep("results")} title="Choose your seat"
          sub={`${from} → ${to} · ${String(selectedTrip.departure_time).slice(0,5)}`} />
        <ErrMsg msg={error} />
        {!seatMode && (
          <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:8 }}>
            <button className="gcg-btn" onClick={goLucky}
              style={{ background:C.navy, color:C.white, borderRadius:16, padding:"20px",
                       display:"flex", justifyContent:"space-between", alignItems:"center", textAlign:"left" }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>🍀 I'm feeling lucky</div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.55)" }}>We'll pick an available seat for you</div>
              </div>
              <Pill color="green" text="FREE"/>
            </button>
            <button className="gcg-btn" onClick={() => setSeatMode("choose")}
              style={{ background:C.white, color:C.text, border:`2px solid ${C.border}`, borderRadius:16, padding:"20px",
                       display:"flex", justifyContent:"space-between", alignItems:"center", textAlign:"left" }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>🎯 Choose your own seat</div>
                <div style={{ fontSize:13, color:C.muted }}>Pick exactly where you sit</div>
              </div>
              <Pill color="yellow" text={`+GHS ${SEAT_FEE.toFixed(2)}`}/>
            </button>
          </div>
        )}
        {seatMode === "choose" && (
          <div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:14, textAlign:"center" }}>Front of the bus is at the top. Tap an open seat.</div>
            <SeatGrid avail={avail} onPick={seat => { setSeatNumber(seat); setStep("payment"); }} />
            <div style={{ display:"flex", gap:16, justifyContent:"center", marginTop:12, fontSize:12.5, color:C.muted }}>
              <span><span style={{ display:"inline-block", width:12, height:12, borderRadius:4, background:"#E0FBF4", border:`2px solid ${C.green}`, verticalAlign:-2, marginRight:5 }}/>Available</span>
              <span><span style={{ display:"inline-block", width:12, height:12, borderRadius:4, background:"#F0F2F5", border:`1.5px solid ${C.border}`, verticalAlign:-2, marginRight:5 }}/>Taken</span>
            </div>
            <div style={{ marginTop:16 }}>
              <Btn color="surface" fullWidth onClick={() => setSeatMode(null)}>← Back to seat options</Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── PAYMENT ── */
  if (step === "payment" && selectedTrip) return (
    <div>
      <PageHead onBack={() => setStep("seats")} title="Passenger details"
        sub={`${from} → ${to} · ${String(selectedTrip.departure_time).slice(0,5)} · Seat ${seatNumber}`} />
      <Card style={{ padding:"16px 20px", marginBottom:14 }} accent={C.yellow}>
        <SectionLabel>Booking summary</SectionLabel>
        <Row label="Ticket" value={`GHS ${Number(selectedTrip.price).toFixed(2)}`} />
        {seatFeeApplies && <Row label="Seat selection fee" value={`GHS ${SEAT_FEE.toFixed(2)}`} />}
        {luggage > 0 && <Row label={`Extra luggage ×${luggage}`} value={`GHS ${(luggage * LUGGAGE_FEE).toFixed(2)}`} />}
        <div style={{ borderTop:`1px solid ${C.surface}`, marginTop:8, paddingTop:8 }}>
          <Row label={`Total — Seat ${seatNumber}`} value={`GHS ${total.toFixed(2)}`} bold large />
        </div>
      </Card>
      <Card style={{ padding:"16px 20px", marginBottom:14 }}>
        <SectionLabel>Your details</SectionLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name (as on ID)" />
          <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" type="email" />
        </div>
        <div style={{ marginTop:16 }}>
          <SectionLabel>Extra luggage (25kg bags, GHS {LUGGAGE_FEE} each)</SectionLabel>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <Btn color="surface" size="sm" onClick={()=>setLuggage(n=>Math.max(0,n-1))}>−</Btn>
            <span style={{ fontSize:18, fontWeight:700, width:24, textAlign:"center" }}>{luggage}</span>
            <Btn color="surface" size="sm" onClick={()=>setLuggage(n=>Math.min(4,n+1))}>+</Btn>
            <span style={{ fontSize:12, color:C.muted }}>2 bags up to 15kg are free</span>
          </div>
        </div>
      </Card>
      <Card style={{ padding:"16px 20px", marginBottom:16 }}>
        <SectionLabel>Payment method</SectionLabel>
        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          {["momo","card"].map(m => (
            <button key={m} className="gcg-btn" onClick={()=>setPayMethod(m)}
              style={{ flex:1, padding:"11px", borderRadius:10, fontSize:14, fontWeight:600,
                       background:payMethod===m?C.navy:C.surface, color:payMethod===m?C.white:C.text }}>
              {m==="momo" ? "Mobile Money" : "Card"}
            </button>
          ))}
        </div>
        {payMethod === "momo"
          ? <Input value={momo} onChange={e=>setMomo(e.target.value)} placeholder="MoMo number e.g. 024 123 4567" />
          : <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Input placeholder="Card number"/><Input placeholder="MM/YY"/>
            </div>
        }
      </Card>
      <ErrMsg msg={error} />
      <Btn color="orange" size="lg" fullWidth disabled={paying} onClick={pay}>
        {paying ? <><Spinner color={C.white}/> Processing…</> : `Pay GHS ${total.toFixed(2)} →`}
      </Btn>
    </div>
  );

  /* ── TICKET ── */
  if (step === "ticket" && lastBooking) {
    const b = lastBooking;
    const [h,m] = String(b.time).split(":").map(Number);
    const dep = new Date(); dep.setHours(h,m,0,0);
    const arrive = new Date(dep.getTime() - 30 * 60000);
    const fmt = d => d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    return (
      <div>
        <div style={{ background:C.green, borderRadius:20, padding:"24px 20px", marginBottom:20, textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:6 }}>✓</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.navy }}>You're booked!</div>
          <div style={{ fontSize:13, color:C.navy, opacity:0.7, marginTop:4 }}>PDF ticket sent to {b.email}</div>
        </div>
        <Card style={{ marginBottom:16, overflow:"hidden" }}>
          <div style={{ padding:"20px 20px 16px", background:C.navy }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600, letterSpacing:1.2, marginBottom:8 }}>BOARDING PASS</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:24, fontWeight:800, color:C.white }}>{b.from}</div>
                <div style={{ color:C.orange, fontSize:14, fontWeight:700, margin:"4px 0" }}>→</div>
                <div style={{ fontSize:24, fontWeight:800, color:C.white }}>{b.to}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600, letterSpacing:1 }}>SEAT</div>
                <div style={{ fontSize:52, fontWeight:900, color:C.yellow, lineHeight:1 }}>{b.seat_number}</div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:16 }}>
              {[["PASSENGER",b.passenger_name,false],["REFERENCE",b.reference,true],
                ["DATE",b.travelDate,false],["DEPARTS",String(b.time).slice(0,5),false],
                ["BE THERE BY",fmt(arrive),false],["PAID",`GHS ${Number(b.total).toFixed(2)}`,false]
              ].map(([lbl,val,mono]) => (
                <div key={lbl}>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontWeight:600, letterSpacing:1, marginBottom:2 }}>{lbl}</div>
                  <div className={mono?"gcg-mono":""} style={{ fontSize:mono?12:13.5, fontWeight:600, color:C.white, wordBreak:"break-all" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height:1, borderTop:"2px dashed rgba(0,0,0,0.08)", margin:"0 16px" }}/>
          <div style={{ padding:"16px 20px", display:"flex", gap:16, alignItems:"center" }}>
            <RealQr value={`${window.location.origin}/conductor?scan=${b.reference}`} size={108}/>
            <div style={{ fontSize:12.5, color:C.muted, lineHeight:1.6 }}>
              <div style={{ fontWeight:700, color:C.text, marginBottom:4 }}>{STATIONS[b.from]}</div>
              {b.luggage_bags > 0 && <div>{b.luggage_bags} extra 25kg bag(s) included</div>}
              <div style={{ marginTop:4 }}>via {b.pay_method==="momo"?"mobile money":"card"}</div>
            </div>
          </div>
        </Card>
        <Card style={{ padding:"14px 18px", marginBottom:20, background:"#FFF6DC" }}>
          <div style={{ fontSize:13, color:"#7A5C00", lineHeight:1.7 }}>
            <strong>⚠ Miss your bus?</strong> 80% of your total fare is refunded.<br/>
            <strong>🧳 Free luggage:</strong> 2 bags up to 15kg. Extra 25kg bag = GHS {LUGGAGE_FEE}.
          </div>
        </Card>
        <Btn color="surface" fullWidth onClick={startOver}>← Book another ticket</Btn>
      </div>
    );
  }
  return null;
}

function SeatGrid({ avail, onPick }) {
  const rows = [];
  for (let r=0; r<12; r++) {
    const cells = [];
    for (let c=0; c<4; c++) {
      const n=r*4+c+1; const free=avail.has(n);
      if (c===2) cells.push(<div key={`a${r}`} style={{width:12}}/>);
      cells.push(
        <button key={n} disabled={!free} onClick={()=>onPick(n)} className="gcg-seat"
          style={{ width:40, height:36, borderRadius:8, fontSize:12, fontWeight:600,
                   border:free?`2px solid ${C.green}`:`1.5px solid ${C.border}`,
                   background:free?"#E0FBF4":C.surface, color:free?"#06A87E":C.border,
                   cursor:free?"pointer":"not-allowed" }}>{n}</button>
      );
    }
    rows.push(<div key={r} style={{display:"flex",gap:6,justifyContent:"center",marginBottom:6}}>{cells}</div>);
  }
  return <div style={{background:C.white,borderRadius:16,padding:14,border:`1px solid ${C.border}`}}>{rows}</div>;
}
