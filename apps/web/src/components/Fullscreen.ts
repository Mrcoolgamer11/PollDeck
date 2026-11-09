export function toggleFullscreen(el?: HTMLElement | null) {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const target = (el ?? document.documentElement) as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
  } else {
    (target.requestFullscreen ?? target.webkitRequestFullscreen)?.call(target);
  }
}
