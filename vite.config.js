import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // WICHTIG: Repo-Name als base, damit Pages korrekt lädt
  base: '/arbeitszeit-tracker/'
})
