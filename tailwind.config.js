/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#180149',
        background: '#FFF9FC',
        'gray-100': '#FFF9FC',
        'gray-600': '#D9D9D9',
        'gray-700': '#737373',
        'gray-800': '#737373',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        lexend: ['Lexend', 'sans-serif'],
      },
      borderRadius: {
        'pill': '100px',
        'pill-lg': '549.451px',
        'input': '10px',
        'image': '16px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
    },
  },
  plugins: [],
}

