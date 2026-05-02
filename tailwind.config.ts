import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Token values live as CSS variables in src/styles/tokens.css so they can
// be themed at runtime. Tailwind just names them.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1200px",
      },
    },
    extend: {
      colors: {
        // Brand — straight from docs/brand/tokens.md
        brand: {
          orange: "hsl(var(--brand-orange))",
          red: "hsl(var(--brand-red))",
          charcoal: "hsl(var(--brand-charcoal))",
          yellow: "hsl(var(--brand-yellow))",
          grey: "hsl(var(--brand-grey))",
          "grey-light": "hsl(var(--brand-grey-light))",
          navy: "hsl(var(--brand-navy))",
          sky: "hsl(var(--brand-sky))",
        },
        // Semantic UI tokens (for shadcn/ui compatibility)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(38, 38, 38, 0.05)",
        md: "0 4px 6px -1px rgba(38, 38, 38, 0.08), 0 2px 4px -2px rgba(38, 38, 38, 0.08)",
        lg: "0 10px 15px -3px rgba(38, 38, 38, 0.08), 0 4px 6px -4px rgba(38, 38, 38, 0.08)",
      },
    },
  },
  plugins: [animate],
};

export default config;
