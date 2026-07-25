import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // The app is online-only (all data lives in Supabase), so the
      // offline-precache service worker only ever caused harm: browsers
      // kept serving weeks-old builds ("why is the FOF missing?").
      // selfDestroying ships a replacement worker that unregisters the
      // old one, clears its caches, and reloads — every stale client
      // heals itself on its next visit. Install-to-desktop still works
      // via the manifest.
      selfDestroying: true,
      includeAssets: ["favicon.ico", "robots.txt"],
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
      manifest: {
        name: "Financial Options Form",
        short_name: "Financial Options Form",
        description: "Financial Options Form builder",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192x192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/pwa-512x512.svg", sizes: "512x512", type: "image/svg+xml" },
          { src: "/pwa-512x512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
