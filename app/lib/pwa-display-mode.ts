// Installing from a browser tab must not turn that tab into the app layout.
// Only the window actually running in standalone mode uses app navigation.
export function connectPwaDisplayMode(changed: (installed: boolean) => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  const update = () => changed(media.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);
  update();
  media.addEventListener("change", update);
  window.addEventListener("pageshow", update);
  return () => {
    media.removeEventListener("change", update);
    window.removeEventListener("pageshow", update);
  };
}
