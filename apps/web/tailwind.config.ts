import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ggtech: {
          blue:      '#0056b3',
          lightblue: '#007bff',
          darkblue:  '#003366',
          gray:      '#4a5568',
          lightgray: '#f8f9fa',
        },
      },
      fontFamily: {
        sans:     ['Roboto', 'sans-serif'],
        heading:  ['Open Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
