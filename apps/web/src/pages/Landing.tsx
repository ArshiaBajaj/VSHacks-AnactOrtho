import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Camera,
  Film,
  UserPlus,
  ArrowUpRight,
  ScanEye,
  Cpu,
  Brain,
} from "lucide-react";

const FEATURES = [
  {
    to: "/live",
    label: "01 · Live",
    title: "Courtside camera",
    blurb:
      "Calibrate, tip off, whistle & score — manual controls plus browser CV heuristics in one session.",
    cta: "Start Live",
    icon: Camera,
    image: null as string | null,
  },
  {
    to: "/film",
    label: "02 · Film",
    title: "Film Room",
    blurb:
      "HUD replay of real 2023–24 NBA finals — reconstructed play-by-play from the final score, not broadcast video.",
    cta: "Open Film Room",
    icon: Film,
    image: "/hero-player.png",
  },
  {
    to: "/iq",
    label: "03 · IQ",
    title: "HooperIQ",
    blurb:
      "Real YouTube game film freezes on the decision. Draw, describe your read, learn mistakes and consequences.",
    cta: "Train IQ",
    icon: Brain,
    image: "/hero-court.jpg",
  },
  {
    to: "/recruit",
    label: "04 · Recruit",
    title: "Recruit pipeline",
    blurb:
      "Needs local API (backend/run.sh). Upload or Try demo → process → scout card from that game.",
    cta: "Set up Recruit",
    icon: UserPlus,
    image: "/hero-ticket.jpg",
  },
] as const;

export function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-court-bg px-2.5 py-2.5 sm:px-4 sm:py-4 md:px-5 md:py-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-app-glow opacity-100"
      />

      <div className="relative mx-auto flex min-h-[calc(100dvh-1.25rem)] max-w-[1400px] flex-col overflow-hidden rounded-[28px] border border-white/10 shadow-frame md:min-h-[calc(100dvh-2.5rem)] md:rounded-[32px]">
        <div className="absolute inset-0">
          <img
            src="/hero-court.jpg"
            alt=""
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-court-bg/75 via-court-bg/55 to-court-bg/92" />
          <div className="absolute inset-0 bg-gradient-to-t from-court-bg via-court-panel/40 to-transparent" />
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(18,22,58,0.55)_0%,rgba(18,22,58,0.2)_45%,transparent_72%)]"
          />
        </div>

        <header className="relative z-20 flex items-center justify-between gap-3 px-5 py-5 md:px-8 md:py-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Anact Ortho home">
            <CourtMark />
            <span className="hidden font-brand text-lg tracking-wide text-court-neon sm:inline">
              Anact <span className="text-court-accent2">Ortho</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {FEATURES.map((f) => (
              <Link
                key={f.to}
                to={f.to}
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-court-muted transition-colors duration-200 hover:text-white"
              >
                {f.label.replace(/^\d+ · /, "")}
              </Link>
            ))}
          </nav>

          <Link
            to="/live"
            className="rounded-full bg-btn-grad px-4 py-2 text-xs font-semibold text-white shadow-glow transition-transform duration-200 hover:scale-105 hover:brightness-110"
          >
            Open Live
          </Link>
        </header>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-6 pt-4 text-center md:pb-2 md:pt-0">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] as const }}
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 md:gap-x-5"
          >
            <h1 className="font-brand text-[clamp(3.5rem,14vw,9.5rem)] leading-[0.85] tracking-[0.02em] text-court-neon">
              ANACT
              <span className="text-court-accent2"> ORTHO</span>
            </h1>
            <BallTrail className="hidden h-14 w-14 shrink-0 translate-y-1 sm:block md:h-20 md:w-20 md:translate-y-2" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.45 }}
            className="font-tagline mt-4 text-lg italic text-white md:mt-5 md:text-2xl"
          >
            Four ways in. One courtside brain.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.45 }}
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
              <ScanEye className="h-3 w-3" /> Browser CV
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
              <Cpu className="h-3 w-3" /> On-device pose
            </span>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.19, duration: 0.45 }}
            className="mt-3 max-w-lg text-sm leading-relaxed text-court-muted md:text-base"
          >
            Live camera. Film HUD. HooperIQ reads. Recruit when the local API is
            running — pick a door below.
          </motion.p>
        </div>

        <div className="relative z-10 grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4 md:px-5 md:pb-5">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.to}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 + i * 0.08, duration: 0.5 }}
                className="relative flex min-h-[240px] flex-col overflow-hidden rounded-[22px] border border-white/15 bg-court-elevated/80 backdrop-blur-md md:min-h-[280px]"
              >
                {f.image && (
                  <>
                    <img
                      src={f.image}
                      alt=""
                      className={`absolute inset-0 h-full w-full object-cover ${
                        f.to === "/film" ? "object-top opacity-70" : "opacity-55"
                      }`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-court-bg via-court-panel/60 to-transparent" />
                  </>
                )}
                <div className="relative flex flex-1 flex-col justify-between p-6 md:p-7">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-court-accent2">
                      {f.label}
                    </p>
                    <p className="mt-2 font-brand text-3xl leading-none text-white md:text-4xl">
                      {f.title}
                    </p>
                    <p className="mt-3 max-w-[16rem] text-sm leading-snug text-court-muted">
                      {f.blurb}
                    </p>
                  </div>
                </div>
                <Link
                  to={f.to}
                  className="relative flex items-center justify-between bg-btn-grad px-5 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {f.cta}
                  </span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CourtMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" stroke="white" strokeWidth="1.5" />
      <path
        d="M6 26V6h8c4.4 0 8 3.6 8 8s-3.6 8-8 8H6"
        stroke="white"
        strokeWidth="1.5"
        fill="none"
      />
      <circle cx="22" cy="10" r="2" fill="#8b5cf6" />
    </svg>
  );
}

function BallTrail({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden>
      <path
        d="M8 40c12-2 22-1 28 2"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M4 48c14-1 24 0 30 3"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.2"
      />
      <circle cx="52" cy="40" r="18" fill="white" />
      <path
        d="M52 22c4 6 4 14 0 20M52 22c-4 6-4 14 0 20M34 40h36M38 30c9 3 19 3 28 0M38 50c9-3 19-3 28 0"
        stroke="#0a0a0a"
        strokeWidth="1.6"
        fill="none"
      />
    </svg>
  );
}
