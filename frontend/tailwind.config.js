import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  // This 'content' array is the most important part.
  // It MUST tell Tailwind to scan all your files for classes.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // This line finds all your component files
  ],
  theme: {
    extend: {
      // This adds the "Inter" font to match the preview
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}