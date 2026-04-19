import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Brillamax",
    short_name: "Brillamax",
    description:
      "Gestión integral para microfábrica de productos de limpieza: inventario, recetas, producción, ventas y CxC. Dual-currency USD/VEF, offline-first.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffaf7",
    theme_color: "#c75146",
    lang: "es-VE",
    categories: ["business", "productivity", "finance"],
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
