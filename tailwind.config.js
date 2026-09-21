/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Enable dark mode with class strategy
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        /* Body copy. Inter was doing every job; Instrument Sans reads better at the
           12–13px the thread and panels actually use. */
        sans: [
          'Instrument Sans',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        /* Labels, chips, column heads and section titles — the uppercase
           letter-spaced type. A display face, never body copy. */
        display: ['Space Grotesk', 'Instrument Sans', 'system-ui', 'sans-serif'],
        /* Figures that must line up: SLA counters, ids, timestamps, counts.
           `tabular-nums` is the point — a number that changes must not reflow. */
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        /* ⛔ Every token below must exist here or it is not a utility — a
           variable declared in index.css and absent from this map silently
           produces no class at all, which looks exactly like a styling choice. */
        'border-strong': 'hsl(var(--border-strong))',
        hair: 'hsl(var(--hair))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        /* elevation: the canvas is no longer flat white, so surfaces need a
           scale rather than one `bg-white` repeated everywhere. */
        raised: 'hsl(var(--raised))',
        sunken: 'hsl(var(--sunken))',
        'faint-foreground': 'hsl(var(--faint-foreground))',
        /* a machine did it */
        ai: {
          DEFAULT: 'hsl(var(--ai))',
          foreground: 'hsl(var(--ai-foreground))',
          muted: 'hsl(var(--ai-muted))',
          line: 'hsl(var(--ai-line))',
        },
        /* internal-only — never customer-visible */
        note: {
          DEFAULT: 'hsl(var(--note))',
          foreground: 'hsl(var(--note-foreground))',
          muted: 'hsl(var(--note-muted))',
          line: 'hsl(var(--note-line))',
        },
        /* an incoming message sits ABOVE the thread canvas; panels sit level */
        bubble: {
          DEFAULT: 'hsl(var(--bubble))',
          line: 'hsl(var(--bubble-line))',
          well: 'hsl(var(--bubble-well))',
        },
        /* on-bubble roles for a reply WE wrote */
        agent: {
          DEFAULT: 'hsl(var(--agent))',
          foreground: 'hsl(var(--agent-foreground))',
          line: 'hsl(var(--agent-line))',
          dim: 'hsl(var(--agent-dim))',
          link: 'hsl(var(--agent-link))',
          hair: 'hsl(var(--agent-hair))',
          fill: 'hsl(var(--agent-fill))',
        },
        /* a white-ground sender image cannot be re-tinted, so it gets a plate */
        plate: {
          DEFAULT: 'hsl(var(--plate))',
          line: 'hsl(var(--plate-line))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          muted: 'hsl(var(--primary-muted))',
          line: 'hsl(var(--primary-line))',
          solid: 'hsl(var(--primary-solid, var(--primary)))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          muted: 'hsl(var(--destructive-muted))',
          line: 'hsl(var(--destructive-line))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          muted: 'hsl(var(--success-muted))',
          line: 'hsl(var(--success-line))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          muted: 'hsl(var(--warning-muted))',
          line: 'hsl(var(--warning-line))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
