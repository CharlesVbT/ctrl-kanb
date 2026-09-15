#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const WebSocket = require("ws");

const project = path.resolve(__dirname, "..");
const resources = path.join(project, "Shared", "Web");
const assets = path.join(project, "docs", "assets");
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
const fps = 10;
const frameDelay = 1000 / fps;
const viewport = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };

if (!fs.existsSync(chrome)) {
  throw new Error("Google Chrome est introuvable. Définissez CHROME_BIN vers un navigateur Chromium.");
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class DevToolsClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextID = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", raw => {
      const message = JSON.parse(String(raw));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
    });
    this.socket.on("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("Chrome DevTools a fermé la connexion."));
      this.pending.clear();
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextID++;
    const response = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  close() {
    this.socket.close();
  }
}

function copyDemoWorkspace(temporary) {
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
  fs.writeFileSync(path.join(temporary, "capture-bootstrap.js"), "window.setInterval = () => 0;\n");
  fs.copyFileSync(path.join(project, "Tools", "readme-demo-state.js"), path.join(temporary, "demo.js"));
  return htmlPath;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function readJSON(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`Chrome DevTools répond ${response.statusCode}.`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.once("error", reject);
    request.setTimeout(1000, () => request.destroy(new Error("Chrome DevTools ne répond pas.")));
  });
}

async function pageTarget(port) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const targets = await readJSON(`http://127.0.0.1:${port}/json/list`);
      const page = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_) {
      // Chrome démarre encore.
    }
    await sleep(100);
  }
  throw new Error("Impossible de joindre Chrome DevTools.");
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Erreur JavaScript dans la page de démonstration.");
  return result.result?.value;
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await sleep(60);
  }
  throw new Error(`L'interface n'a pas affiché ${label}.`);
}

async function elementPoint(client, selector, horizontal = 0.5, vertical = 0.5) {
  const value = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return { x: rect.left + rect.width * ${horizontal}, y: rect.top + rect.height * ${vertical} };
  })()`);
  if (!value) throw new Error(`Élément introuvable pour la démonstration : ${selector}`);
  return value;
}

async function installCursor(client) {
  await evaluate(client, `(() => {
    const cursor = document.createElement("div");
    cursor.id = "readme-demo-cursor";
    cursor.innerHTML = '<svg viewBox="0 0 28 32" aria-hidden="true"><path d="M3 2.5v24.2l6.2-6.1 4.5 9 4.1-2-4.4-8.8h8.9z" fill="#fff" stroke="#15191f" stroke-width="2" stroke-linejoin="round"/></svg><i></i>';
    const style = document.createElement("style");
    style.textContent = '#readme-demo-cursor{position:fixed;left:0;top:0;width:28px;height:32px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.28));transform:translate(-3px,-3px)}#readme-demo-cursor svg{display:block;width:28px;height:32px}#readme-demo-cursor i{position:absolute;left:-8px;top:-8px;width:36px;height:36px;border:2px solid rgba(67,113,153,.55);border-radius:50%;opacity:0;transform:scale(.55)}#readme-demo-cursor.is-down i{opacity:1;transform:scale(1);transition:transform .2s ease,opacity .3s ease}';
    document.head.append(style);
    document.body.append(cursor);
  })()`);
}

async function renderVariant({ language, output, prompt }) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `ctrl-kanb-demo-${language}-`));
  const frameDirectory = path.join(temporary, "frames");
  const htmlPath = copyDemoWorkspace(temporary);
  fs.mkdirSync(frameDirectory);
  const port = await freePort();
  const chromeProcess = childProcess.spawn(chrome, [
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
    `--window-size=${viewport.width},${viewport.height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(temporary, "chrome-profile")}`,
    "about:blank"
  ], { stdio: "ignore" });

  let client;
  try {
    const target = await pageTarget(port);
    client = new DevToolsClient(target.webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    await client.send("Emulation.setDeviceMetricsOverride", viewport);
    const url = pathToFileURL(htmlPath);
    url.searchParams.set("view", "flow");
    url.searchParams.set("lang", language);
    await client.send("Page.navigate", { url: url.href });
    await waitFor(client, 'document.readyState === "complete" && document.querySelector("[data-surface=board]")', "le Flux");
    await installCursor(client);

    let frame = 0;
    let cursor = { x: 1180, y: 76 };
    const cursorState = async (point, down = false) => {
      cursor = point;
      await evaluate(client, `(() => { const cursor = document.querySelector("#readme-demo-cursor"); cursor.style.left = ${point.x} + "px"; cursor.style.top = ${point.y} + "px"; cursor.classList.toggle("is-down", ${down}); })()`);
    };
    const screenshot = async () => {
      const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      const filename = path.join(frameDirectory, `${String(frame++).padStart(5, "0")}.png`);
      fs.writeFileSync(filename, Buffer.from(result.data, "base64"));
      await sleep(frameDelay);
    };
    const hold = async seconds => {
      for (let index = 0; index < Math.round(seconds * fps); index++) await screenshot();
    };
    const moveToPoint = async (point, seconds = 0.65, buttons = 0) => {
      const start = cursor;
      const steps = Math.max(2, Math.round(seconds * fps));
      for (let index = 1; index <= steps; index++) {
        const progress = index / steps;
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = { x: start.x + (point.x - start.x) * eased, y: start.y + (point.y - start.y) * eased };
        await cursorState(next, buttons === 1);
        await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: next.x, y: next.y, button: buttons ? "left" : "none", buttons });
        await screenshot();
      }
    };
    const moveTo = async (selector, seconds = 0.65, horizontal = 0.5, vertical = 0.5, buttons = 0) => {
      const point = await elementPoint(client, selector, horizontal, vertical);
      await moveToPoint(point, seconds, buttons);
      return point;
    };
    const click = async selector => {
      const point = await moveTo(selector);
      await cursorState(point, true);
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
      await screenshot();
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
      await cursorState(point, false);
      await screenshot();
    };
    const drag = async (sourceSelector, targetSelector) => {
      const source = await moveTo(sourceSelector, 0.55, 0.5, 0.35);
      const targetPoint = await elementPoint(client, targetSelector, 0.5, 0.45);
      await cursorState(source, true);
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: source.x, y: source.y, button: "left", buttons: 1, clickCount: 1 });
      await screenshot();
      await moveToPoint({ x: source.x - 10, y: source.y + 8 }, 0.25, 1);
      await moveToPoint(targetPoint, 1.15, 1);
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: targetPoint.x, y: targetPoint.y, button: "left", buttons: 0, clickCount: 1 });
      await cursorState(targetPoint, false);
      await screenshot();
    };
    const typeText = async text => {
      for (const chunk of text.match(/.{1,3}/gu) || []) {
        await client.send("Input.insertText", { text: chunk });
        await screenshot();
      }
    };

    await cursorState(cursor);
    await hold(0.9);

    await click('.nav-item[data-surface="board"]');
    await waitFor(client, 'document.querySelector(".column[data-column=classic-ready]")', "le Tableau");
    await hold(0.8);

    await drag('[data-card="release-notes"]', '.column[data-column="classic-ideas"] .card-list');
    const movedColumn = await evaluate(client, 'document.querySelector("[data-card=release-notes]")?.closest(".column")?.dataset.column');
    if (movedColumn !== "classic-ideas") throw new Error(`Le déplacement de la tâche a échoué (${movedColumn || "colonne inconnue"}).`);
    await hold(0.8);

    await click('[data-select="agendaView"]');
    await waitFor(client, 'document.querySelector(".agenda-view")', "l'Agenda");
    await hold(1.2);

    await click('#workspace-header [data-action="toggle-utility"]');
    await waitFor(client, 'document.querySelector("#utility-panel:not([hidden]) #utility-chat-message")', "le chat de projet");
    await hold(0.7);
    await click("#utility-chat-message");
    await typeText(prompt);
    await hold(1.2);

    fs.mkdirSync(assets, { recursive: true });
    const targetPath = path.join(assets, output);
    const ffmpegResult = childProcess.spawnSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", String(fps),
      "-i", path.join(frameDirectory, "%05d.png"),
      "-filter_complex", "fps=10,scale=896:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
      "-loop", "0",
      targetPath
    ], { stdio: "inherit" });
    if (ffmpegResult.error) throw ffmpegResult.error;
    if (ffmpegResult.status !== 0) throw new Error(`FFmpeg a échoué pour ${output}.`);
    console.log(`Démonstration interactive créée : ${path.relative(project, targetPath)} (${frame} images)`);
  } finally {
    client?.close();
    if (!chromeProcess.killed) chromeProcess.kill("SIGTERM");
    await sleep(150);
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

(async () => {
  const variants = [
    { language: "en", output: "ctrl-kanb-demo.gif", prompt: "Prepare the release checklist for Friday." },
    { language: "fr", output: "ctrl-kanb-demo-fr.gif", prompt: "Prépare la liste de publication pour vendredi." }
  ];
  for (const variant of variants) await renderVariant(variant);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
