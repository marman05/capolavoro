import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FitTrack AI",
    short_name: "FitTrack",
    description: "Calorie, alimentazione, acqua e allenamenti con AI",
    start_url: "/",
    display: "standalone",
    background_color: "#f8faf8",
    theme_color: "#16a34a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
