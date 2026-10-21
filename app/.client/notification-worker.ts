// Keep worker emission out of the SSR build, which otherwise relocates its asset.
export { default } from '../lib/notification-worker.ts?worker&url';
