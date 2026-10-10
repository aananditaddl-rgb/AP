import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Treatly – cheat meal tracker",
    short_name: "Treatly",
    description: "Track your cheat meals in seconds and keep each other on track.",
    start_url: "/home",
    display: "standalone",
    background_color: "#fff8f2",
    theme_color: "#ff6f4f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
