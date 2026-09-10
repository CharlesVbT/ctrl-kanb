mod storage;

use serde::Serialize;
use serde_json::{Value, json};
use std::collections::HashSet;
use tauri::AppHandle;

const KNOWN_ACTIONS: &[&str] = &[
    "agentLogin",
    "agentProbe",
    "agentStatus",
    "backgroundSchedulerStatus",
    "chooseFolder",
    "chooseUtilityAttachments",
    "chooseUtilityFolder",
    "copyText",
    "exportBoard",
    "importBoard",
    "listConversations",
    "listProjectFiles",
    "lockNow",
    "notificationStatus",
    "openClaudeConversation",
    "openConversation",
    "openNotificationSettings",
    "openSystemTerminal",
    "readConversation",
    "ready",
    "requestNotifications",
    "respondRequest",
    "revealData",
    "revealPath",
    "revealProjectFile",
    "run",
    "save",
    "securityStatus",
    "setAppLock",
    "setAppearance",
    "setBackgroundScheduler",
    "setConcurrency",
    "startTerminal",
    "stop",
    "stopTerminal",
    "syncClaudeSessions",
    "syncConversations",
    "terminalCommand",
    "terminalInterrupt",
];

#[derive(Serialize)]
pub struct NativeMessage {
    function: String,
    object: Value,
}

fn message(function: &str, object: Value) -> NativeMessage {
    NativeMessage {
        function: function.into(),
        object,
    }
}

fn command_exists(name: &str) -> bool {
    let path = std::env::var_os("PATH").unwrap_or_default();
    #[cfg(not(target_os = "windows"))]
    let names = [name.to_string()];
    #[cfg(target_os = "windows")]
    let names = {
        let extensions = std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".into());
        extensions
            .split(';')
            .map(|extension| format!("{}{}", name, extension.to_ascii_lowercase()))
            .chain(std::iter::once(name.to_string()))
            .collect::<Vec<_>>()
    };
    std::env::split_paths(&path).any(|folder| {
        names
            .iter()
            .any(|candidate| folder.join(candidate).is_file())
    })
}

fn status_messages(app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    let board = storage::load(app)?;
    Ok(vec![
        message(
            "appInfo",
            json!({ "version": env!("CARGO_PKG_VERSION"), "build": "windows-preview" }),
        ),
        message("load", board),
        message(
            "agentStatus",
            json!({ "codex": command_exists("codex"), "claude": command_exists("claude") }),
        ),
        message(
            "backgroundSchedulerStatus",
            json!({
                "enabled": false, "installed": false, "state": "disabled",
                "message": "Le moteur Windows sera ajouté après validation du socle.", "lastCheck": "", "error": ""
            }),
        ),
        message(
            "notificationAuthorizationStatus",
            json!({ "status": "unknown" }),
        ),
        message("runsRestored", json!({ "running": [], "queued": [] })),
    ])
}

fn planned(action: &str) -> Vec<NativeMessage> {
    vec![message(
        "nativeWarning",
        json!({
            "message": format!("« {} » n’est pas encore disponible dans la préversion Windows.", action)
        }),
    )]
}

#[tauri::command]
fn bridge_message(payload: Value, app: AppHandle) -> Result<Vec<NativeMessage>, String> {
    if serde_json::to_vec(&payload)
        .map_err(|error| error.to_string())?
        .len()
        > 2 * 1024 * 1024
    {
        return Err("Le message envoyé au pont Windows dépasse 2 Mo.".into());
    }
    let action = payload
        .get("action")
        .and_then(Value::as_str)
        .ok_or_else(|| "Action Windows absente.".to_string())?;
    let known: HashSet<&str> = KNOWN_ACTIONS.iter().copied().collect();
    if !known.contains(action) {
        return Err(format!("Action Windows inconnue : {}", action));
    }

    match action {
        "ready" => status_messages(&app),
        "save" => {
            let board = payload
                .get("data")
                .ok_or_else(|| "Tableau absent.".to_string())?;
            storage::save(&app, board)?;
            Ok(Vec::new())
        }
        "agentStatus" => Ok(vec![message(
            "agentStatus",
            json!({
                "codex": command_exists("codex"), "claude": command_exists("claude")
            }),
        )]),
        "backgroundSchedulerStatus" => Ok(vec![message(
            "backgroundSchedulerStatus",
            json!({
                "enabled": false, "installed": false, "state": "disabled",
                "message": "Le moteur Windows sera ajouté après validation du socle.", "lastCheck": "", "error": ""
            }),
        )]),
        "notificationStatus" => Ok(vec![message(
            "notificationAuthorizationStatus",
            json!({ "status": "unknown" }),
        )]),
        "securityStatus" => Ok(vec![message(
            "securityStatus",
            json!({ "lockEnabled": false, "biometry": "" }),
        )]),
        "setAppearance" | "setConcurrency" => Ok(Vec::new()),
        "revealData" => {
            let path = storage::data_dir(&app)?;
            #[cfg(target_os = "windows")]
            std::process::Command::new("explorer.exe")
                .arg(path)
                .spawn()
                .map_err(|error| error.to_string())?;
            #[cfg(not(target_os = "windows"))]
            let _ = path;
            Ok(Vec::new())
        }
        _ => Ok(planned(action)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![bridge_message])
        .run(tauri::generate_context!())
        .expect("CTRL KANB Windows n’a pas pu démarrer");
}
