import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, ready, login, register } = useAuth();
  const location = useLocation();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(displayName, email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <h1>WhatsApp Clone</h1>
        <p>Sign in to search people, start chats, and keep messages available offline.</p>
      </div>
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>{mode === "login" ? "Welcome back" : "Create an account"}</h2>
        {mode === "register" && (
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={80}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "register" ? 8 : 1}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
        </button>
        {mode === "login" ? (
          <p className="muted">
            New here?{" "}
            <Link to="/register" state={location.state}>
              Create an account
            </Link>
          </p>
        ) : (
          <p className="muted">
            Already registered?{" "}
            <Link to="/login" state={location.state}>
              Log in
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}
