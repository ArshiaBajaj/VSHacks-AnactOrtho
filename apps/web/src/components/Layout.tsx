import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, Radio, Film, UserPlus, Brain } from "lucide-react";
import { Logo } from "./Logo";

const NAV = [
  { to: "/live", label: "Live", icon: Radio },
  { to: "/film", label: "Film", icon: Film },
  { to: "/iq", label: "IQ", icon: Brain },
  { to: "/recruit", label: "Recruit", icon: UserPlus },
];

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: Home },
  ...NAV,
];

export function Layout() {
  const { pathname } = useLocation();
  const isFullBleed = pathname === "/" || pathname === "/recruit";

  if (isFullBleed) {
    return (
      <div className="min-h-dvh w-full bg-court-bg text-white">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-court-bg px-2.5 py-2.5 text-white sm:px-4 sm:py-4 md:px-5 md:py-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-app-glow opacity-100"
      />

      <div className="relative mx-auto flex min-h-[calc(100dvh-1.25rem)] max-w-[1400px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-court-panel/90 shadow-frame backdrop-blur-xl md:min-h-[calc(100dvh-2.5rem)] md:rounded-[32px]">
        <header className="relative z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-5 py-4 md:px-8 md:py-5">
          <NavLink to="/" aria-label="Home" className="shrink-0">
            <Logo size={28} />
          </NavLink>

          <nav className="hidden items-center gap-7 sm:flex">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors duration-200 ${
                    isActive
                      ? "text-court-accent2"
                      : "text-court-muted hover:text-white"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <NavLink
            to="/live"
            className="inline-flex items-center justify-center rounded-full bg-btn-grad px-4 py-2 text-[12px] font-semibold text-white shadow-glow transition-all duration-200 hover:brightness-110"
          >
            Open Live
          </NavLink>
        </header>

        <main className="relative z-10 flex-1 overflow-y-auto px-4 pb-28 pt-6 md:px-8 md:pb-10 md:pt-8">
          <Outlet />
        </main>

        <nav className="absolute inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-0.5 rounded-2xl border border-white/15 bg-court-panel/85 p-1 shadow-soft backdrop-blur-xl sm:hidden">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[9px] font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-btn-grad text-white shadow-glow"
                    : "text-court-muted hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
