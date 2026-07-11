import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Lazy-load protected pages so they're not bundled into the main customer JS
const App       = lazy(() => import("./App.jsx"));
const Admin     = lazy(() => import("./pages/Admin.jsx"));
const Conductor = lazy(() => import("./pages/Conductor.jsx"));

function Router() {
  const path = window.location.pathname;

  if (path === "/admin" || path === "/admin/") return <Admin />;
  if (path === "/conductor" || path === "/conductor/") return <Conductor />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
                    background:"#1A1A2E" }}>
        <div style={{ color:"rgba(255,255,255,0.4)", fontFamily:"sans-serif", fontSize:14 }}>Loading…</div>
      </div>
    }>
      <Router />
    </Suspense>
  </React.StrictMode>
);
