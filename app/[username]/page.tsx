"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface RepoSummary {
  id: string; name: string; description: string | null;
  defaultBranch: string; sizeBytes: number;
  commitCount: number; starCount: number; forkCount: number;
  isPrivate: number; isExternal: number;
  published: string; updatedAt: string;
}

export default function UserProfilePage() {
  const params = useParams();
  const profileUsername = params.username as string;
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUser(localStorage.getItem("cg_username"));
    const token = localStorage.getItem("cg_token");
    fetch(`/api/users/${profileUsername}/repos`)
      .then(r => r.json()).then(data => {
        if (Array.isArray(data)) setRepos(data);
        else setError("Failed to load repositories");
      }).catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [profileUsername]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024; const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleDelete = async (repoName: string) => {
    if (!confirm(`Are you sure you want to delete "${repoName}"?`)) return;
    setDeleting(repoName);
    const token = localStorage.getItem("cg_token");
    const res = await fetch(`/api/repos/${repoName}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setRepos(prev => prev.filter(r => r.name !== repoName));
    setDeleting(null);
  };

  const isOwnProfile = currentUser === profileUsername;

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

      <main className="flex-1 max-w-5xl mx-auto px-4 pt-12 w-full">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
            {profileUsername[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{profileUsername}</h1>
            <p className="text-muted text-sm">{repos.length} repositories</p>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted py-16">Loading...</p>
        ) : error ? (
          <p className="text-center text-muted py-16">{error}</p>
        ) : repos.length === 0 ? (
          <p className="text-center text-muted py-16">No public repositories.</p>
        ) : (
          <div className="space-y-3">
            {repos.map(repo => (
              <div key={repo.id}
                className="relative bg-card border border-border rounded-xl p-5 hover:bg-card-hover transition-colors">
                <a href={`/r/${profileUsername}/${repo.name}`} className="block">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{profileUsername}/{repo.name}</h3>
                      {repo.description && <p className="text-muted text-sm mt-1">{repo.description}</p>}
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                        <span>{repo.defaultBranch}</span>
                        <span>{formatBytes(repo.sizeBytes)}</span>
                        <span>{repo.commitCount} commits</span>
                        <span>{repo.starCount} stars</span>
                        <span>{repo.forkCount} forks</span>
                        {repo.isExternal ? <span className="text-primary">External</span> : null}
                      </div>
                    </div>
                  </div>
                </a>
                {isOwnProfile && (
                  <button onClick={() => handleDelete(repo.name)} disabled={deleting === repo.name}
                    className="absolute top-4 right-4 p-2 rounded-lg bg-error/10 text-error text-xs hover:bg-error/20 transition-colors disabled:opacity-50"
                    title="Delete repository">
                    {deleting === repo.name ? "..." : "✕"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
