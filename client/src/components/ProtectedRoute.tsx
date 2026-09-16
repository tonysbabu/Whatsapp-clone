import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ChatProvider } from "../context/ChatContext";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="boot">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <ChatProvider>{children}</ChatProvider>;
}
