import React, { useState } from "react";
import { C, Btn, Input, ErrMsg, Spinner } from "../components/UI.jsx";
import { signIn, getUserRole, setSession } from "../supabase.js";

export default function Login({ expectedRole, onSuccess }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const roleLabel = expectedRole === "admin" ? "Admin" : "Conductor";
  const accentColor = expectedRole === "admin" ? C.orange : C.green;

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = await signIn(email.trim(), password);
      const role = await getUserRole(session.user.id, session.access_token);

      if (role !== expectedRole) {
        setError(`This login is for ${roleLabel}s only. Please use the correct portal.`);
        setLoading(false);
        return;
      }

      setSession(session);
      onSuccess(session, role);
    } catch (e) {
      setError(e.message || "Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:"100vh", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:accentColor,
                        display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
            <span style={{ color:C.white, fontWeight:900, fontSize:28 }}>G</span>
          </div>
          <div style={{ color:C.white, fontWeight:800, fontSize:24 }}>Go-Come-Gh</div>
          <div style={{ color:"rgba(255,255,255,0.45)", fontSize:13, marginTop:4 }}>
            {roleLabel} Portal
          </div>
        </div>

        {/* Card */}
        <div style={{ background:C.white, borderRadius:20, padding:"28px 28px 24px" }}>
          <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:6 }}>
            Sign in
          </div>
          <div style={{ fontSize:13, color:C.muted, marginBottom:24 }}>
            Enter your {roleLabel.toLowerCase()} credentials to continue.
          </div>

          <ErrMsg msg={error} />

          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, marginBottom:5 }}>EMAIL</div>
              <Input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={`${roleLabel.toLowerCase()}@gocomagh.com`}
                type="email"
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, marginBottom:5 }}>PASSWORD</div>
              <Input
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
            </div>
          </div>

          <div style={{ marginTop:20 }}>
            <Btn
              color={expectedRole === "admin" ? "orange" : "green"}
              size="lg"
              fullWidth
              disabled={loading}
              onClick={handleLogin}
            >
              {loading ? <><Spinner color={C.white}/> Signing in…</> : `Sign in as ${roleLabel}`}
            </Btn>
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:12.5, color:"rgba(255,255,255,0.3)" }}>
          Customers — <a href="/" style={{ color:"rgba(255,255,255,0.5)", textDecoration:"underline" }}>book your ticket here</a>
        </div>
      </div>
    </div>
  );
}
