"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Building2, ExternalLink, Home, Images, Inbox, LayoutGrid, LogOut } from "lucide-react";
import Logo from "@/components/Logo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { stripLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { getStaffClient } from "@/lib/staffClient";

export type StaffRole = "dev" | "staff";
export type StaffContext = { session: Session; role: StaffRole };

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[70dvh] items-center justify-center px-4">{children}</div>;
}

// Login form, then the console frame. This only decides what to show: the database (RLS on
// site.staff / site.is_staff()) is what actually stops a non-staff account from changing data.
export default function StaffShell({ children }: { children: (ctx: StaffContext) => ReactNode }) {
  const supabase = getStaffClient();
  const { dict } = useI18n();
  const pathname = stripLocale(usePathname());

  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<StaffRole | null | undefined>(undefined); // undefined = loading
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setRole(undefined);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("staff")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setRole((data?.role as StaffRole | undefined) ?? null));
  }, [session, supabase]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSigningIn(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSigningIn(false);
    if (authError) setError(authError.message);
  }

  const signOut = () => supabase.auth.signOut({ scope: "local" });

  if (checking || (session && role === undefined)) {
    return <Centered><p className="text-muted">{dict.staff.common.loading}</p></Centered>;
  }

  if (!session) {
    const field = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base focus:border-accent";
    return (
      <Centered>
        <form onSubmit={signIn} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
          <Logo />
          <h1 className="text-xl font-semibold">{dict.staff.title}</h1>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span>{dict.staff.email}</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required className={field} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{dict.staff.password}</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required className={field} />
          </label>
          <button type="submit" disabled={signingIn} className="w-full rounded-lg bg-brand px-4 py-2.5 font-medium text-brand-fg disabled:opacity-60">
            {signingIn ? dict.staff.signingIn : dict.staff.signIn}
          </button>
        </form>
      </Centered>
    );
  }

  if (!role) {
    return (
      <Centered>
        <div className="text-center">
          <p className="text-muted">{dict.staff.notStaff}</p>
          <button onClick={signOut} className="mt-4 text-sm text-accent underline">{dict.staff.signOut}</button>
        </div>
      </Centered>
    );
  }

  const links = [
    { href: "/staff", label: dict.staff.nav.dashboard, icon: Home },
    { href: "/staff/flats", label: dict.staff.nav.flats, icon: LayoutGrid },
    { href: "/staff/projects", label: dict.staff.nav.projects, icon: Building2 },
    { href: "/staff/views", label: dict.staff.nav.views, icon: Images },
    { href: "/staff/leads", label: dict.staff.nav.leads, icon: Inbox },
  ];
  const active = (href: string) => (href === "/staff" ? pathname === "/staff" : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/staff" className="shrink-0"><Logo /></Link>
          <span className="hidden text-sm text-muted sm:inline">{dict.staff.title}</span>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" target="_blank" className="hidden items-center gap-1 rounded-lg px-2 py-2 text-sm text-muted hover:text-fg sm:inline-flex">
              {dict.staff.viewSite} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <LanguageSwitcher />
            <ThemeToggle />
            <button onClick={signOut} title={dict.staff.signOut} aria-label={dict.staff.signOut} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        {/* Tabs scroll sideways on phones; staff mostly use this from a phone, like Shelby's. */}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                active(href) ? "bg-brand text-brand-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children({ session, role })}</main>
    </div>
  );
}
