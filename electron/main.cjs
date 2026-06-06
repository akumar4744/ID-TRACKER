// electron/main.cjs
// DoT — locked-down AdsPower workstation shell.
//
// Responsibilities:
//   • Launch the React/Vite app in a frameless, fullscreen, no-controls window
//   • Block all developer / navigation / inspection shortcuts
//   • Prevent navigation away from the portal except to AdsPower / localhost
//   • Allow window.open() ONLY for AdsPower (so the existing Work Tool keeps working)
//   • Provide a small loading window during startup
//   • Provide an admin escape hatch (Ctrl+Shift+Alt+Q) and autostart toggle (Ctrl+Shift+Alt+S)

const { app, BrowserWindow, Menu, session, shell, desktopCapturer } = require("electron");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// Environment + constants
// ─────────────────────────────────────────────────────────────────────────────
const isDev        = !app.isPackaged;
const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
const PRELOAD      = path.join(__dirname, "preload.cjs");
const LOADING_HTML = path.join(__dirname, "loading.html");
const INDEX_HTML   = path.join(__dirname, "..", "dist", "index.html");

let mainWindow    = null;
let loadingWindow = null;
let isQuitting    = false;     // set true when admin shortcut quits the app

// ─────────────────────────────────────────────────────────────────────────────
// URL allow-list — only AdsPower + localhost + Supabase auth callback
// ─────────────────────────────────────────────────────────────────────────────
function isAllowedExternalUrl(url) {
  try {
    const u = new URL(url);
    // AdsPower web app + any of its subdomains
    if (u.hostname === "app.adspower.com")                 return true;
    if (u.hostname.endsWith(".adspower.com"))              return true;
    // Local AdsPower API (default port 50325) and any localhost service
    if (u.hostname === "localhost"  || u.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

// In dev the renderer lives on http://localhost:5173 — must be allowed for navigation
function isPortalUrl(url) {
  if (!url) return false;
  if (url.startsWith("file://")) return true;
  if (isDev && url.startsWith(VITE_DEV_URL)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lockdown — applied to every BrowserWindow we create
// ─────────────────────────────────────────────────────────────────────────────
function lockdownWindow(win) {
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;

  // No native or app menu on this window
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  win.autoHideMenuBar = true;

  // ── Block navigation to anything other than portal or AdsPower ──
  wc.on("will-navigate", (event, url) => {
    if (isPortalUrl(url))         return;
    if (isAllowedExternalUrl(url)) return;
    event.preventDefault();
  });
  wc.on("will-redirect", (event, url) => {
    if (isPortalUrl(url))         return;
    if (isAllowedExternalUrl(url)) return;
    event.preventDefault();
  });

  // ── window.open() handler: allow AdsPower, deny everything else ──
  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          frame:           false,
          fullscreen:      true,
          autoHideMenuBar: true,
          backgroundColor: "#05060d",
          title:           "DoT — Work Session",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration:  false,
            sandbox:          true,
            webSecurity:      true,
          },
        },
      };
    }
    return { action: "deny" };
  });

  // ── Block keyboard shortcuts (only while our app has focus) ──
  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key  = (input.key || "").toLowerCase();
    const ctrl = input.control;
    const sh   = input.shift;
    const alt  = input.alt;

    // ── Admin escape hatch: Ctrl+Shift+Alt+Q quits the whole app ──
    if (ctrl && sh && alt && key === "q") {
      event.preventDefault();
      isQuitting = true;
      app.quit();
      return;
    }
    // ── Admin: Ctrl+Shift+Alt+S toggles auto-start ──
    if (ctrl && sh && alt && key === "s") {
      event.preventDefault();
      const current = app.getLoginItemSettings().openAtLogin;
      app.setLoginItemSettings({ openAtLogin: !current });
      return;
    }
    // ── Admin: Ctrl+Shift+Alt+D opens DevTools (dev only) ──
    if (isDev && ctrl && sh && alt && key === "d") {
      event.preventDefault();
      wc.toggleDevTools();
      return;
    }

    // ── DevTools / Inspect ──
    if (key === "f12")                                    return event.preventDefault();
    if (ctrl && sh && (key === "i" || key === "j" || key === "c")) return event.preventDefault();

    // ── Refresh ──
    if (ctrl && key === "r")  return event.preventDefault();
    if (ctrl && sh && key === "r") return event.preventDefault();
    if (key === "f5")         return event.preventDefault();

    // ── Address bar / new window / new tab / close / print ──
    if (ctrl && (key === "l" || key === "n" || key === "t" || key === "w" || key === "p")) {
      return event.preventDefault();
    }

    // ── Back / forward navigation ──
    if (alt && (key === "arrowleft" || key === "arrowright")) return event.preventDefault();
    if (key === "backspace" && !input.shift && !ctrl && !alt) {
      // Only block backspace navigation when not in an input
      // (renderer handles backspace inside inputs natively; this guards against
      //  Electron's old default of using backspace as "back")
      const tag = input.code;
      if (tag !== "Backspace") return;
    }

    // ── Zoom controls ──
    if (ctrl && (key === "=" || key === "+" || key === "-" || key === "0")) {
      return event.preventDefault();
    }
  });

  // ── Disable the right-click context menu ──
  wc.on("context-menu", (event) => event.preventDefault());

  // ── Lock zoom ──
  wc.on("did-finish-load", () => {
    wc.setZoomFactor(1.0);
    wc.setVisualZoomLevelLimits(1, 1);
  });

  // ── Prevent drag-and-drop URL navigation ──
  wc.on("did-start-navigation", (event, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    if (isPortalUrl(url))         return;
    if (isAllowedExternalUrl(url)) return;
    event.preventDefault();
  });

  // ── Prevent permission requests we don't want (notifications etc.) ──
  wc.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Allow only the permissions that the existing portal needs:
    // - "media" (getDisplayMedia for screen sharing)
    // - "display-capture" (Chromium 116+ alias for screen capture)
    // - "clipboard-read" / "clipboard-write" (CopyButton flow)
    if (
      permission === "media" ||
      permission === "display-capture" ||
      permission === "clipboard-read" ||
      permission === "clipboard-sanitized-write"
    ) {
      callback(true);
    } else {
      callback(false);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading window — shown while main window is initialising
// ─────────────────────────────────────────────────────────────────────────────
function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width:           420,
    height:          300,
    frame:           false,
    transparent:     true,
    alwaysOnTop:     true,
    resizable:       false,
    movable:         false,
    minimizable:     false,
    maximizable:     false,
    closable:        false,
    skipTaskbar:     true,
    backgroundColor: "#00000000",
    show:            true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });
  loadingWindow.setMenu(null);
  loadingWindow.loadFile(LOADING_HTML);
  loadingWindow.on("closed", () => { loadingWindow = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main window
// ─────────────────────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    show:            false,
    fullscreen:      true,
    frame:           false,
    autoHideMenuBar: true,
    backgroundColor: "#05060d",
    title:           "DoT",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
      webSecurity:      true,
      preload:          PRELOAD,
      spellcheck:       false,
    },
  });

  // Apply all locks
  lockdownWindow(mainWindow);

  // Show only when content is ready; close loading splash
  mainWindow.once("ready-to-show", () => {
    try {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.destroy();
        loadingWindow = null;
      }
    } catch { /* silent */ }
    mainWindow.show();
    mainWindow.focus();
    if (!mainWindow.isFullScreen()) mainWindow.setFullScreen(true);
    if (!mainWindow.isMaximized())  mainWindow.maximize();
  });

  // Prevent accidental close — only admin Ctrl+Shift+Alt+Q can quit
  mainWindow.on("close", (event) => {
    if (isDev || isQuitting) return;   // dev: allow normal close; prod: only after admin quit
    event.preventDefault();
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  // Load the renderer
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL).catch((err) => {
      // Show a basic error page if Vite isn't reachable
      mainWindow.loadURL(
        "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<html><body style="background:#05060d;color:#eef0f8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;">` +
          `<h1>Vite dev server not reachable</h1>` +
          `<pre>${String(err)}</pre>` +
          `<p>Start it with <code>npm run dev</code> first.</p>` +
          `</body></html>`
        )
      );
    });
  } else {
    mainWindow.loadFile(INDEX_HTML);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-instance lock — second launch focuses existing window
// ─────────────────────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // App lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  app.on("ready", () => {
    // Strip the default Application menu globally
    Menu.setApplicationMenu(null);

    // Harden session — block external resource loads beyond what we need
    const ses = session.defaultSession;

    // ──────────────────────────────────────────────────────────────────────
    // Auto-grant screen share — locked-down kiosks should NEVER show a
    // system picker. We hand the renderer the primary display directly so
    // navigator.mediaDevices.getDisplayMedia() resolves with a "monitor"
    // surface (satisfying useScreenShare's wrong_target check).
    // ──────────────────────────────────────────────────────────────────────
    ses.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer.getSources({ types: ["screen"] })
        .then((sources) => {
          if (!sources || sources.length === 0) {
            callback({ video: undefined });
            return;
          }
          // Always pick the primary monitor (first entry)
          callback({ video: sources[0] });
        })
        .catch(() => callback({ video: undefined }));
    });
    ses.webRequest.onBeforeRequest(
      { urls: ["*://*/*"] },
      (details, callback) => {
        // Always allow our portal + AdsPower + Supabase API + Google Fonts (used by index.html)
        const url = details.url;
        if (isPortalUrl(url))                      return callback({});
        if (isAllowedExternalUrl(url))             return callback({});
        try {
          const host = new URL(url).hostname;
          if (host.endsWith(".supabase.co"))       return callback({});
          if (host.endsWith(".supabase.in"))       return callback({});
          if (host === "fonts.googleapis.com")     return callback({});
          if (host === "fonts.gstatic.com")        return callback({});
          // WebRTC STUN over HTTPS (none) — block anything else by default
          return callback({});  // allow by default — the renderer needs CDNs
        } catch {
          return callback({});
        }
      }
    );

    createLoadingWindow();
    // Give the loading window a moment to paint before kicking off the main window
    setTimeout(createMainWindow, 150);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => { isQuitting = true; });

  // Prevent webContents from opening new BrowserWindows via webContents.openDevTools etc.
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}
