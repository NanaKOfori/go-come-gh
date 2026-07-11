import React, { useState, useEffect, useCallback } from "react";
import Login from "./Login.jsx";
import { C, Btn, Input, Card, ErrMsg, SectionLabel, PageHead, TopBar, Spinner, Pill } from "../components/UI.jsx";
import { sb, todayStr, getSession, setSession, signOut } from "../supabase.js";

const TICKET_PRICE = 160;
const TOTAL_SEATS  = 48;
const SUPABASE_URL      = "https://nhsgyenuuemahkkhqugb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oc2d5ZW51dWVtYWhra2hxdWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzAwMjQsImV4cCI6MjA5NzAwNjAyNH0.ST3EjGIwDU91bM8NxCoMwGXKE2ve916MkWJMwstyFJk";

export default function AdminPage() {
  const [session, setLocalSession] = useState(null);
  const [checked, setChecked]      = useState(false);

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
    return <Login expectedRole="admin" onSuccess={(s) => { setSession(s); setLocalSession(s); }} />;
  }

  return (
    <div style={{ minHeight:"100vh", background:C.surface }}>
      <TopBar title="Admin Portal" onLogout={handleLogout} />
      <div style={{ maxWidth:560, margin:"0 auto", padding:"28px 16px 60px" }}>
        <AdminDashboard session={session} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, dark }) {
  return (
    <div style={{ background:color, borderRadius:14, padding:"14px 16px" }}>
      <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:1, color:dark?C.navy:"rgba(255,255,255,0.7)", marginBottom:4 }}>
        {typeof label==="string" ? label.toUpperCase() : label}
      </div>
      <div style={{ fontSize:24, fontWeight:900, color:dark?C.navy:C.white }}>{value}</div>
    </div>
  );
}

function AdminDashboard({ session }) {
  const [tab, setTab] = useState("trips"); // trips | accounts

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:24, fontWeight:800, color:C.text }}>Operator dashboard</div>
        <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>Manage trips, prices and accounts</div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:24 }}>
        {[["trips","🚌 Trips"],["accounts","👤 Accounts"]].map(([id,label]) => (
          <button key={id} className="gcg-btn" onClick={()=>setTab(id)}
            style={{ padding:"9px 18px", borderRadius:10, fontSize:13.5, fontWeight:700,
                     background: tab===id ? C.navy : C.white,
                     color: tab===id ? C.white : C.muted,
                     border: tab===id ? "none" : `1.5px solid ${C.border}` }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "trips"    && <TripsManager />}
      {tab === "accounts" && <AccountsManager session={session} />}
    </div>
  );
}

/* ── Trips manager ── */
function TripsManager() {
  const [routes,setRoutes]           = useState([]);
  const [trips,setTrips]             = useState([]);
  const [bookingCounts,setBK]        = useState({});
  const [totals,setTotals]           = useState({trips:0,seats:0,revenue:0});
  const [loading,setLoading]         = useState(true);
  const [err,setErr]                 = useState("");
  const [newRouteId,setNewRouteId]   = useState("");
  const [newDate,setNewDate]         = useState(todayStr());
  const [newTime,setNewTime]         = useState("");
  const [newPrice,setNewPrice]       = useState(TICKET_PRICE);
  const [adding,setAdding]           = useState(false);
  const [deletingId,setDeletingId]   = useState(null);
  const [confirmDeleteId,setConfirmDeleteId] = useState(null);
  const [editingId,setEditingId]     = useState(null);
  const [editPrice,setEditPrice]     = useState("");
  const [savingId,setSavingId]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [r,t,b] = await Promise.all([
        sb("routes?select=*"),
        sb(`trips?select=*&travel_date=gte.${todayStr()}&order=travel_date.asc,departure_time.asc`),
        sb("bookings?select=trip_id,total,checked_in"),
      ]);
      setRoutes(r); setTrips(t);
      const counts={}; let rev=0;
      b.forEach(bk => {
        if (!counts[bk.trip_id]) counts[bk.trip_id]={count:0,revenue:0,checkedIn:0};
        counts[bk.trip_id].count++; counts[bk.trip_id].revenue+=Number(bk.total); rev+=Number(bk.total);
        if (bk.checked_in) counts[bk.trip_id].checkedIn++;
      });
      setBK(counts); setTotals({trips:t.length,seats:b.length,revenue:rev});
      if (r.length&&!newRouteId) setNewRouteId(String(r[0].id));
    } catch(e) { setErr("Couldn't load data. "+e.message); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  async function addTrip() {
    if (!newTime||!newRouteId) return;
    setAdding(true); setErr("");
    try {
      await sb("trips",{ method:"POST", body:JSON.stringify({
        route_id:Number(newRouteId), travel_date:newDate, departure_time:newTime,
        price:Number(newPrice)||TICKET_PRICE, total_seats:TOTAL_SEATS }) });
      setNewTime(""); await load();
    } catch(e) { setErr("Couldn't add trip. "+e.message); }
    finally { setAdding(false); }
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

  async function savePrice(id) {
    const p=Number(editPrice); if (!p||p<=0) return;
    setSavingId(id);
    try {
      await sb(`trips?id=eq.${id}`,{ method:"PATCH", prefer:"return=minimal", body:JSON.stringify({price:p}) });
      setEditingId(null); await load();
    } catch(e) { setErr("Couldn't update price. "+e.message); }
    finally { setSavingId(null); }
  }

  const rLabel = id => { const r=routes.find(rt=>rt.id===id); return r?`${r.origin} → ${r.destination}`:"—"; };

  if (loading) return <div style={{display:"flex",justifyContent:"center",padding:60}}><Spinner color={C.navy} size={28}/></div>;

  return (
    <div>
      <ErrMsg msg={err} />
      {/* Metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:24 }}>
        <MetricCard label="Trips" value={totals.trips} color={C.orange} />
        <MetricCard label="Seats sold" value={totals.seats} color={C.green} />
        <MetricCard label={<>Revenue<br/><span style={{fontSize:11}}>(GHS)</span></>} value={totals.revenue.toFixed(0)} color={C.yellow} dark />
      </div>

      {/* Trips list */}
      <SectionLabel>Upcoming trips</SectionLabel>
      {trips.length===0 && <div style={{color:C.muted,fontSize:13,marginBottom:16}}>No upcoming trips. Add one below.</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
        {trips.map(t => {
          const bc=bookingCounts[t.id]||{count:0,revenue:0};
          const pct=Math.round(bc.count/TOTAL_SEATS*100);
          const isConfirming=confirmDeleteId===t.id, isEditing=editingId===t.id;
          return (
            <Card key={t.id} style={{ padding:"14px 18px" }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,color:C.text,fontSize:14}}>{rLabel(t.route_id)}</div>
                  <div style={{fontSize:13,color:C.muted,marginTop:2}}>{t.travel_date} · {String(t.departure_time).slice(0,5)}</div>
                </div>
                <Pill color={bc.count>=TOTAL_SEATS?"red":bc.count>TOTAL_SEATS*0.7?"yellow":"green"} text={`${bc.count}/${TOTAL_SEATS}`} />
              </div>
              <div style={{marginTop:10,height:5,background:C.surface,borderRadius:99}}>
                <div style={{width:`${pct}%`,height:"100%",borderRadius:99,
                  background:bc.count>=TOTAL_SEATS?C.red:bc.count>TOTAL_SEATS*0.7?C.yellow:C.green,transition:"width 0.4s"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:12,color:C.muted}}>
                <span>{pct}% full</span>
                <span>GHS {bc.revenue.toFixed(2)} revenue</span>
              </div>
              {bc.checkedIn > 0 && (
                <div style={{marginTop:8,display:"flex",alignItems:"center",gap:6,fontSize:12.5}}>
                  <span style={{color:"#06A87E",fontWeight:700}}>✅ {bc.checkedIn} boarded</span>
                  <span style={{color:C.muted}}>/ {bc.count} booked</span>
                </div>
              )}
              {isEditing ? (
                <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center"}}>
                  <input type="number" value={editPrice} onChange={e=>setEditPrice(e.target.value)}
                    placeholder="New price (GHS)"
                    style={{flex:1,fontSize:14,fontWeight:500,padding:"8px 12px",borderRadius:8,
                            border:`1.5px solid ${C.orange}`,outline:"none",color:C.text}} />
                  <Btn color="orange" size="sm" disabled={savingId===t.id} onClick={()=>savePrice(t.id)}>
                    {savingId===t.id?<Spinner color={C.white}/>:"Save"}
                  </Btn>
                  <Btn color="surface" size="sm" onClick={()=>setEditingId(null)}>Cancel</Btn>
                </div>
              ) : (
                <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                  <Btn color="surface" size="sm" onClick={()=>{setEditingId(t.id);setEditPrice(String(t.price));setConfirmDeleteId(null);}}>
                    ✏ Edit price (GHS {t.price})
                  </Btn>
                  {isConfirming ? (
                    <>
                      <Btn color="surface" size="sm" style={{color:C.red,fontWeight:700}} disabled={deletingId===t.id} onClick={()=>deleteTrip(t.id)}>
                        {deletingId===t.id?<Spinner color={C.red}/>:"Yes, delete"}
                      </Btn>
                      <Btn color="surface" size="sm" onClick={()=>setConfirmDeleteId(null)}>Cancel</Btn>
                    </>
                  ) : (
                    <Btn color="surface" size="sm" style={{color:C.red}} onClick={()=>{setConfirmDeleteId(t.id);setEditingId(null);}}>
                      🗑 Remove
                    </Btn>
                  )}
                </div>
              )}
              {isConfirming && (
                <div style={{marginTop:8,fontSize:12.5,color:C.red,fontWeight:500,background:"#FFE5E9",padding:"8px 12px",borderRadius:8}}>
                  ⚠ This will also delete {bc.count} existing booking{bc.count!==1?"s":""} on this trip. Are you sure?
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add trip */}
      <Card style={{ padding:"18px 20px" }} accent={C.navy}>
        <SectionLabel>Add a trip</SectionLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <select value={newRouteId} onChange={e=>setNewRouteId(e.target.value)}
            style={{fontSize:14.5,fontWeight:500,padding:"11px 14px",borderRadius:10,
                    border:`1.5px solid ${C.border}`,color:C.text,background:C.white,outline:"none"}}>
            {routes.map(r=><option key={r.id} value={r.id}>{r.origin} → {r.destination}</option>)}
          </select>
          <Input type="date" value={newDate} min={todayStr()} onChange={e=>setNewDate(e.target.value)} />
          <Input type="time" value={newTime} onChange={e=>setNewTime(e.target.value)} />
          <Input type="number" value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="Price (GHS)" />
          <Btn color="navy" fullWidth disabled={adding} onClick={addTrip}>
            {adding?<><Spinner/>Adding…</>:"+ Add trip"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

/* ── Accounts manager ── */
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
    try {
      const rows = await sb("user_roles?select=user_id,role");
      setUsers(rows);
    } catch(e) { setErr("Couldn't load accounts. "+e.message); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  async function addAccount() {
    if (!newEmail.trim()) { setErr("Enter an email address."); return; }
    setAdding(true); setErr(""); setSuccess("");
    try {
      // Create auth user via Supabase Auth Admin endpoint
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method:"POST",
        headers:{
          apikey: SUPABASE_ANON_KEY,
          Authorization:`Bearer ${session.access_token}`,
          "Content-Type":"application/json",
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newRole==="conductor" ? "c12345" : "a12345",
          email_confirm: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not create user");

      // Assign role
      await sb("user_roles",{
        method:"POST",
        body:JSON.stringify({ user_id:data.id, role:newRole }),
      });

      setSuccess(`✓ Account created for ${newEmail.trim()} as ${newRole}. Default password: ${newRole==="conductor"?"c12345":"a12345"}`);
      setNewEmail("");
      await load();
    } catch(e) { setErr("Couldn't create account. "+e.message); }
    finally { setAdding(false); }
  }

  const roleColor = r => r==="admin" ? "orange" : "green";

  return (
    <div>
      <ErrMsg msg={err} />
      {success && (
        <div style={{background:"#E0FBF4",color:"#06A87E",fontSize:13,fontWeight:500,padding:"10px 14px",borderRadius:10,marginBottom:16}}>
          {success}
        </div>
      )}

      <SectionLabel>Current accounts</SectionLabel>
      {loading ? (
        <div style={{display:"flex",justifyContent:"center",padding:32}}><Spinner color={C.navy}/></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
          {users.length===0 && <div style={{fontSize:13,color:C.muted}}>No accounts found.</div>}
          {users.map(u => (
            <Card key={u.user_id} style={{ padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div className="gcg-mono" style={{ fontSize:12.5, color:C.muted }}>{u.user_id.slice(0,16)}…</div>
              <Pill color={roleColor(u.role)} text={u.role} />
            </Card>
          ))}
        </div>
      )}

      <Card style={{ padding:"18px 20px" }} accent={C.orange}>
        <SectionLabel>Add new account</SectionLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Input value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="Email address" type="email" />
          <div style={{ display:"flex", gap:8 }}>
            {["conductor","admin"].map(r => (
              <button key={r} className="gcg-btn" onClick={()=>setNewRole(r)}
                style={{ flex:1, padding:"10px", borderRadius:10, fontSize:14, fontWeight:700,
                         background:newRole===r?C.navy:C.surface,
                         color:newRole===r?C.white:C.muted }}>
                {r.charAt(0).toUpperCase()+r.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ fontSize:12, color:C.muted, background:C.surface, padding:"8px 12px", borderRadius:8 }}>
            Default password: <strong>{newRole==="conductor"?"c12345":"a12345"}</strong> — they should change it after first login.
          </div>
          <Btn color="orange" fullWidth disabled={adding} onClick={addAccount}>
            {adding?<><Spinner color={C.white}/>Creating…</>:"+ Create account"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
