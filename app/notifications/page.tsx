"use client";

import { useState, useEffect } from "react";

interface Notification {
  id: string; type: string; accountId: string; targetAccountId: string;
  objectId: string | null; read: boolean; createdAt: string;
  actor?: { id: string; username: string; domain: string; displayName: string | null; avatarUrl: string | null } | null;
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUser(localStorage.getItem("cg_username"));
    const token = localStorage.getItem("cg_token");
    if (!token) { window.location.href = "/"; return; }
    fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setNotifs(data); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const markRead = async (id: string) => {
    const token = localStorage.getItem("cg_token");
    await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">G</div>
            <span className="font-semibold">cf-git</span>
          </a>
          <div className="flex items-center gap-3">
            {currentUser && <a href={`/${currentUser}`} className="text-sm text-primary font-medium hover:underline">{currentUser}</a>}
            <a href="/search" className="text-sm text-muted hover:text-foreground">Search</a>
            <a href="/" className="text-sm text-muted hover:text-foreground">Home</a>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto px-4 pt-12 w-full">
        <h1 className="text-2xl font-bold mb-6">Notifications</h1>
        {loading ? (
          <p className="text-center text-muted py-8">Loading...</p>
        ) : notifs.length === 0 ? (
          <p className="text-center text-muted py-8">No notifications yet.</p>
        ) : (
          <div className="space-y-3">
            {notifs.map(n => (
              <div key={n.id}
                className={`bg-card border rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-colors ${n.read ? 'border-border opacity-60' : 'border-primary/30'}`}
                onClick={() => !n.read && markRead(n.id)}>
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                  {n.actor?.username?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    {n.type === "follow" ? (
                      <><span className="font-medium">{n.actor?.username || "Someone"}</span> followed you</>
                    ) : n.type === "follow_accept" ? (
                      <><span className="font-medium">{n.actor?.username || "Someone"}</span> accepted your follow request</>
                    ) : (
                      <>{n.type}</>
                    )}
                  </p>
                  <p className="text-xs text-muted mt-1">{new Date(n.createdAt).toLocaleDateString()}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
