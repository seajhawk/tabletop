# Desktop PWA verification

## Verified on 2026-11-22

**36/36 checks passed** in Windows Chrome 158.0.8127.36 around 6:25 AM Pacific.
Source: Pass 22 (`b728a79`) plus local PWA fixes. The production manifest identity fix
below was included. The fixture changed only the app name to a unique test label,
plus the smoke marker/probe; no public deployment or normal browser profile was used.

- Installed the `/TTDefense/` fixture using its browser-reported manifest identity.
- Launched an actual standalone app window with the game, activated worker and full 23-file cache.
- Shut down the fixture server and confirmed HTTP was unreachable.
- Closed Chrome cleanly, then launched a different process using the same isolated profile.
- Launched the installed app directly while the server stayed off: standalone mode, game boot,
  cached asset bodies and the localStorage sentinel all survived.
- Captured the exact launched page's navigation: HTTP 200, `fromServiceWorker: true`,
  `serviceWorkerResponseSource: "cache-storage"`, and the expected versioned cache name.
- Uninstalled the exact test identity. Chrome then returned `-32602 Unknown web-app manifest id`
  for that identity. Both owned browser processes exited normally; the fixture server exited.
- Zero script errors or page issues. A separate filesystem check found no remaining test shortcuts
  in user/common Desktop and Start Menu Programs directories, including the earlier diagnostic install.

Evidence: [desktop run](verification/2026-11-22-desktop-pwa-ttdefense.json),
[shortcut cleanup](verification/2026-11-22-desktop-shortcut-cleanup.json).
The successful run used Chrome PIDs 67396 and 69792 and completed in 8.55 seconds.
Ignored profile/log files remain under `.tasks/` for diagnosis.

## Manifest identity fix

The old public manifest used `"id": "./"`. Chrome reported the origin root as its identity
even when opened at `/TTDefense/`, with `/TTDefense/` as the recommended ID. Sibling deployments
therefore shared one install identity.

Removed that explicit ID so the resolved `start_url` supplies the identity. This follows the
[manifest ID processing rules](https://www.w3.org/TR/appmanifest/#id-member).
Actual Chrome checks now report three distinct identities ending in `/`, `/tabletop/` and
`/TTDefense/`: [browser evidence](verification/2026-11-22-manifest-identities.json).
Four regression cases cover those deployment identities; all **47 focused PWA tests passed**
(manifest 4, worker 21, controller 22). Fresh production fixture builds succeeded for all three bases.

The root app keeps its identity. Existing subpath installs may retain the old root identity, and
a corrected subpath app may be offered as a separate installation. Automatic migration and shortcut
replacement are **unverified**. This local change does not remove existing user installations;
verify a replacement opens the intended deployment before deciding to remove an old shortcut.

## Reproduce

Requires installed Chrome, Node and the existing `proto-web/node_modules`.

```powershell
# Terminal 1: unique fixture output, loopback only; adds a unique test app name.
node scripts/pwa-smoke-server.mjs --desktop-smoke

# Terminal 2: explicitly authorizes stopping that fixture server for the offline proof.
node scripts/pwa-desktop-smoke.mjs --shutdown-fixture-for-offline
# Optional: --base root|tabletop|TTDefense  (default TTDefense)
#           --origin http://127.0.0.1:4187
#           --browser-exe "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

The helper uses Node builtins, a unique `.tasks/pwa-desktop-*/profile`, and only its own
Chrome child processes. It leaves the profile and JSON result in place; it never removes a directory.
The existing `proto-web/dist` is untouched. The fixture server also expires after ten minutes.

## Automation details and limits

- Chrome's local inherited debugging pipe carries PWA commands; a loopback debugging port is used
  only to read the installed browser's protocol schema. WebSocket calls returned `-32601` in this
  Windows build, including with `--enable-devtools-pwa-handler`. That flag alone was insufficient.
  The final helper uses `--remote-debugging-pipe`, not that flag.
  [Chromium handler registration](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/chrome/browser/devtools/chrome_devtools_session.cc).
- `PWA.launch` returns a tab target. The helper attaches its page child and ties navigation evidence
  to that exact session and start URL. `fromDiskCache: true` is compatible with the observed worker's
  persistent Cache Storage response; explicit worker/cache-storage provenance is required.
- CDP installation does not exercise the browser's install dialog. The test explicitly selects
  standalone display mode after installation.
  [Official PWA tooling](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/tools/pwa.ts).
- Main work is bounded to 75 seconds plus 15 seconds for cleanup. Generic protocol errors never count
  as uninstall confirmation. Cleanup failures record the owned identity, name and retained profile.
- Not proven: normal-user install prompts, a real released-version migration, Edge/other browsers,
  physical touch/DPI/thermal behaviour, public CDN updates, or a packaged Windows executable.
