const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("Resources/platform.js", "utf8");
const invoked = [];
const received = [];
let nativeListener = null;
const listeners = {};
const platformAttributes = {};
const document = {
  documentElement: {
    setAttribute(name, value) { platformAttributes[name] = value; }
  }
};
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

vm.runInNewContext(source, { window, document, console, String, Array, Promise }, { filename: "platform.js" });
if (typeof window.ctrlKanbNative?.postMessage !== "function") throw new Error("adaptateur Tauri absent");
if (window.CTRL_KANB_PLATFORM !== "windows" || platformAttributes["data-platform"] !== "windows") {
  throw new Error("plateforme Windows non déclarée à l’interface");
}

window.CodexBoard = { agentStatus(value) { received.push(value); } };
window.ctrlKanbNative.postMessage({ action: "agentStatus" });

setImmediate(() => {
  if (invoked.length !== 1 || invoked[0].command !== "bridge_message") throw new Error("commande Tauri incorrecte");
  if (invoked[0].arguments_?.payload?.action !== "agentStatus") throw new Error("payload du pont altéré");
  if (received.length !== 1 || received[0].codex !== true) throw new Error("réponse native non distribuée");
  nativeListener?.({ payload: { function: "agentStatus", object: { codex: false, claude: true } } });
  if (received.length !== 2 || received[1].claude !== true) throw new Error("événement natif non distribué");

  const rust = fs.readFileSync("Platforms/Windows/src-tauri/src/lib.rs", "utf8");
  const entrypoint = fs.readFileSync("Platforms/Windows/src-tauri/src/main.rs", "utf8");
  if (!entrypoint.includes('#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]')) {
    throw new Error("l’exécutable Windows doit utiliser le sous-système graphique en release");
  }
  const actions = [
    "ready", "save", "agentStatus", "agentProbe", "agentLogin", "securityStatus",
    "notificationStatus", "requestNotifications", "openNotificationSettings", "setAppLock",
    "lockNow", "setAppearance", "copyText", "chooseFolder", "exportBoard", "importBoard",
    "chooseUtilityFolder", "chooseUtilityAttachments", "setConcurrency", "run", "stop",
    "respondRequest", "listConversations", "syncConversations", "syncClaudeSessions",
    "readConversation", "openConversation", "openClaudeConversation", "setBackgroundScheduler",
    "backgroundSchedulerStatus", "startTerminal", "terminalCommand", "terminalInterrupt",
    "stopTerminal", "openSystemTerminal", "listProjectFiles", "openProjectFile",
    "revealProjectFile", "openProjectFileWith", "saveProjectFileAs", "copyProjectFilePath",
    "resolveProjectFileForChat", "revealData", "revealPath"
  ];
  if (new Set(actions).size !== 44) throw new Error("contrat natif incomplet");
  for (const action of actions) {
    if (!rust.includes(`\"${action}\"`)) throw new Error(`action absente du contrat Windows: ${action}`);
  }
  const handlers = [
    rust.slice(rust.indexOf("match action")),
    ...["agents", "background", "conversations", "notifications", "platform", "security", "terminal"]
      .map(name => fs.readFileSync(`Platforms/Windows/src-tauri/src/${name}.rs`, "utf8"))
      .map(module => module.slice(module.indexOf("pub fn handle")))
  ].join("\n");
  for (const action of actions) {
    if (!handlers.includes(`\"${action}\"`)) throw new Error(`action Windows sans gestionnaire: ${action}`);
  }
  if (rust.includes("n’est pas encore disponible dans la version Windows actuelle")) {
    throw new Error("un parcours Windows affiche encore une fonctionnalité inachevée");
  }
  const config = JSON.parse(fs.readFileSync("Platforms/Windows/src-tauri/tauri.conf.json", "utf8"));
  const packagedNotices = config.bundle?.resources || {};
  for (const [source, destination] of Object.entries({
    "../../../LICENSE": "LICENSE",
    "../../../NOTICE": "NOTICE",
    "../../../THIRD_PARTY_NOTICES.md": "THIRD_PARTY_NOTICES.md"
  })) {
    if (packagedNotices[source] !== destination) {
      throw new Error(`mention légale absente du paquet Windows : ${destination}`);
    }
  }
  const agents = fs.readFileSync("Platforms/Windows/src-tauri/src/agents.rs", "utf8");
  for (const marker of ["CTRL_KANB_CODEX_PATH", "CTRL_KANB_CLAUDE_PATH", "OpenAI/Codex/bin", "Programs/OpenAI/Codex/bin/codex.exe"]) {
    if (!agents.includes(marker)) throw new Error(`détection Windows incomplète : ${marker}`);
  }
  if (agents.indexOf('OpenAI/Codex/bin') > agents.indexOf('env::split_paths')) {
    throw new Error("la version active de l’application Codex doit être cherchée avant l’ancien PATH");
  }
  const storage = fs.readFileSync("Platforms/Windows/src-tauri/src/storage.rs", "utf8");
  const dataFolder = storage.match(/PathBuf::from\(root\)\.join\("([^"]+)"\)/)?.[1];
  if (!dataFolder || dataFolder === config.productName) {
    throw new Error("le dossier de données Windows doit rester séparé du dossier d’installation NSIS");
  }
  const installedValidation = fs.readFileSync("Platforms/Windows/validate-installed.ps1", "utf8");
  for (const marker of ["uninstall.exe", "$builtExecutable", "$builtHash", "$installedHash", "installerReplacedExecutable"]) {
    if (!installedValidation.includes(marker)) throw new Error(`validation de mise à jour Windows incomplète : ${marker}`);
  }
  if (!installedValidation.includes('Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait')) {
    throw new Error("la validation Windows doit retirer silencieusement l’ancienne version");
  }
  if (!installedValidation.includes("if ($installedHash -ne $builtHash)")) {
    throw new Error("la validation Windows doit comparer le binaire installé au binaire construit");
  }
  if (/Remove-Item[^\n]*\$dataFolder/.test(installedValidation)) {
    throw new Error("la validation Windows ne doit jamais supprimer le dossier de données utilisateur");
  }
  console.log(`PASS adaptateur Tauri et ${actions.length} actions Windows déclarées`);
});
