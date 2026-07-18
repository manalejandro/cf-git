"use client";

import { useState, useEffect, useRef } from "react";

type Locale = "en" | "es";
type D = typeof dict.en;

const dict = {
  en: {
    title: "cf-git", tagline: "Git repos, federated.",
    heroTitle: "Git Repositories for the Fediverse",
    heroSub: "cf-git lets you host Git repositories that federate through ActivityPub. Push code, share commits, and collaborate across the fediverse.",
    cta: "Get Started", learnMore: "Learn More",
    howItWorks: "How It Works",
    step1: "Create an Account",
    step1Desc: "Sign up with a username and start hosting Git repositories.",
    step2: "Create a Repository",
    step2Desc: "Create public repos, clone external ones, or migrate from other Git hosts.",
    step3: "Federate",
    step3Desc: "Your commits and repos federate to your followers via ActivityPub automatically.",
    features: "Features",
    feature1: "ActivityPub Federation",
    feature1Desc: "Every commit and repo creation federates to your followers automatically.",
    feature2: "Clone & Migrate",
    feature2Desc: "Clone external repositories or migrate from GitHub, GitLab, and more.",
    feature3: "Open Source",
    feature3Desc: "Built with Next.js, Cloudflare, and ActivityPub. Fully open source.",
    login: "Sign In", register: "Sign Up", logout: "Log Out",
    myRepos: "My Repositories", newRepo: "New Repository",
    repoName: "Repository Name", repoNamePlaceholder: "my-project",
    description: "Description", descPlaceholder: "A short description of your repository",
    visibility: "Visibility", public: "Public", private: "Private",
    cloneRepo: "Clone External Repository",
    cloneUrl: "Clone URL", cloneUrlPlaceholder: "https://github.com/user/repo.git",
    migrateRepo: "Migrate Repository",
    migrateUrl: "Source URL", migrateUrlPlaceholder: "https://github.com/user/repo",
    createRepo: "Create Repository", submit: "Create",
    success: "Repository created!", noRepos: "No repositories yet. Create your first one!",
    stars: "stars", forks: "forks", commits: "commits",
    yourRepos: "Your Repositories",
    poweredBy: "Powered by Next.js, Cloudflare & ActivityPub",
    source: "Source Code", language: "Language",
    username: "Username", email: "Email", password: "Password",
    confirmPassword: "Confirm Password",
    loginTitle: "Welcome Back", registerTitle: "Join cf-git",
    loginBtn: "Sign In", registerBtn: "Create Account",
    noAccount: "Don't have an account?", haveAccount: "Already have an account?",
    usernamePlaceholder: "yourusername", emailPlaceholder: "you@example.com",
    passwordPlaceholder: "••••••••",
    search: "Search", notifications: "Notifications", settings: "Settings",
    loggingIn: "Signing in...", registering: "Creating account...",
    forgotPassword: "Forgot password?",
    forgotPasswordTitle: "Reset your password",
    forgotPasswordDesc: "Enter your email and we'll send you a reset link.",
    forgotPasswordBtn: "Send reset link", forgotPasswordSent: "Check your email",
    forgotPasswordEmailSent: "If that email is registered, you will receive a password reset link.",
    resetPasswordTitle: "Set new password", resetPasswordBtn: "Reset password",
    resetPasswordSuccess: "Password has been reset successfully.",
    newPassword: "New password", confirmNewPassword: "Confirm new password",
    resendVerification: "Resend verification email",
    resendVerificationSent: "If that email is registered, a new verification link will be sent.",
    emailVerified: "Email verified! Your account is now active.",
    emailVerificationFailed: "Verification failed. The link may be invalid or expired.",
    checkEmail: "Check your email for the verification link.",
    turnstileError: "Please complete the captcha verification.",
    resetTokenExpired: "Invalid or expired reset link.",
    backToLogin: "Back to sign in", dismiss: "Dismiss",
    changePassword: "Change Password", currentPassword: "Current Password",
    newPasswordLabel: "New Password", confirmNewPasswordLabel: "Confirm New Password",
    changePasswordBtn: "Update Password", passwordChanged: "Password changed successfully.",
    sizeLimit: "Repository size limit exceeded. Maximum size is {size}MB.",
    fileSizeLimit: "File size limit exceeded. Maximum file size is {size}MB.",
    repoCount: "repositories",
  },
  es: {
    title: "cf-git", tagline: "Repos Git, federados.",
    heroTitle: "Repositorios Git para el Fediverso",
    heroSub: "cf-git te permite alojar repositorios Git que se federan a través de ActivityPub. Sube código, comparte commits y colabora en todo el fediverso.",
    cta: "Comenzar", learnMore: "Más Información",
    howItWorks: "Cómo Funciona",
    step1: "Crea una Cuenta",
    step1Desc: "Regístrate con un usuario y comienza a alojar repositorios Git.",
    step2: "Crea un Repositorio",
    step2Desc: "Crea repos públicos, clona repos externos o migra desde otros servicios Git.",
    step3: "Federa",
    step3Desc: "Tus commits y repos se federan a tus seguidores automáticamente vía ActivityPub.",
    features: "Características",
    feature1: "Federación ActivityPub",
    feature1Desc: "Cada commit y creación de repo se federa a tus seguidores automáticamente.",
    feature2: "Clonar y Migrar",
    feature2Desc: "Clona repositorios externos o migra desde GitHub, GitLab y más.",
    feature3: "Código Abierto",
    feature3Desc: "Construido con Next.js, Cloudflare y ActivityPub. Totalmente open source.",
    login: "Iniciar Sesión", register: "Registrarse", logout: "Cerrar Sesión",
    myRepos: "Mis Repositorios", newRepo: "Nuevo Repositorio",
    repoName: "Nombre del Repositorio", repoNamePlaceholder: "mi-proyecto",
    description: "Descripción", descPlaceholder: "Una breve descripción de tu repositorio",
    visibility: "Visibilidad", public: "Público", private: "Privado",
    cloneRepo: "Clonar Repositorio Externo",
    cloneUrl: "URL de Clonación", cloneUrlPlaceholder: "https://github.com/usuario/repo.git",
    migrateRepo: "Migrar Repositorio",
    migrateUrl: "URL de Origen", migrateUrlPlaceholder: "https://github.com/usuario/repo",
    createRepo: "Crear Repositorio", submit: "Crear",
    success: "¡Repositorio creado!", noRepos: "Aún no hay repositorios. ¡Crea el primero!",
    stars: "estrellas", forks: "bifurcaciones", commits: "commits",
    yourRepos: "Tus Repositorios",
    poweredBy: "Desarrollado con Next.js, Cloudflare y ActivityPub",
    source: "Código Fuente", language: "Idioma",
    username: "Usuario", email: "Correo electrónico", password: "Contraseña",
    confirmPassword: "Confirmar Contraseña",
    loginTitle: "Bienvenido de Nuevo", registerTitle: "Únete a cf-git",
    loginBtn: "Iniciar Sesión", registerBtn: "Crear Cuenta",
    noAccount: "¿No tienes cuenta?", haveAccount: "¿Ya tienes cuenta?",
    usernamePlaceholder: "tuusuario", emailPlaceholder: "tu@ejemplo.com",
    passwordPlaceholder: "••••••••",
    search: "Buscar", notifications: "Notificaciones", settings: "Ajustes",
    loggingIn: "Iniciando sesión...", registering: "Creando cuenta...",
    forgotPassword: "¿Olvidaste tu contraseña?",
    forgotPasswordTitle: "Restablece tu contraseña",
    forgotPasswordDesc: "Ingresa tu correo y te enviaremos un enlace de restablecimiento.",
    forgotPasswordBtn: "Enviar enlace", forgotPasswordSent: "Revisa tu correo",
    forgotPasswordEmailSent: "Si ese correo está registrado, recibirás un enlace para restablecer tu contraseña.",
    resetPasswordTitle: "Nueva contraseña", resetPasswordBtn: "Restablecer contraseña",
    resetPasswordSuccess: "Contraseña restablecida exitosamente.",
    newPassword: "Nueva contraseña", confirmNewPassword: "Confirmar nueva contraseña",
    resendVerification: "Reenviar verificación",
    resendVerificationSent: "Si ese correo está registrado, se enviará un nuevo enlace de verificación.",
    emailVerified: "¡Correo verificado! Tu cuenta ya está activa.",
    emailVerificationFailed: "Verificación fallida. El enlace puede ser inválido o haber expirado.",
    checkEmail: "Revisa tu correo para ver el enlace de verificación.",
    turnstileError: "Por favor completa la verificación captcha.",
    resetTokenExpired: "Enlace de restablecimiento inválido o expirado.",
    backToLogin: "Volver a iniciar sesión", dismiss: "Descartar",
    changePassword: "Cambiar Contraseña", currentPassword: "Contraseña Actual",
    newPasswordLabel: "Nueva Contraseña", confirmNewPasswordLabel: "Confirmar Nueva Contraseña",
    changePasswordBtn: "Actualizar Contraseña", passwordChanged: "Contraseña cambiada exitosamente.",
    sizeLimit: "Límite de tamaño del repositorio excedido. El tamaño máximo es {size}MB.",
    fileSizeLimit: "Límite de tamaño de archivo excedido. El tamaño máximo es {size}MB.",
    repoCount: "repositorios",
  },
};

interface Repo {
  id: string; name: string; description: string | null;
  actorId: string; isPrivate: number; isExternal: number;
  externalUrl: string | null; cloneUrl: string | null;
  defaultBranch: string; sizeBytes: number;
  commitCount: number; starCount: number; forkCount: number;
  lastSyncAt: string | null; published: string; updatedAt: string;
}

function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("cg_token");
    const u = localStorage.getItem("cg_username");
    const a = localStorage.getItem("cg_actorId");
    if (t && u) { setToken(t); setUsername(u); setActorId(a); }
  }, []);

  const login = (t: string, u: string, a: string) => {
    localStorage.setItem("cg_token", t); localStorage.setItem("cg_username", u); localStorage.setItem("cg_actorId", a);
    setToken(t); setUsername(u); setActorId(a);
  };

  const logout = () => {
    localStorage.removeItem("cg_token"); localStorage.removeItem("cg_username"); localStorage.removeItem("cg_actorId");
    setToken(null); setUsername(null); setActorId(null);
  };

  return { token, username, actorId, login, logout };
}

function Toggle({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <button onClick={() => setLocale(locale === "en" ? "es" : "en")}
      className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium text-muted hover:text-foreground transition-colors">
      {locale === "en" ? "ES" : "EN"}
    </button>
  );
}

function AuthModal({ d, showAuth, setShowAuth, showRegister, setShowRegister, onRegistered }: {
  d: D; showAuth: boolean; setShowAuth: (v: boolean) => void;
  showRegister: boolean; setShowRegister: (v: boolean) => void; onRegistered: () => void;
}) {
  const [usernameInput, setUsernameInput] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileMode, setTurnstileMode] = useState<"register" | "login" | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef("");

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);

  const destroyWidget = () => {
    if (widgetId.current) {
      const ts = (window as unknown as { turnstile?: { remove: (id: string) => void } }).turnstile;
      ts?.remove(widgetId.current);
      widgetId.current = "";
      setTurnstileToken("");
    }
  };

  useEffect(() => {
    if (!showAuth) {
      setUsernameInput(""); setEmail(""); setPassword(""); setConfirmPassword("");
      setAuthError(""); setTurnstileToken(""); setShowForgot(false); setForgotSent(false);
      setShowResend(false); setResendSent(false); setTurnstileMode(null);
      return;
    }
  }, [showAuth]);

  useEffect(() => {
    if (document.querySelector('script[src*="turnstile"]')) { setTurnstileReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"; script.async = true; script.defer = true;
    script.onload = () => setTurnstileReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!showAuth || showForgot || showResend) {
      destroyWidget();
      return;
    }
    const currentMode = showRegister ? "register" : "login";
    if (currentMode !== turnstileMode) {
      destroyWidget();
      setTurnstileMode(currentMode);
      return;
    }
    if (!turnstileReady || !turnstileRef.current) return;
    requestAnimationFrame(() => {
      if (!turnstileRef.current || widgetId.current) return;
      const ts = (window as unknown as { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string } }).turnstile;
      if (ts) {
        widgetId.current = ts.render(turnstileRef.current, {
          sitekey: "0x4AAAAAAD221rfORj10h6Ry",
          callback: (token: string) => setTurnstileToken(token),
        });
      }
    });
  }, [showAuth, showRegister, showForgot, showResend, turnstileReady, turnstileMode]);

  const handleAuth = async () => {
    if (!turnstileToken) { setAuthError(d.turnstileError); return; }
    setLoading(true); setAuthError("");
    try {
      const endpoint = showRegister ? "/api/auth/register" : "/api/auth/login";
      const body: Record<string, string> = { username: usernameInput, password, turnstileToken };
      if (showRegister) body.email = email;
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) { setResendEmail(email || usernameInput); setShowResend(true); }
        setAuthError(data.error || "Error"); return;
      }
      if (showRegister && data.verified === false) { setShowAuth(false); onRegistered?.(); return; }
      localStorage.setItem("cg_token", data.token);
      localStorage.setItem("cg_username", data.username);
      localStorage.setItem("cg_actorId", data.actorId);
      window.location.reload();
    } catch { setAuthError("Network error"); }
    finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    setForgotLoading(true);
    try { await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: forgotEmail }) }); setForgotSent(true); }
    catch { setAuthError("Network error"); }
    finally { setForgotLoading(false); }
  };

  const handleResend = async () => {
    try { await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resendEmail }) }); setResendSent(true); }
    catch { /* ignore */ }
  };

  if (!showAuth) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAuth(false)}>
      <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-md mx-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {showResend ? (
          <>
            <h2 className="text-2xl font-bold mb-2">{d.resendVerification}</h2>
            <p className="text-sm text-muted mb-6">Please verify your email before signing in.</p>
            <div className="space-y-4">
              <input value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} placeholder={d.emailPlaceholder} type="email" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
              {resendSent ? <p className="text-sm text-primary">{d.resendVerificationSent}</p> : (
                <button onClick={handleResend} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors">{d.resendVerification}</button>
              )}
              <p className="text-center text-sm text-muted"><button onClick={() => { setShowResend(false); setResendSent(false); }} className="text-primary hover:underline">{d.backToLogin}</button></p>
            </div>
          </>
        ) : showForgot ? (
          <>
            <h2 className="text-2xl font-bold mb-2">{d.forgotPasswordTitle}</h2>
            <p className="text-sm text-muted mb-6">{d.forgotPasswordDesc}</p>
            <input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder={d.emailPlaceholder} type="email" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none mb-4" />
            {forgotSent ? <p className="text-sm text-primary mb-4">{d.forgotPasswordEmailSent}</p> : (
              <button onClick={handleForgotPassword} disabled={forgotLoading} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors mb-4">{forgotLoading ? "..." : d.forgotPasswordBtn}</button>
            )}
            <p className="text-center text-sm text-muted"><button onClick={() => { setShowForgot(false); setForgotSent(false); }} className="text-primary hover:underline">{d.backToLogin}</button></p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-6">{showRegister ? d.registerTitle : d.loginTitle}</h2>
            <div className="space-y-4">
              <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder={d.usernamePlaceholder} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
              {showRegister && <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={d.emailPlaceholder} type="email" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />}
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={d.passwordPlaceholder} type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
              {showRegister && <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={d.confirmPassword} type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />}
              <div ref={turnstileRef} className="flex justify-center my-3" />
              {authError && <p className="text-error text-sm">{authError}</p>}
              <button onClick={handleAuth} disabled={loading} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">
                {loading ? (showRegister ? d.registering : d.loggingIn) : (showRegister ? d.registerBtn : d.loginBtn)}
              </button>
              {!showRegister && <p className="text-center text-sm text-muted"><button onClick={() => setShowForgot(true)} className="text-primary hover:underline">{d.forgotPassword}</button></p>}
              <p className="text-center text-sm text-muted">
                {showRegister ? d.haveAccount : d.noAccount}{" "}
                <button onClick={() => { setShowRegister(!showRegister); setAuthError(""); setTurnstileToken(""); }} className="text-primary hover:underline">
                  {showRegister ? d.login : d.register}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("en");
  const d = dict[locale];
  const { token, username, actorId, login, logout } = useAuth();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showMigrate, setShowMigrate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [migrateUrl, setMigrateUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showAuth, setShowAuth] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{ ok?: boolean; reason?: string }>({});

  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("verified");
    if (v === "true") { setVerificationStatus({ ok: true }); window.history.replaceState({}, "", "/"); }
    else if (v === "false") { setVerificationStatus({ ok: false }); window.history.replaceState({}, "", "/"); }
    const rt = params.get("reset-token");
    if (rt) { setResetToken(rt); window.history.replaceState({}, "", "/"); }
  }, []);

  useEffect(() => {
    if (token) {
      fetch("/api/repos", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(data => { if (Array.isArray(data)) setRepos(data); }).catch(() => {});
    }
  }, [token]);

  const handleCreate = async () => {
    if (!newName) return;
    setCreating(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName, description: newDesc, isPrivate: newPrivate ? 1 : 0 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      setSuccess(d.success);
      setNewName(""); setNewDesc(""); setNewPrivate(false);
      setRepos(prev => [data, ...prev]);
      setShowCreate(false);
    } catch { setError("Network error"); }
    finally { setCreating(false); }
  };

  const handleClone = async () => {
    if (!cloneUrl) return;
    setCreating(true); setError("");
    try {
      const name = cloneUrl.split('/').pop()?.replace('.git', '') || 'cloned-repo';
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, description: `Cloned from ${cloneUrl}`, isExternal: 1, externalUrl: cloneUrl, cloneUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      setSuccess(d.success); setCloneUrl(""); setShowClone(false);
      setRepos(prev => [data, ...prev]);
    } catch { setError("Network error"); }
    finally { setCreating(false); }
  };

  const handleMigrate = async () => {
    if (!migrateUrl) return;
    setCreating(true); setError("");
    try {
      const name = migrateUrl.split('/').pop() || 'migrated-repo';
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, description: `Migrated from ${migrateUrl}`, isExternal: 1, externalUrl: migrateUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error"); return; }
      setSuccess(d.success); setMigrateUrl(""); setShowMigrate(false);
      setRepos(prev => [data, ...prev]);
    } catch { setError("Network error"); }
    finally { setCreating(false); }
  };

  const handleResetPassword = async () => {
    if (resetPassword.length < 8) { setResetError("Password must be at least 8 characters"); return; }
    if (resetPassword !== resetConfirm) { setResetError("Passwords do not match"); return; }
    setResetting(true); setResetError("");
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: resetToken, password: resetPassword }) });
      const data = await res.json();
      if (!res.ok) { setResetError(data.error || "Error"); return; }
      setResetDone(true);
    } catch { setResetError("Network error"); }
    finally { setResetting(false); }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024; const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleDeleteRepo = async (repoName: string) => {
    if (!confirm(`Are you sure you want to delete "${repoName}"?`)) return;
    const t = localStorage.getItem("cg_token");
    const res = await fetch(`/api/repos/${repoName}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) setRepos(prev => prev.filter(r => r.name !== repoName));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm group-hover:scale-105 transition-transform">G</div>
            <span className="font-semibold text-lg">{d.title}</span>
          </a>
          <div className="flex items-center gap-3">
            <Toggle locale={locale} setLocale={setLocale} />
            {token ? (
              <>
                <a href="/search" className="text-sm text-muted hover:text-foreground transition-colors">{d.search}</a>
                <a href="/notifications" className="text-sm text-muted hover:text-foreground transition-colors">{d.notifications}</a>
                <a href="/settings" className="text-sm text-muted hover:text-foreground transition-colors">{d.settings}</a>
                <a href={`/${username}`} className="text-sm text-primary font-medium hover:underline">{username}</a>
                <button onClick={logout} className="text-sm text-muted hover:text-error transition-colors">{d.logout}</button>
              </>
            ) : (
              <>
                <button onClick={() => { setShowAuth(true); setShowRegister(false); }} className="text-sm text-muted hover:text-foreground transition-colors">{d.login}</button>
                <button onClick={() => { setShowAuth(true); setShowRegister(true); }} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">{d.register}</button>
              </>
            )}
          </div>
        </div>
      </nav>

      <AuthModal d={d} showAuth={showAuth} setShowAuth={setShowAuth} showRegister={showRegister} setShowRegister={setShowRegister} onRegistered={() => setJustRegistered(true)} />

      <main className="flex-1">
        {resetToken && !resetDone && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="bg-card border border-border rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-2">{d.resetPasswordTitle}</h2>
              <div className="space-y-4 mt-6">
                <input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder={d.passwordPlaceholder} type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
                <input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder={d.confirmNewPassword} type="password" className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
                {resetError && <p className="text-error text-sm">{resetError}</p>}
                <button onClick={handleResetPassword} disabled={resetting} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">{resetting ? "..." : d.resetPasswordBtn}</button>
              </div>
            </div>
          </div>
        )}
        {resetDone && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 text-center">
              <p className="text-green-500 font-semibold">{d.resetPasswordSuccess}</p>
              <button onClick={() => { setResetToken(null); setResetDone(false); setShowAuth(true); }} className="mt-2 text-sm text-primary hover:underline">{d.loginBtn}</button>
            </div>
          </div>
        )}
        {justRegistered && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-center">
              <p className="text-primary font-semibold">{d.checkEmail}</p>
              <button onClick={() => setJustRegistered(false)} className="mt-2 text-xs text-muted hover:text-foreground underline">{d.dismiss}</button>
            </div>
          </div>
        )}
        {verificationStatus.ok && (
          <div className="max-w-lg mx-auto mt-6 px-4">
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 text-center">
              <p className="text-green-500 font-semibold">{d.emailVerified}</p>
              <button onClick={() => { setVerificationStatus({}); setShowAuth(true); }} className="mt-2 text-sm text-primary hover:underline">{d.loginBtn}</button>
            </div>
          </div>
        )}

        {token ? (
          <>
            <section className="max-w-4xl mx-auto px-4 pt-12 pb-8">
              <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold">{d.yourRepos} ({repos.length})</h1>
                <div className="flex gap-3">
                  <button onClick={() => { setShowClone(true); setShowCreate(false); setShowMigrate(false); }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-foreground transition-colors">{d.cloneRepo}</button>
                  <button onClick={() => { setShowMigrate(true); setShowCreate(false); setShowClone(false); }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:text-foreground transition-colors">{d.migrateRepo}</button>
                  <button onClick={() => { setShowCreate(true); setShowClone(false); setShowMigrate(false); }} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">{d.newRepo}</button>
                </div>
              </div>

              {showCreate && (
                <div className="bg-card border border-border rounded-2xl p-6 mb-8 animate-fade-in">
                  <h2 className="text-lg font-bold mb-4">{d.createRepo}</h2>
                  <div className="space-y-4">
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={d.repoNamePlaceholder} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none" />
                    <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder={d.descPlaceholder} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none resize-none h-20" />
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} className="rounded" />
                      {d.private}
                    </label>
                    {error && <p className="text-error text-sm">{error}</p>}
                    <button onClick={handleCreate} disabled={creating || !newName} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">{creating ? "..." : d.submit}</button>
                  </div>
                </div>
              )}

              {showClone && (
                <div className="bg-card border border-border rounded-2xl p-6 mb-8 animate-fade-in">
                  <h2 className="text-lg font-bold mb-4">{d.cloneRepo}</h2>
                  <div className="space-y-4">
                    <input value={cloneUrl} onChange={(e) => setCloneUrl(e.target.value)} placeholder={d.cloneUrlPlaceholder} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none font-mono" />
                    {error && <p className="text-error text-sm">{error}</p>}
                    <button onClick={handleClone} disabled={creating || !cloneUrl} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">{creating ? "..." : d.cloneRepo}</button>
                  </div>
                </div>
              )}

              {showMigrate && (
                <div className="bg-card border border-border rounded-2xl p-6 mb-8 animate-fade-in">
                  <h2 className="text-lg font-bold mb-4">{d.migrateRepo}</h2>
                  <div className="space-y-4">
                    <input value={migrateUrl} onChange={(e) => setMigrateUrl(e.target.value)} placeholder={d.migrateUrlPlaceholder} className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border focus:border-primary outline-none font-mono" />
                    {error && <p className="text-error text-sm">{error}</p>}
                    <button onClick={handleMigrate} disabled={creating || !migrateUrl} className="w-full py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors disabled:opacity-50">{creating ? "..." : d.submit}</button>
                  </div>
                </div>
              )}

              {success && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6 text-center">
                  <p className="text-green-500 font-semibold">{success}</p>
                </div>
              )}

              {repos.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-muted text-lg">{d.noRepos}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {repos.map(repo => (
                    <div key={repo.id}
                      className="relative block bg-card border border-border rounded-xl p-5 hover:bg-card-hover transition-colors">
                      <a href={`/r/${username}/${repo.name}`} className="block">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-bold text-lg">{username}/{repo.name}</h3>
                            {repo.description && <p className="text-muted text-sm mt-1">{repo.description}</p>}
                            <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                              <span>{repo.defaultBranch}</span>
                              <span>{formatBytes(repo.sizeBytes)}</span>
                              <span>{repo.commitCount} {d.commits}</span>
                              <span>{repo.starCount} {d.stars}</span>
                              <span>{repo.forkCount} {d.forks}</span>
                              {repo.isExternal ? <span className="text-primary">External</span> : null}
                            </div>
                          </div>
                        </div>
                      </a>
                      <button onClick={() => handleDeleteRepo(repo.name)}
                        className="absolute top-4 right-4 p-2 rounded-lg bg-error/10 text-error text-xs hover:bg-error/20 transition-colors"
                        title="Delete repository">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
              <div className="max-w-6xl mx-auto px-4 pt-24 pb-32 text-center relative">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-8">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />ActivityPub + Cloudflare
                </div>
                <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-r from-white via-white to-primary bg-clip-text text-transparent">{d.heroTitle}</h1>
                <p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">{d.heroSub}</p>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => { setShowAuth(true); setShowRegister(true); }} className="px-8 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-all hover:scale-105">{d.cta}</button>
                  <a href="#how-it-works" onClick={(e) => { e.preventDefault(); document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" }); }} className="px-8 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-card transition-colors">{d.learnMore}</a>
                </div>
              </div>
            </section>

            <section id="how-it-works" className="max-w-6xl mx-auto px-4 pb-24">
              <h2 className="text-3xl font-bold text-center mb-16">{d.howItWorks}</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { num: "01", title: d.step1, desc: d.step1Desc },
                  { num: "02", title: d.step2, desc: d.step2Desc },
                  { num: "03", title: d.step3, desc: d.step3Desc },
                ].map(step => (
                  <div key={step.num} className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                    <div className="relative bg-card border border-border rounded-2xl p-8">
                      <span className="text-4xl font-bold text-primary/30">{step.num}</span>
                      <h3 className="text-xl font-bold mt-4 mb-3">{step.title}</h3>
                      <p className="text-muted leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="max-w-6xl mx-auto px-4 pb-24">
              <h2 className="text-3xl font-bold text-center mb-16">{d.features}</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { title: d.feature1, desc: d.feature1Desc, icon: "🔄" },
                  { title: d.feature2, desc: d.feature2Desc, icon: "📦" },
                  { title: d.feature3, desc: d.feature3Desc, icon: "📖" },
                ].map(feat => (
                  <div key={feat.title} className="bg-card border border-border rounded-2xl p-8 hover:border-primary/30 transition-colors">
                    <span className="text-3xl mb-4 block">{feat.icon}</span>
                    <h3 className="text-lg font-bold mb-3">{feat.title}</h3>
                    <p className="text-muted leading-relaxed">{feat.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-border py-8 mt-auto">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted">
          <p>{d.poweredBy}</p>
          <a href="https://github.com/manalejandro/cf-git" className="text-primary hover:underline mt-1 inline-block">{d.source}</a>
        </div>
      </footer>
    </div>
  );
}
