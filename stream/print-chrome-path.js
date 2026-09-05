// Prints the filesystem path to the Chromium binary that Playwright already
// downloaded (or that's baked into the mcr.microsoft.com/playwright image).
//
// We deliberately do NOT use playwright.chromium.launch() to open the
// browser for streaming — Playwright drives Chrome over the DevTools
// (CDP) remote-debugging protocol, and that automation layer is what
// stops `--kiosk` from fully hiding the address bar/tabs. Launching the
// same binary as a plain OS process (see the workflow's "Start virtual
// display + browser" step) has no such layer, so --kiosk works exactly
// like it does for a human using kiosk mode.
console.log(require('playwright').chromium.executablePath());
