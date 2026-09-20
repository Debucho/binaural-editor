/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#121316',
          850: '#18191e',
          800: '#1e2026',
          750: '#252830',
          700: '#2c303a',
          600: '#3d4251',
          500: '#565d70',
        },
        studio: {
          accent: '#38bdf8',
          accentDark: '#0284c7',
          keyframe: '#f59e0b',
          timeline: '#22252d',
          grid: '#2f3442',
          track: '#1b1d24',
          clip: '#2563eb',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
