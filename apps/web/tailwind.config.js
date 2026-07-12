/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        court: {
          // Sports-glass palette (navy + violet + gold) — readable, not void-black
          bg: "#12163a",
          panel: "#1a2050",
          elevated: "#242b66",
          line: "rgba(255,255,255,0.14)",
          muted: "#c5cbe0",
          accent: "#8b5cf6",
          accent2: "#a78bfa",
          neon: "#22d3ee",
          gold: "#fbbf24",
          lime: "#8b5cf6",
          rose: "#fb7185",
        },
      },
      fontFamily: {
        display: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        brand: ["'Bebas Neue'", "Impact", "sans-serif"],
        tagline: ["'Instrument Serif'", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
        "3xl": "24px",
        "4xl": "32px",
      },
      boxShadow: {
        glow: "0 0 40px -6px rgba(139,92,246,0.55)",
        soft: "0 0 0 1px rgba(255,255,255,0.08), 0 16px 48px -16px rgba(10,14,40,0.7)",
        neon: "0 0 60px -10px rgba(34,211,238,0.45)",
        frame:
          "0 0 0 1px rgba(139,92,246,0.22), 0 0 80px -18px rgba(139,92,246,0.5), 0 28px 80px -28px rgba(8,10,30,0.85)",
      },
      backgroundImage: {
        "btn-grad": "linear-gradient(135deg, #a78bfa 0%, #7c3aed 55%, #6d28d9 100%)",
        "lime-glow":
          "radial-gradient(80% 60% at 50% 0%, rgba(139,92,246,0.35) 0%, transparent 55%), radial-gradient(55% 45% at 0% 80%, rgba(34,211,238,0.18) 0%, transparent 50%), radial-gradient(55% 45% at 100% 70%, rgba(251,191,36,0.12) 0%, transparent 50%)",
        "app-glow":
          "radial-gradient(70% 50% at 50% -10%, rgba(167,139,250,0.4) 0%, transparent 55%), radial-gradient(50% 40% at 100% 50%, rgba(34,211,238,0.12) 0%, transparent 50%)",
      },
      transitionTimingFunction: {
        saas: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "spin-slow": "spin 8s linear infinite",
      },
    },
  },
  plugins: [],
};
