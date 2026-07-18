"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

interface RepoDetail {
  id: string; name: string; description: string | null;
  actorId: string; isPrivate: number; isExternal: number;
  externalUrl: string | null; cloneUrl: string | null;
  defaultBranch: string; sizeBytes: number;
  commitCount: number; starCount: number; forkCount: number;
  lastSyncAt: string | null; published: string; updatedAt: string;
}

export default function RepoPage() {
  const params = useParams();
  const username = params.username as string;
  const repoName = params.repo as string;
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { setCurrentUser(localStorage.getItem("cg_username")); }, []);

  useEffect(() => {
    fetch(`/api/users/${username}/repos`)
      .then(r => r.json()).then((data: RepoDetail[]) => {
        const found = data.find((r: RepoDetail) => r.name === repoName);
        if (found) setRepo(found);
      }).catch(() => {})
      .finally(() => setLoading(false));
  }, [username, repoName]);

  const handleDelete = async () => {
    if (!repo || !confirm("Are you sure you want to delete this repository?")) return;
    const token = localStorage.getItem("cg_token");
    const res = await fetch(`/api/repos/${repo.name}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) window.location.href = "/";
  };

  const handleSync = useCallback(async () => {
    if (!repo || syncing) return;
    setSyncing(true);
    const token = localStorage.getItem("cg_token");
    try {
      await fetch("/api/repos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ repoId: repo.id }),
      });
      const res = await fetch(`/api/users/${username}/repos`);
      const data: RepoDetail[] = await res.json();
      const found = data.find((r: RepoDetail) => r.name === repoName);
      if (found) setRepo(found);
    } catch {}
    setSyncing(false);
  }, [repo, syncing, username, repoName]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024; const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted">Loading...</p>
    </div>
  );

  if (!repo) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted">Repository not found</p>
    </div>
  );

  const isOwner = currentUser === username;
  const cloneUrl = `https://cf-git.com/${username}/${repo.name}.git`;

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
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

      <main className="flex-1 max-w-5xl mx-auto px-4 pt-8 w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{username}/{repo.name}</h1>
            {repo.description && <p className="text-muted mt-1">{repo.description}</p>}
          </div>
          {isOwner && (
            <button onClick={handleDelete}
              className="px-4 py-2 rounded-lg bg-error/10 text-error text-sm hover:bg-error/20 transition-colors">
              Delete
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">Commits</p>
            <p className="text-2xl font-bold">{repo.commitCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">Size</p>
            <p className="text-2xl font-bold">{formatBytes(repo.sizeBytes)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">Branch</p>
            <p className="text-2xl font-bold font-mono">{repo.defaultBranch}</p>
          </div>
        </div>

        {!!repo.isExternal && (
          <div className="bg-card border border-border rounded-xl p-4 mb-8">
            <p className="text-sm text-muted mb-2">External Repository</p>
            {repo.externalUrl && <p className="text-sm font-mono text-primary">{repo.externalUrl}</p>}
            {repo.lastSyncAt && <p className="text-xs text-muted mt-1">Last synced: {new Date(repo.lastSyncAt).toLocaleString()}</p>}
            {isOwner && <button onClick={handleSync}
              disabled={syncing}
              className="mt-3 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors disabled:opacity-50">
              {syncing ? "Syncing..." : "Sync now"}
            </button>}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-4 mb-8">
          <p className="text-sm text-muted mb-2">Clone</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 px-3 py-2 bg-secondary rounded-lg text-sm font-mono truncate">{cloneUrl}</code>
            <button onClick={() => navigator.clipboard.writeText(cloneUrl)}
              className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors shrink-0">
              Copy
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
