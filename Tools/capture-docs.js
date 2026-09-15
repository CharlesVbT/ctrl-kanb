#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const project = path.resolve(__dirname, "..");
const resources = path.join(project, "Shared", "Web");
const output = path.join(project, "docs", "assets");
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!fs.existsSync(chrome)) {
  throw new Error("Google Chrome est introuvable. Définissez CHROME_BIN vers un navigateur Chromium.");
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ctrl-kanb-docs-"));
for (const name of ["index.html", "app.css", "app.js", "i18n.js", "platform.js", "AppIcon.png"]) {
  fs.copyFileSync(path.join(resources, name), path.join(temporary, name));
}
const htmlPath = path.join(temporary, "index.html");
const html = fs.readFileSync(htmlPath, "utf8").replace(
  '<script src="app.js"></script>',
  '<script src="capture-bootstrap.js"></script>\n  <script src="app.js"></script>'
).replace(
  "</body>",
  '  <script src="demo.js"></script>\n</body>'
);
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(
  path.join(temporary, "capture-bootstrap.js"),
  "window.setInterval = () => 0;\n"
);

const demoState = path.join(project, "Tools", "readme-demo-state.js");
fs.copyFileSync(demoState, path.join(temporary, "demo.js"));
fs.mkdirSync(output, { recursive: true });

const captures = [
  ["flow", "en", "ctrl-kanb-hero.png"],
  ["board", "en", "ctrl-kanb-board.png"],
  ["agenda", "en", "ctrl-kanb-agenda.png"],
  ["chat", "en", "ctrl-kanb-chat.png"],
  ["flow", "fr", "ctrl-kanb-hero-fr.png"],
  ["board", "fr", "ctrl-kanb-board-fr.png"],
  ["agenda", "fr", "ctrl-kanb-agenda-fr.png"],
  ["chat", "fr", "ctrl-kanb-chat-fr.png"]
];
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const pause = milliseconds => Atomics.wait(sleeper, 0, 0, milliseconds);

try {
  for (const [view, language, filename] of captures) {
    const target = path.join(output, filename);
    fs.rmSync(target, { force: true });
    const url = pathToFileURL(htmlPath);
    url.searchParams.set("view", view);
    url.searchParams.set("lang", language);
    const child = childProcess.spawn(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--hide-scrollbars",
      "--no-default-browser-check",
      "--no-first-run",
      "--force-device-scale-factor=1",
      "--run-all-compositor-stages-before-draw",
      "--window-size=1600,1000",
      "--user-data-dir=" + path.join(temporary, "chrome-" + language + "-" + view),
      "--screenshot=" + target,
      url.href
    ], { detached: true, stdio: "ignore" });
    child.unref();
    const deadline = Date.now() + 12000;
    let previousSize = 0;
    let stableReads = 0;
    while (Date.now() < deadline) {
      const size = fs.existsSync(target) ? fs.statSync(target).size : 0;
      stableReads = size > 5000 && size === previousSize ? stableReads + 1 : 0;
      previousSize = size;
      if (stableReads >= 2) break;
      pause(100);
    }
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (_) {
      // Chrome peut avoir quitté de lui-même après avoir écrit la capture.
    }
    pause(150);
    if (!fs.existsSync(target) || fs.statSync(target).size <= 5000) {
      throw new Error("La capture " + language + "/" + view + " a échoué.");
    }
    console.log("Capture créée : " + path.relative(project, target));
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
