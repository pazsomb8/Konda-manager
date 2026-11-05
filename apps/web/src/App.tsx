import { useEffect, useState } from "react";
import { api } from "./api";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";

export function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setLoggedIn(r.loggedIn))
      .catch(() => setLoggedIn(false));
  }, []);

  if (loggedIn === null) return <div className="center muted">Betöltés…</div>;
  if (!loggedIn) return <Login onSuccess={() => setLoggedIn(true)} />;
  return <Dashboard onLogout={() => setLoggedIn(false)} />;
}
