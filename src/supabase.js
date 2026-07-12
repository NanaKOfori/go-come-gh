export const SUPABASE_URL      = "https://nhsgyenuuemahkkhqugb.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oc2d5ZW51dWVtYWhra2hxdWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzAwMjQsImV4cCI6MjA5NzAwNjAyNH0.ST3EjGIwDU91bM8NxCoMwGXKE2ve916MkWJMwstyFJk";

const SESSION_KEY = "gcg_session";

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
export function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

/* ── Refresh the access token using the refresh_token ── */
async function refreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) { setSession(null); return null; }
    const data = await res.json();
    setSession(data);
    return data;
  } catch { return null; }
}

/* ── REST helper — auto-refreshes on 401 ── */
export async function sb(path, opts = {}, retry = true) {
  let session = getSession();
  const authHeader = session?.access_token
    ? `Bearer ${session.access_token}`
    : `Bearer ${SUPABASE_ANON_KEY}`;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeader,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });

  /* If token expired, refresh and retry once */
  if (res.status === 401 && retry) {
    const newSession = await refreshSession();
    if (newSession) return sb(path, opts, false);
    /* Refresh failed — force re-login by clearing session */
    setSession(null);
    window.location.reload();
    return;
  }

  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

/* ── Auth helpers ── */
export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Login failed");
  return data;
}

export async function signOut() {
  const session = getSession();
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
  setSession(null);
}

export async function getUserRole(userId, accessToken) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data?.[0]?.role || null;
}

export function todayStr() { return new Date().toISOString().slice(0, 10); }
