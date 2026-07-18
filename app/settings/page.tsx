"use client";

import { useState, useEffect } from "react";

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => { setCurrentUser(localStorage.getItem("cg_username")); }, []);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setLoading(true); setError(""); setMessage("");
    const token = localStorage.getItem("cg_token");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      setMessage("Password changed successfully.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
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
            <a href="/notifications" className="text-sm text-muted hover:text-foreground">Notifications</a>
            <a href="/" className="text-sm text-muted hover:text-foreground">Home</a>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-lg mx-auto px-4 pt-12 w-full">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">Change Password</h2>
          <div className="space-y-4">
            <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current Password" type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
            <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New Password" type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
            <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm New Password" type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
            {error && <p className="text-error text-sm">{error}</p>}
            {message && <p className="text-green-500 text-sm">{message}</p>}
            <button onClick={handleChangePassword} disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">
              {loading ? "..." : "Change Password"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
