import sizes from "./apple-startup-sizes.json";

// Rendered in the original HTML head so Safari can discover launch assets
// before hydration or installation. Android continues using the manifest.
export function applePwaLinks() {
  return [
    { rel: "apple-touch-icon", type: "image/png", sizes: "180x180", href: "/apple-touch-icon.png?v=3" },
    ...sizes.flatMap(({ width, height, scale }) =>
      (["portrait", "landscape"] as const).map(orientation => {
        const pixels = orientation === "portrait"
          ? `${width * scale}x${height * scale}`
          : `${height * scale}x${width * scale}`;
        return {
          rel: "apple-touch-startup-image",
          type: "image/png",
          href: `/images/apple-startup-v1/${pixels}.png`,
          media: `screen and (device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: ${orientation})`,
        };
      }),
    ),
  ];
}
