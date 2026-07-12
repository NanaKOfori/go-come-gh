import React from "react";

export const C = {
  navy:    "#1A1A2E",
  orange:  "#FF6B35",
  green:   "#06D6A0",
  yellow:  "#FFD166",
  red:     "#EF233C",
  surface: "#F0F2F5",
  white:   "#FFFFFF",
  muted:   "#8892A0",
  text:    "#1A1A2E",
  border:  "#E4E8EF",
};

export const GLOBAL_STYLE = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=DM+Mono:wght@500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    body { font-family: 'DM Sans', sans-serif; background: #F0F2F5; }
    .gcg-mono { font-family: 'DM Mono', monospace; }
    .gcg-spin { animation: gcgspin 0.8s linear infinite; }
    @keyframes gcgspin { to { transform: rotate(360deg); } }
    .gcg-btn { cursor: pointer; border: none; font-family: 'DM Sans', sans-serif; transition: opacity 0.12s, transform 0.1s; }
    .gcg-btn:hover:not(:disabled) { opacity: 0.88; }
    .gcg-btn:active:not(:disabled) { transform: scale(0.98); }
    .gcg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .gcg-input { font-family: 'DM Sans', sans-serif; outline: none; border: none; background: #FFFFFF; width: 100%; }
    .gcg-input::placeholder { color: #B0B7C3; }
    .gcg-seat:not(:disabled):hover { background: #e8fff9 !important; border-color: #06D6A0 !important; }
    select { font-family: 'DM Sans', sans-serif; }
    input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
    input[type="time"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
  `}</style>
);

export function Spinner({ color = C.white, size = 18 }) {
  return (
    <svg className="gcg-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={color} strokeOpacity="0.25" strokeWidth="3"/>
      <path d="M22 12a10 10 0 0 0-10-10" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

export function Pill({ color, text }) {
  const bg = { green:"#E0FBF4", red:"#FFE5E9", yellow:"#FFF6DC", orange:"#FFF0EB" }[color] || "#F0F2F5";
  const fg = { green:"#06A87E", red:"#C1002D", yellow:"#B58B00", orange:"#CC4400" }[color] || C.muted;
  return <span style={{ background:bg, color:fg, fontSize:11.5, fontWeight:600, padding:"3px 9px", borderRadius:20, display:"inline-block" }}>{text}</span>;
}

export function Btn({ children, color="navy", size="md", disabled, onClick, fullWidth, style: xtra }) {
  const bg = { navy:C.navy, orange:C.orange, green:C.green, white:C.white, surface:C.surface, red:"#FFE5E9" }[color];
  const fg = { navy:C.white, orange:C.white, green:C.navy, white:C.navy, surface:C.navy, red:C.red }[color];
  const pad = size==="sm" ? "8px 16px" : size==="lg" ? "15px 28px" : "11px 22px";
  const fsize = size==="sm" ? 13 : size==="lg" ? 16 : 14.5;
  return (
    <button className="gcg-btn" disabled={disabled} onClick={onClick}
      style={{ background:bg, color:fg, padding:pad, fontSize:fsize, fontWeight:700, borderRadius:12,
               width:fullWidth?"100%":undefined, display:"flex", alignItems:"center", justifyContent:"center", gap:8, ...xtra }}>
      {children}
    </button>
  );
}

export function Input({ value, onChange, placeholder, type="text", min, style: xtra, onKeyDown }) {
  return (
    <input className="gcg-input" type={type} value={value} onChange={onChange}
      placeholder={placeholder} min={min} onKeyDown={onKeyDown}
      style={{ fontSize:14.5, fontWeight:500, padding:"11px 14px", borderRadius:10,
               border:`1.5px solid ${C.border}`, color:C.text, ...xtra }} />
  );
}

export function Card({ children, style: xtra, accent }) {
  return (
    <div style={{ background:C.white, borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.06)", ...xtra }}>
      {accent && <div style={{ height:4, background:accent }}/>}
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.2, color:C.muted, textTransform:"uppercase", marginBottom:10 }}>{children}</div>;
}

export function Row({ label, value, bold, large }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0" }}>
      <span style={{ fontSize:13.5, color:bold?C.text:C.muted }}>{label}</span>
      <span style={{ fontSize:large?17:14, fontWeight:bold?700:500, color:C.text }}>{value}</span>
    </div>
  );
}

export function PageHead({ onBack, title, sub }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
      {onBack && (
        <button className="gcg-btn" onClick={onBack}
          style={{ width:36, height:36, borderRadius:"50%", background:C.surface,
                   display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:C.text, flexShrink:0 }}>
          ←
        </button>
      )}
      <div>
        <div style={{ fontSize:20, fontWeight:800, color:C.text, lineHeight:1.1 }}>{title}</div>
        {sub && <div style={{ fontSize:12.5, color:C.muted, marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export function ErrMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ background:"#FFE5E9", color:C.red, fontSize:13, fontWeight:500, padding:"10px 14px", borderRadius:10, marginBottom:12 }}>{msg}</div>;
}

export function TopBar({ title, role, onLogout, showBack, onBack }) {
  return (
    <div style={{ background:C.navy, padding:"0 20px" }}>
      <div style={{ maxWidth:520, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 0" }}>
          {showBack && (
            <button className="gcg-btn" onClick={onBack}
              style={{ color:"rgba(255,255,255,0.6)", fontSize:20, background:"transparent", marginRight:4 }}>←</button>
          )}
          <div style={{ width:32, height:32, borderRadius:8, background:C.orange,
                        display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ color:C.white, fontWeight:900, fontSize:16 }}>G</span>
          </div>
          <div>
            <div style={{ color:C.white, fontWeight:800, fontSize:16, lineHeight:1.1 }}>Go-Come-Gh</div>
            {title && <div style={{ color:"rgba(255,255,255,0.45)", fontSize:11 }}>{title}</div>}
          </div>
        </div>
        {onLogout && (
          <button className="gcg-btn" onClick={onLogout}
            style={{ color:"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, background:"transparent", padding:"6px 12px",
                     border:"1px solid rgba(255,255,255,0.15)", borderRadius:8 }}>
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

export function FakeQr({ data, size=108 }) {
  const cells=12; const px=size/cells;
  let seed=0;
  for (let i=0;i<data.length;i++) seed=(seed*31+data.charCodeAt(i))%100000;
  const rand=()=>{ seed=(seed*9301+49297)%233280; return seed/233280; };
  const squares=[];
  for (let y=0;y<cells;y++)
    for (let x=0;x<cells;x++) {
      const corner=(x<3&&y<3)||(x>cells-4&&y<3)||(x<3&&y>cells-4);
      if (corner?(x%2===0&&y%2===0)||(x===1&&y===1):rand()>0.55) squares.push([x,y]);
    }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius:6, display:"block" }}>
      <rect width={size} height={size} fill="#fff"/>
      {squares.map(([x,y],i)=><rect key={i} x={x*px} y={y*px} width={px} height={px} fill={C.navy}/>)}
    </svg>
  );
}
