/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        cursive: ['var(--font-pacifico)', 'cursive'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          pink: '#e91e63',
          magenta: '#d81b60',
          orange: '#ff5722',
          orangeHover: '#f4511e',
          charcoal: '#212529',
          charcoalHover: '#1a1e21',
        },
      },
    },
  },
  plugins: [],
};
