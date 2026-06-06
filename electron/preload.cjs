// electron/preload.cjs
// Minimal, sandboxed preload — exposes a tiny read-only API to the renderer
// so the React app can detect that it is running inside the Electron shell.

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronApp", {
  isElectron:    true,
  platform:      process.platform,
  appName:       "DoT",
  // Exposed safely — does not expose any IPC, Node, or filesystem APIs
});
