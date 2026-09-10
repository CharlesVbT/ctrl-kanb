mod platform;
mod storage;
mod terminal;

use serde::Serialize;
use serde_json::{Value, json};
use std::{collections::HashSet, sync::Mutex};
use tauri::{AppHandle, State};

const KNOWN_ACTIONS: &[&str] = &[
    "ready",
    "save",
    "agentStatus",
    "agentProbe",
    "agentLogin",
    "securityStatus",
    "notificationStatus",
    "requestNotifications",
    "openNotificationSettings",
    "setAppLock",
    "lockNow",
    "setAppearance",
    "copyText",
    "chooseFolder",
    "exportBoard",
    "importBoard",
    "chooseUtilityFolder",
    "chooseUtilityAttachments",
    "setConcurrency",
    "run",
    "stop",
    "respondRequest",
    "listConversations",
    "syncConversations",
    "syncClaudeSessions",
    "readConversation",
    "openConversation",
    "openClaudeConversation",
    "setBackgroundScheduler",
    "backgroundSchedulerStatus",
    "startTerminal",
    "terminalCommand",
    "terminalInterrupt",
    "stopTerminal",
    "openSystemTerminal",
    "listProjectFiles",
    "openProjectFile",
    "revealProjectFile",
    "openProjectFileWith",
    "saveProjectFileAs",
    "copyProjectFilePath",
    "resolveProjectFileForChat",
    "revealData",
    "revealPath",
];

#[derive(Default)]
struct AppState {
    last_presented: Mutex<Option<Value>>,
}

#[derive(Clone, Serialize)]
pub(crate) struct NativeMessage {
    pub(crate) function: String,
    pub(crate) object: Value,
}

pub(crate) fn message(function: &str, object: Value) -> NativeMessage {
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

fn scheduler_status() -> Value {
    json!({"enabled":false,"installed":false,"state":"disabled","message":"Le moteur de tâches Windows n’est pas encore activé.","lastCheck":"","error":""})
}

fn status_messages(app: &AppHandle, state: &AppState) -> Result<Vec<NativeMessage>, String> {
    let loaded = storage::load(app)?;
    *state
        .last_presented
        .lock()
        .map_err(|_| "État de sauvegarde indisponible.")? = Some(loaded.board.clone());
    let mut messages = vec![
        message(
            "appInfo",
            json!({"version":env!("CARGO_PKG_VERSION"),"build":"windows"}),
        ),
        message("load", loaded.board),
        message(
            "agentStatus",
            json!({"codex":command_exists("codex"),"claude":command_exists("claude")}),
        ),
        message("backgroundSchedulerStatus", scheduler_status()),
        message(
            "notificationAuthorizationStatus",
            json!({"status":"unknown"}),
        ),
        message("runsRestored", json!({"running":[],"queued":[]})),
    ];
    if loaded.recovered {
        messages.push(message("nativeWarning", json!({"message":"Le fichier principal était illisible. La sauvegarde précédente a été restaurée à l’écran."})));
    }
    Ok(messages)
}

fn planned(action: &str) -> Vec<NativeMessage> {
    vec![message(
        "nativeWarning",
        json!({"message":format!("« {action} » n’est pas encore disponible dans la version Windows actuelle.")}),
    )]
}

fn save_board(
    payload: &Value,
    app: &AppHandle,
    state: &AppState,
) -> Result<Vec<NativeMessage>, String> {
    let board = payload
        .get("data")
        .ok_or_else(|| "Tableau absent.".to_string())?;
    let presented = state
        .last_presented
        .lock()
        .map_err(|_| "État de sauvegarde indisponible.")?
        .clone();
    match storage::save(app, board, presented.as_ref())? {
        storage::SaveResult::Saved(saved) => {
            *state
                .last_presented
                .lock()
                .map_err(|_| "État de sauvegarde indisponible.")? = Some(saved);
            Ok(Vec::new())
        }
        storage::SaveResult::Merged(saved) => {
            *state
                .last_presented
                .lock()
                .map_err(|_| "État de sauvegarde indisponible.")? = Some(saved.clone());
            Ok(vec![message(
                "boardMerged",
                json!({"board":saved,"message":"Les changements faits en parallèle ont été réunis."}),
            )])
        }
        storage::SaveResult::Conflict(latest) => {
            *state
                .last_presented
                .lock()
                .map_err(|_| "État de sauvegarde indisponible.")? = Some(latest.clone());
            Ok(vec![message(
                "boardSaveConflict",
                json!({"board":latest,"message":"Le tableau a été modifié en même temps. La version la plus récente a été rechargée et ta modification a été conservée dans un fichier de conflit."}),
            )])
        }
    }
}

#[tauri::command]
fn bridge_message(
    payload: Value,
    app: AppHandle,
    state: State<'_, AppState>,
    terminals: State<'_, terminal::TerminalManager>,
) -> Result<Vec<NativeMessage>, String> {
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
        return Err(format!("Action Windows inconnue : {action}"));
    }
    if let Some(result) = terminal::handle(action, &payload, &app, &terminals) {
        return result;
    }
    if let Some(result) = platform::handle(action, &payload, &app) {
        let messages = result?;
        if let Some(imported) = messages
            .iter()
            .find(|item| item.function == "boardImported")
            && let Some(board) = imported.object.get("board")
        {
            *state
                .last_presented
                .lock()
                .map_err(|_| "État de sauvegarde indisponible.")? = Some(board.clone());
        }
        return Ok(messages);
    }
    match action {
        "ready" => status_messages(&app, &state),
        "save" => save_board(&payload, &app, &state),
        "agentStatus" => Ok(vec![message(
            "agentStatus",
            json!({"codex":command_exists("codex"),"claude":command_exists("claude")}),
        )]),
        "backgroundSchedulerStatus" => Ok(vec![message(
            "backgroundSchedulerStatus",
            scheduler_status(),
        )]),
        "notificationStatus" => Ok(vec![message(
            "notificationAuthorizationStatus",
            json!({"status":"unknown"}),
        )]),
        "securityStatus" => Ok(vec![message(
            "securityStatus",
            json!({"lockEnabled":false,"biometry":""}),
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
            std::process::Command::new("open")
                .arg(path)
                .spawn()
                .map_err(|error| error.to_string())?;
            Ok(Vec::new())
        }
        _ => Ok(planned(action)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .manage(terminal::TerminalManager::default())
        .invoke_handler(tauri::generate_handler![bridge_message])
        .run(tauri::generate_context!())
        .expect("CTRL KANB Windows n’a pas pu démarrer");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn declares_the_complete_native_contract() {
        assert_eq!(KNOWN_ACTIONS.len(), 44);
        assert_eq!(
            KNOWN_ACTIONS.iter().copied().collect::<HashSet<_>>().len(),
            44
        );
    }
}
