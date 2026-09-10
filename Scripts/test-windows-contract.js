const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("Resources/platform.js", "utf8");
const invoked = [];
const received = [];
let nativeListener = null;
const listeners = {};
const window = {
  __TAURI__: {
    core: {
      invoke(command, arguments_) {
        invoked.push({ command, arguments_ });
        return Promise.resolve([{ function: "agentStatus", object: { codex: true, claude: false } }]);
      }
    },
    event: {
      listen(name, handler) {
        if (name === "ctrl-kanb-native") nativeListener = handler;
        return Promise.resolve(() => {});
      }
    }
  },
  addEventListener(name, handler) { listeners[name] = handler; }
};
window.window = window;

vm.runInNewContext(source, { window, console, String, Array, Promise }, { filename: "platform.js" });
if (typeof window.ctrlKanbNative?.postMessage !== "function") throw new Error("adaptateur Tauri absent");

window.CodexBoard = { agentStatus(value) { received.push(value); } };
window.ctrlKanbNative.postMessage({ action: "agentStatus" });

setImmediate(() => {
  if (invoked.length !== 1 || invoked[0].command !== "bridge_message") throw new Error("commande Tauri incorrecte");
  if (invoked[0].arguments_?.payload?.action !== "agentStatus") throw new Error("payload du pont altéré");
  if (received.length !== 1 || received[0].codex !== true) throw new Error("réponse native non distribuée");
  nativeListener?.({ payload: { function: "agentStatus", object: { codex: false, claude: true } } });
  if (received.length !== 2 || received[1].claude !== true) throw new Error("événement natif non distribué");

  const rust = fs.readFileSync("Platforms/Windows/src-tauri/src/lib.rs", "utf8");
  const actions = [...fs.readFileSync("Resources/app.js", "utf8").matchAll(/action:\"([^\"]+)\"/g)].map(match => match[1]);
  for (const action of new Set(actions)) {
    if (!rust.includes(`\"${action}\"`)) throw new Error(`action absente du contrat Windows: ${action}`);
  }
  const config = JSON.parse(fs.readFileSync("Platforms/Windows/src-tauri/tauri.conf.json", "utf8"));
  const storage = fs.readFileSync("Platforms/Windows/src-tauri/src/storage.rs", "utf8");
  const dataFolder = storage.match(/PathBuf::from\(root\)\.join\("([^"]+)"\)/)?.[1];
  if (!dataFolder || dataFolder === config.productName) {
    throw new Error("le dossier de données Windows doit rester séparé du dossier d’installation NSIS");
  }
  console.log(`PASS adaptateur Tauri et ${new Set(actions).size} actions Windows déclarées`);
});
