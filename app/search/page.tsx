"use client";

import { useState, useEffect, useRef } from "react";

interface Account {
  id: string; username: string; domain: string;
  displayName: string | null; avatarUrl: string | null;
  summary: string | null; followersCount: number;
  followingCount: number; isLocal: boolean;
}

interface Relationship {
  id: string; following: boolean; requested: boolean;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [relationships, setRelationships] = useState<Map<string, Relationship>>(new Map());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUser(localStorage.getItem("cg_username"));
    setToken(localStorage.getItem("cg_token"));
  }, []);

  const fetchRelationships = async (ids: string[]) => {
    if (!token || !ids.length) return;
    try {
      const res = await fetch(`/api/v1/accounts/relationships?ids=${ids.join(",")}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data: Relationship[] = await res.json();
      const map = new Map<string, Relationship>();
      for (const r of data) map.set(r.id, r);
      setRelationships(map);
    } catch { /* */ }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setSearched(true);
    try {
      const res = await fetch(`/api/v1/accounts/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const accs = data.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          username: (a.preferredUsername ?? a.username) as string,
          domain: (a.domain ?? (a.id as string).match(/https?:\/\/([^\/]+)/)?.[1] ?? '') as string,
          displayName: (a.name ?? a.displayName ?? null) as string | null,
          avatarUrl: (a.icon ? (a.icon as Record<string, unknown>).url as string : a.avatarUrl) as string | null,
          summary: (a.summary ?? null) as string | null,
          followersCount: (a.followersCount ?? 0) as number,
          followingCount: (a.followingCount ?? 0) as number,
          isLocal: (a.isLocal ?? false) as boolean,
        }));
        setAccounts(accs);
        fetchRelationships(accs.map(a => a.id));
      }
    } catch { /* */ }
    finally { setLoading(false); }
  };

  const pendingPollRef = useRef<Map<string, number>>(new Map());

  const handleFollow = async (targetId: string) => {
    if (!token) return;
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId }),
      });
      if (res.ok) {
        const data = await res.json();
        setRelationships(prev => {
          const next = new Map(prev);
          next.set(targetId, { id: targetId, following: data.state === "accepted", requested: data.state === "pending" });
          return next;
        });
        if (data.state === "pending") {
          pollFollowStatus(targetId);
        }
      }
    } catch { /* */ }
  };

  const pollFollowStatus = (targetId: string) => {
    if (!token) return;
    const existing = pendingPollRef.current.get(targetId);
    if (existing) clearTimeout(existing);
    const tid = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/accounts/relationships?ids=${targetId}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const data: Relationship[] = await res.json();
        const rel = data[0];
        if (rel && rel.following) {
          setRelationships(prev => {
            const next = new Map(prev);
            next.set(targetId, rel);
            return next;
          });
          pendingPollRef.current.delete(targetId);
        } else if (rel && rel.requested) {
          pollFollowStatus(targetId);
        }
      } catch { pollFollowStatus(targetId); }
    }, 3000);
    pendingPollRef.current.set(targetId, tid);
  };

  const handleUnfollow = async (targetId: string) => {
    if (!token) return;
    try {
      const res = await fetch("/api/unfollow", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetId }),
      });
      if (res.ok) {
        setRelationships(prev => {
          const next = new Map(prev);
          next.delete(targetId);
          return next;
        });
      }
    } catch { /* */ }
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
            <a href="/notifications" className="text-sm text-muted hover:text-foreground">Notifications</a>
            <a href="/" className="text-sm text-muted hover:text-foreground">Home</a>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto px-4 pt-12 w-full">
        <h1 className="text-2xl font-bold mb-6">Search Accounts</h1>
        <div className="flex gap-3 mb-8">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="@user@domain or username"
            className="flex-1 px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none"
          />
          <button onClick={handleSearch} disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors">
            {loading ? "..." : "Search"}
          </button>
        </div>

        {searched && !loading && accounts.length === 0 && (
          <p className="text-center text-muted py-8">No accounts found</p>
        )}

        <div className="space-y-3">
          {accounts.map(acc => {
            const rel = relationships.get(acc.id);
            return (
              <div key={acc.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                  {(acc.displayName || acc.username)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{acc.displayName || acc.username}</p>
                  <p className="text-sm text-muted truncate">@{acc.username}@{acc.domain}</p>
                </div>
                <div className="text-xs text-muted shrink-0 mr-2">
                  {acc.followersCount} followers
                </div>
                {token && (
                  rel?.following ? (
                    <button onClick={() => handleUnfollow(acc.id)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-secondary transition-colors">
                      Unfollow
                    </button>
                  ) : rel?.requested ? (
                    <span className="px-3 py-1.5 text-xs rounded-lg bg-secondary text-muted">
                      Pending
                    </span>
                  ) : (
                    <button onClick={() => handleFollow(acc.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition-colors">
                      Follow
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
