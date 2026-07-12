import React, { useState, useEffect, useCallback } from "react";
import Login from "./Login.jsx";
import { C, Btn, Input, Card, ErrMsg, SectionLabel, TopBar, Spinner, Pill } from "../components/UI.jsx";
import { sb, todayStr, getSession, setSession, signOut } from "../supabase.js";

const TICKET_PRICE = 160;
const TOTAL_SEATS  = 34;
const SUPABASE_URL      = "https://nhsgyenuuemahkkhqugb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oc2d5ZW51dWVtYWhra2hxdWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzAwMjQsImV4cCI6MjA5NzAwNjAyNH0.ST3EjGIwDU91bM8NxCoMwGXKE2ve916MkWJMwstyFJk";
let SUPABASE_SERVICE_KEY = "";

export default function AdminPage() {
  const [session, setLocalSession] = useState(null);
  const [checked, setChecked]      = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s) { setLocalSession(s); SUPABASE_SERVICE_KEY = s.access_token; }
    setChecked(true);
  }, []);

  async function handleLogout() { await signOut(); setLocalSession(null); }

  if (!checked) return null;
  if (!session) return <Login expectedRole="admin" onSuccess={(s) => { setSession(s); setLocalSession(s); SUPABASE_SERVICE_KEY = s.access_token; }} />;

  return (
    <div style={{ minHeight:"100vh", background:C.surface }}>
      <TopBar title="Admin Portal" onLogout={handleLogout} />
      <div style={{ maxWidth:600, margin:"0 auto", padding:"28px 16px 60px" }}>
        <AdminDashboard session={session} />
      </div>
    </div>
  );
}

function AdminDashboard({ session }) {
  const [tab, setTab] = useState("trips");
  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:26, fontWeight:800, color:C.text }}>Operator dashboard</div>
        <div style={{ fontSize:14, color:C.muted, marginTop:2 }}>Manage trips, vehicles and accounts</div>
      </div>
      <div style={{ display:"flex", gap:10, marginBottom:24, flexWrap:"wrap" }}>
        {[["trips","🚌 Trips"],["accounts","👤 Accounts"]].map(([id,label]) => (
          <button key={id} className="gcg-btn" onClick={()=>setTab(id)}
            style={{ padding:"10px 20px", borderRadius:10, fontSize:15, fontWeight:700,
                     background:tab===id?C.navy:C.white, color:tab===id?C.white:C.muted,
                     border:tab===id?"none":`1.5px solid ${C.border}` }}>
            {label}
          </button>
        ))}
      </div>
      {tab === "trips"    && <TripsManager />}
      {tab === "accounts" && <AccountsManager session={session} />}
    </div>
  );
}

function TripsManager() {
  const [routes,setRoutes]     = useState([]);
  const [upcoming,setUpcoming] = useState([]);
  const [ongoing,setOngoing]   = useState([]);
  const [archive,setArchive]   = useState([]);
  const [bookingData,setBD]    = useState({});
  const [totals,setTotals]     = useState({trips:0,seats:0,revenue:0});
  const [loading,setLoading]   = useState(true);
  const [err,setErr]           = useState("");

  // Add trip form
  const [newRouteId,setNewRouteId] = useState("");
  const [newDate,setNewDate]       = useState(todayStr());
  const [newTime,setNewTime]       = useState("");
  const [newPrice,setNewPrice]     = useState(TICKET_PRICE);
  const [newCar,setNewCar]         = useState("");
  const [newDriver,setNewDriver]   = useState("");
  const [newDriverPhone,setNewDriverPhone] = useState("");
  const [adding,setAdding]         = useState(false);
  const [showAddForm,setShowAddForm] = useState(false);

  // Trip detail modal
  const [detailTrip,setDetailTrip] = useState(null);

  // Edit / delete
  const [editingId,setEditingId]   = useState(null);
  const [editPrice,setEditPrice]   = useState("");
  const [savingId,setSavingId]     = useState(null);
  const [confirmDeleteId,setConfirmDeleteId] = useState(null);
  const [deletingId,setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [r,allTrips,b] = await Promise.all([
        sb("routes?select=*"),
        sb("trips?select=*&order=travel_date.asc,departure_time.asc"),
        sb("bookings?select=trip_id,total,checked_in"),
      ]);
      setRoutes(r);

      const nowDate = todayStr();
      const nowTime = new Date().toTimeString().slice(0,8);

      const up=[],og=[],ar=[];
      allTrips.forEach(t => {
        const isPast = t.travel_date < nowDate || (t.travel_date === nowDate && String(t.departure_time) < nowTime);
        if (t.arrived_at) ar.push(t);
        else if (t.departed_at && !t.arrived_at) og.push(t);
        else if (isPast) ar.push(t); // time passed, not departed = archived
        else up.push(t);
      });
      setUpcoming(up); setOngoing(og); setArchive(ar);

      const bd={}; let rev=0;
      b.forEach(bk => {
        if (!bd[bk.trip_id]) bd[bk.trip_id]={count:0,revenue:0,checkedIn:0};
        bd[bk.trip_id].count++; bd[bk.trip_id].revenue+=Number(bk.total); rev+=Number(bk.total);
        if (bk.checked_in) bd[bk.trip_id].checkedIn++;
      });
      setBD(bd); setTotals({trips:allTrips.length,seats:b.length,revenue:rev});
      if (r.length&&!newRouteId) setNewRouteId(String(r[0].id));
    } catch(e) { setErr("Couldn't load data. "+e.message); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  async function addTrip() {
    if (!newTime||!newRouteId||!newCar||!newDriver||!newDriverPhone) {
      setErr("Please fill in all fields including car number, driver name and phone."); return;
    }
    setAdding(true); setErr("");
    try {
      await sb("trips",{ method:"POST", body:JSON.stringify({
        route_id:Number(newRouteId), travel_date:newDate, departure_time:newTime,
        price:Number(newPrice)||TICKET_PRICE, total_seats:TOTAL_SEATS,
        car_number:newCar.toUpperCase(), driver_name:newDriver, driver_phone:newDriverPhone,
      }) });
      setNewTime(""); setNewCar(""); setNewDriver(""); setNewDriverPhone(""); setShowAddForm(false);
      await load();
    } catch(e) { setErr("Couldn't add trip. "+e.message); }
    finally { setAdding(false); }
  }

  async function savePrice(id) {
    const p=Number(editPrice); if (!p||p<=0) return;
    setSavingId(id);
    try {
      await sb(`trips?id=eq.${id}`,{ method:"PATCH", prefer:"return=minimal", body:JSON.stringify({price:p}) });
      setEditingId(null); await load();
    } catch(e) { setErr("Couldn't update price. "+e.message); }
    finally { setSavingId(null); }
  }

  async function deleteTrip(id) {
    setDeletingId(id);
    try {
      await sb(`bookings?trip_id=eq.${id}`,{ method:"DELETE", prefer:"return=minimal" });
      await sb(`trips?id=eq.${id}`,{ method:"DELETE", prefer:"return=minimal" });
      setConfirmDeleteId(null); await load();
    } catch(e) { setErr("Couldn't delete trip. "+e.message); }
    finally { setDeletingId(null); }
  }

  const rLabel = id => { const r=routes.find(rt=>rt.id===id); return r?`${r.origin} → ${r.destination}`:"—"; };

  if (loading) return <div style={{display:"flex",justifyContent:"center",padding:60}}><Spinner color={C.navy} size={28}/></div>;

  return (
    <div>
      <ErrMsg msg={err} />

      {/* Metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:24 }}>
        <MetricCard label="Total trips" value={totals.trips} color={C.orange} />
        <MetricCard label="Seats sold" value={totals.seats} color={C.green} />
        <MetricCard label="Revenue GHS" value={totals.revenue.toFixed(0)} color={C.yellow} dark />
      </div>

      {/* Add trip button at top */}
      <div style={{ marginBottom:24 }}>
        <Btn color="navy" onClick={()=>setShowAddForm(!showAddForm)} fullWidth style={{ fontSize:16 }}>
          {showAddForm ? "✕ Cancel" : "+ Add a new trip"}
        </Btn>
        {showAddForm && (
          <Card style={{ padding:"20px", marginTop:12 }} accent={C.navy}>
            <SectionLabel>New trip details</SectionLabel>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <select value={newRouteId} onChange={e=>setNewRouteId(e.target.value)}
                style={{ fontSize:15,fontWeight:500,padding:"12px 14px",borderRadius:10,
                         border:`1.5px solid ${C.border}`,color:C.text,background:C.white,outline:"none" }}>
                {routes.map(r=><option key={r.id} value={r.id}>{r.origin} → {r.destination}</option>)}
              </select>
              <Input type="date" value={newDate} min={todayStr()} onChange={e=>setNewDate(e.target.value)} style={{ fontSize:15 }} />
              <Input type="time" value={newTime} onChange={e=>setNewTime(e.target.value)} style={{ fontSize:15 }} />
              <Input type="number" value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="Price (GHS)" style={{ fontSize:15 }} />
              <Input value={newCar} onChange={e=>setNewCar(e.target.value)} placeholder="Car number plate e.g. GR-1234-22" style={{ fontSize:15 }} />
              <Input value={newDriver} onChange={e=>setNewDriver(e.target.value)} placeholder="Driver full name" style={{ fontSize:15 }} />
              <Input value={newDriverPhone} onChange={e=>setNewDriverPhone(e.target.value)} placeholder="Driver phone number" type="tel" style={{ fontSize:15 }} />
              <Btn color="orange" fullWidth disabled={adding} onClick={addTrip} style={{ fontSize:16 }}>
                {adding?<><Spinner/>Adding…</>:"Add trip"}
              </Btn>
            </div>
          </Card>
        )}
      </div>

      {/* Ongoing trips */}
      {ongoing.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <SectionLabel>🟢 Currently underway</SectionLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {ongoing.map(t => <TripCard key={t.id} t={t} bd={bookingData[t.id]||{count:0,revenue:0,checkedIn:0}}
              rLabel={rLabel} onDetail={()=>setDetailTrip(t)} type="ongoing" onRefresh={load} setErr={setErr} />)}
          </div>
        </div>
      )}

      {/* Upcoming trips */}
      <div style={{ marginBottom:24 }}>
        <SectionLabel>Upcoming trips</SectionLabel>
        {upcoming.length===0 && <div style={{color:C.muted,fontSize:14,marginBottom:12}}>No upcoming trips. Add one above.</div>}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {upcoming.map(t => (
            <TripCard key={t.id} t={t} bd={bookingData[t.id]||{count:0,revenue:0,checkedIn:0}}
              rLabel={rLabel} onDetail={()=>setDetailTrip(t)} type="upcoming" onRefresh={load} setErr={setErr}
              editingId={editingId} setEditingId={setEditingId} editPrice={editPrice} setEditPrice={setEditPrice}
              savingId={savingId} onSavePrice={savePrice}
              confirmDeleteId={confirmDeleteId} setConfirmDeleteId={setConfirmDeleteId}
              deletingId={deletingId} onDelete={deleteTrip} />
          ))}
        </div>
      </div>

      {/* Archive */}
      {archive.length > 0 && (
        <details style={{ marginBottom:24 }}>
          <summary style={{ fontSize:14, fontWeight:700, color:C.muted, cursor:"pointer", marginBottom:12, letterSpacing:1 }}>
            TRIP ARCHIVE ({archive.length})
          </summary>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:10 }}>
            {archive.map(t => <TripCard key={t.id} t={t} bd={bookingData[t.id]||{count:0,revenue:0,checkedIn:0}}
              rLabel={rLabel} onDetail={()=>setDetailTrip(t)} type="archive" onRefresh={load} setErr={setErr} />)}
          </div>
        </details>
      )}

      {/* Trip detail modal */}
      {detailTrip && (
        <TripDetailModal trip={detailTrip} bd={bookingData[detailTrip.id]||{count:0,revenue:0,checkedIn:0}}
          rLabel={rLabel} onClose={()=>setDetailTrip(null)} />
      )}
    </div>
  );
}

function TripCard({ t, bd, rLabel, onDetail, type, onRefresh, setErr,
  editingId, setEditingId, editPrice, setEditPrice, savingId, onSavePrice,
  confirmDeleteId, setConfirmDeleteId, deletingId, onDelete }) {

  const depTime   = String(t.departure_time).slice(0,5);
  const isDelayed = t.departed_at && !t.arrived_at &&
    (new Date(t.departed_at) - new Date(`${t.travel_date}T${t.departure_time}`) > 2 * 60000);
  const pct = Math.round(bd.count / TOTAL_SEATS * 100);
  const isEditing    = editingId === t.id;
  const isConfirming = confirmDeleteId === t.id;
  const accentColor  = type==="ongoing" ? C.green : type==="archive" ? C.border : C.orange;

  return (
    <Card accent={accentColor}>
      <div style={{ padding:"16px 18px" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <div>
            <div style={{ fontWeight:800, color:C.text, fontSize:16 }}>{rLabel(t.route_id)}</div>
            <div style={{ fontSize:14, color:C.muted, marginTop:2 }}>
              {t.travel_date} · <strong style={{color:C.text}}>{depTime}</strong>
              {t.car_number && <span style={{ marginLeft:8 }}>· 🚌 {t.car_number}</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"flex-end" }}>
            {isDelayed && <Pill color="red" text="⚠ DELAYED" />}
            {type==="ongoing" && <Pill color="green" text="Underway" />}
            {type==="archive" && <Pill color="orange" text={t.arrived_at?"Arrived":"Completed"} />}
          </div>
        </div>

        {/* Seat fill bar */}
        <div style={{ height:6, background:C.surface, borderRadius:99, marginBottom:6 }}>
          <div style={{ width:`${pct}%`, height:"100%", borderRadius:99, transition:"width 0.4s",
            background: bd.count>=TOTAL_SEATS ? C.red : bd.count>TOTAL_SEATS*0.7 ? C.yellow : C.green }}/>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:C.muted, marginBottom:10 }}>
          <span>{bd.count}/{TOTAL_SEATS} booked · {bd.checkedIn} boarded</span>
          <span>GHS {bd.revenue.toFixed(2)}</span>
        </div>

        {/* Action buttons */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <Btn color="surface" size="sm" onClick={onDetail} style={{ fontSize:13 }}>📋 Details</Btn>
          {type==="upcoming" && !isEditing && (
            <>
              <Btn color="surface" size="sm" onClick={()=>{setEditingId(t.id);setEditPrice(String(t.price));setConfirmDeleteId(null);}} style={{ fontSize:13 }}>
                ✏ GHS {t.price}
              </Btn>
              {isConfirming ? (
                <>
                  <Btn color="surface" size="sm" style={{color:C.red,fontWeight:700,fontSize:13}}
                    disabled={deletingId===t.id} onClick={()=>onDelete(t.id)}>
                    {deletingId===t.id?<Spinner color={C.red}/>:"Yes, delete"}
                  </Btn>
                  <Btn color="surface" size="sm" onClick={()=>setConfirmDeleteId(null)} style={{ fontSize:13 }}>Cancel</Btn>
                </>
              ) : (
                <Btn color="surface" size="sm" style={{color:C.red,fontSize:13}}
                  onClick={()=>{setConfirmDeleteId(t.id);setEditingId(null);}}>🗑 Remove</Btn>
              )}
            </>
          )}
        </div>

        {isConfirming && (
          <div style={{marginTop:10,fontSize:13,color:C.red,background:"#FFE5E9",padding:"8px 12px",borderRadius:8}}>
            ⚠ This will also delete {bd.count} booking{bd.count!==1?"s":""} on this trip. Are you sure?
          </div>
        )}

        {isEditing && (
          <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center"}}>
            <input type="number" value={editPrice} onChange={e=>setEditPrice(e.target.value)}
              placeholder="New price (GHS)"
              style={{flex:1,fontSize:14,fontWeight:500,padding:"9px 12px",borderRadius:8,
                      border:`1.5px solid ${C.orange}`,outline:"none",color:C.text}} />
            <Btn color="orange" size="sm" disabled={savingId===t.id} onClick={()=>onSavePrice(t.id)}>
              {savingId===t.id?<Spinner color={C.white}/>:"Save"}
            </Btn>
            <Btn color="surface" size="sm" onClick={()=>setEditingId(null)}>Cancel</Btn>
          </div>
        )}
      </div>
    </Card>
  );
}

function TripDetailModal({ trip, bd, rLabel, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000,
                  display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:C.white, borderRadius:"20px 20px 0 0", padding:"28px 24px 40px",
                    width:"100%", maxWidth:560, maxHeight:"85vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontSize:20, fontWeight:800, color:C.text }}>Trip details</div>
          <Btn color="surface" size="sm" onClick={onClose}>✕ Close</Btn>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <DetailRow label="Route"       value={rLabel(trip.route_id)} />
          <DetailRow label="Date"        value={trip.travel_date} />
          <DetailRow label="Departure"   value={String(trip.departure_time).slice(0,5)} />
          <DetailRow label="Price"       value={`GHS ${trip.price}`} />
          <DetailRow label="Car number"  value={trip.car_number || "—"} />
          <DetailRow label="Driver"      value={trip.driver_name || "—"} />
          <DetailRow label="Driver phone" value={trip.driver_phone || "—"} />
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
            <DetailRow label="Seats booked"  value={`${bd.count} / 34`} />
            <DetailRow label="Checked in"    value={`${bd.checkedIn} boarded`} />
            <DetailRow label="Revenue"       value={`GHS ${bd.revenue.toFixed(2)}`} />
          </div>
          {trip.departed_at && <DetailRow label="Departed at" value={new Date(trip.departed_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} />}
          {trip.arrived_at  && <DetailRow label="Arrived at"  value={new Date(trip.arrived_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} />}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${C.surface}` }}>
      <span style={{ fontSize:14, color:C.muted }}>{label}</span>
      <span style={{ fontSize:14, fontWeight:700, color:C.text }}>{value}</span>
    </div>
  );
}

function MetricCard({ label, value, color, dark }) {
  return (
    <div style={{ background:color, borderRadius:14, padding:"16px" }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, color:dark?C.navy:"rgba(255,255,255,0.7)", marginBottom:6 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize:26, fontWeight:900, color:dark?C.navy:C.white }}>{value}</div>
    </div>
  );
}

function AccountsManager({ session }) {
  const [users,setUsers]       = useState([]);
  const [loading,setLoading]   = useState(true);
  const [err,setErr]           = useState("");
  const [newEmail,setNewEmail] = useState("");
  const [newRole,setNewRole]   = useState("conductor");
  const [adding,setAdding]     = useState(false);
  const [success,setSuccess]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setUsers(await sb("user_roles?select=user_id,role")); }
    catch(e) { setErr("Couldn't load accounts. "+e.message); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  async function addAccount() {
    if (!newEmail.trim()) { setErr("Enter an email address."); return; }
    setAdding(true); setErr(""); setSuccess("");
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method:"POST",
        headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`,
                  "Content-Type":"application/json" },
        body:JSON.stringify({ email:newEmail.trim(), password:newRole==="conductor"?"c12345":"a12345", email_confirm:true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message||"Could not create user");
      await sb("user_roles",{ method:"POST", body:JSON.stringify({user_id:data.id,role:newRole}) });
      setSuccess(`✓ Account created for ${newEmail.trim()} · Default password: ${newRole==="conductor"?"c12345":"a12345"}`);
      setNewEmail(""); await load();
    } catch(e) { setErr("Couldn't create account. "+e.message); }
    finally { setAdding(false); }
  }

  return (
    <div>
      <ErrMsg msg={err} />
      {success && <div style={{background:"#E0FBF4",color:"#06A87E",fontSize:14,fontWeight:500,padding:"12px 14px",borderRadius:10,marginBottom:16}}>{success}</div>}
      <SectionLabel>Current accounts</SectionLabel>
      {loading ? <div style={{display:"flex",justifyContent:"center",padding:32}}><Spinner color={C.navy}/></div>
        : <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
            {users.map(u=>(
              <Card key={u.user_id} style={{padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div className="gcg-mono" style={{fontSize:13,color:C.muted}}>{u.user_id.slice(0,18)}…</div>
                <Pill color={u.role==="admin"?"orange":"green"} text={u.role} />
              </Card>
            ))}
          </div>
      }
      <Card style={{padding:"20px 22px"}} accent={C.orange}>
        <SectionLabel>Add new account</SectionLabel>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Input value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="Email address" type="email" style={{fontSize:15}} />
          <div style={{display:"flex",gap:10}}>
            {["conductor","admin"].map(r=>(
              <button key={r} className="gcg-btn" onClick={()=>setNewRole(r)}
                style={{flex:1,padding:"12px",borderRadius:10,fontSize:15,fontWeight:700,
                        background:newRole===r?C.navy:C.surface,color:newRole===r?C.white:C.muted}}>
                {r.charAt(0).toUpperCase()+r.slice(1)}
              </button>
            ))}
          </div>
          <div style={{fontSize:13,color:C.muted,background:C.surface,padding:"10px 14px",borderRadius:8}}>
            Default password: <strong>{newRole==="conductor"?"c12345":"a12345"}</strong>
          </div>
          <Btn color="orange" fullWidth disabled={adding} onClick={addAccount} style={{fontSize:16}}>
            {adding?<><Spinner color={C.white}/>Creating…</>:"+ Create account"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
