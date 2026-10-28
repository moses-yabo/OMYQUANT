# Installable OMYQUANT web app

OMYQUANT remains the same React Router website. Its web manifest requests a standalone home-screen app with the existing logo and the same origin, routes, authentication and service tools. Installation is optional. It does not create a native APK or an app-store listing.

## Mobile installation

On HTTPS (or localhost), eligible mobile browsers that dispatch `beforeinstallprompt` receive a small install card after eight seconds. **Install app** invokes the browser's native installation dialog from that explicit tap. The browser decides whether installation is available and the user confirms it; the site cannot force a download or open that native dialog automatically. Desktop browsers retain their own installation UI.

iPhone/iPad visitors receive instructions to open **Share → Add to Home Screen → Add**, keeping **Open as Web App** enabled if offered. Available menu items depend on the browser and OS. There is no fake iOS native Install button. Already installed standalone windows do not show the card. Dismissing it pauses offers for seven days in that browser; if storage is blocked, dismissal still works for the current visit. Native prompt failures fall back to browser-menu instructions.

The root-level controller is mounted after hydration, removes its listeners/timers on cleanup and never requests notification permission. Existing browser notifications retain their separate opt-in and worker. HTTPS is needed on a physical phone; an HTTP LAN address used for local development is not a secure context.

## Offline and update behavior

`public/sw.js` registers at `/` independently of the notification worker's asset-directory scope. Its only cached response is the public `offline.html` connection page. Eligible same-origin GET document navigations use the network; on a network failure they show that generic page. HTTP errors, including authentication failures, pass through unchanged. API requests, OAuth callbacks, media, private business documents, form submissions and background loader requests are never intercepted or cached. There is no offline booking queue or automatic mutation retry. After an interrupted submission, check account activity before resubmitting.

The worker does not store customer/account pages, API responses, credentials, private documents, listing photos or app bundles. It does not provide a fully offline marketplace or guarantee an offline fallback before first successful activation. Cache cleanup removes only obsolete `omyquant-offline-*` caches. Worker updates follow the normal browser lifecycle, without forcing open pages to reload; close existing windows to let a waiting update activate. Increment the offline cache version when changing the offline page.

The existing Node static-file server serves the manifest as `application/manifest+json`, the offline page as HTML and the worker as JavaScript. Manifest, offline page and worker responses revalidate; existing hashed asset caching remains intact. The 192/512px app icons and 180px Apple icon are resized copies of the current favicon. No new dependency, hosting configuration or deployment is introduced.

## Verification

Run `npm run typecheck` and `npm test`. Installation-controller tests cover user-gesture prompting, dismissal, installed/insecure/desktop suppression, iOS guidance, cleanup and registration options. Worker tests exercise cache boundaries, network-failure fallback, unchanged HTTP errors and production manifest/icon assets. These tests use simulated browser events and service-worker APIs.

Before release, use the production build on localhost or HTTPS and verify these steps on actual devices:

1. Android Chrome/Edge: wait for browser eligibility and the card, tap Install app, confirm, launch the icon and check standalone mode. If dismissed, the custom card should stay hidden for seven days.
2. iPhone/iPad: follow the Share menu instructions and launch from the home screen. The card should be hidden in the installed app.
3. Sign in, navigate business/admin tools as applicable, submit a booking and test existing opt-in notifications without changing account permissions.
4. After the worker activates, disconnect and navigate: the generic connection page should appear. No previous private page/data should appear from Cache Storage, and no interrupted mutation should replay automatically.
5. Reconnect and reload. Verify server-rendered pages and authenticated requests resume normally. Test an update with an existing app window and confirm it becomes active after old windows close.

Browser references: [MDN installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN install prompting](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt), and [Apple home-screen installation](https://support.apple.com/en-kw/guide/iphone/iphea86e5236/27/ios/27).
