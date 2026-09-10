mod agents;
mod background;
mod conversations;
mod notifications;
mod platform;
mod security;
mod storage;
mod terminal;

use serde::Serialize;
use serde_json::{Value, json};
use std::{collections::HashSet, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

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

fn status_messages(
    app: &AppHandle,
    state: &AppState,
    agents: &agents::AgentManager,
) -> Result<Vec<NativeMessage>, String> {
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
        message("agentStatus", agents::availability()),
        message("backgroundSchedulerStatus", background::status(app, None)),
        message(
            "notificationAuthorizationStatus",
            json!({"status":"authorized"}),
        ),
        message("runsRestored", agents::restored(agents)),
    ];
    if loaded.recovered {
        messages.push(message("nativeWarning", json!({"message":"Le fichier principal était illisible. La sauvegarde précédente a été restaurée à l’écran."})));
    }
    Ok(messages)
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
    agents: State<'_, agents::AgentManager>,
    security: State<'_, security::SecurityManager>,
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
    if let Some(result) = agents::handle(action, &payload, &app, &agents) {
        return result;
    }
    if let Some(result) = conversations::handle(action, &payload, &app) {
        return result;
    }
    if let Some(result) = background::handle(action, &payload, &app) {
        return result;
    }
    if let Some(result) = notifications::handle(action, &payload) {
        return result;
    }
    if let Some(result) = security::handle(action, &payload, &app, &security) {
        return result;
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
        "ready" => status_messages(&app, &state, &agents),
        "save" => save_board(&payload, &app, &state),
        "agentStatus" => Ok(vec![message("agentStatus", agents::availability())]),
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
        _ => Err("Cette action Windows n’a pas pu être exécutée.".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::{
        WindowEvent,
        menu::{Menu, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder},
        tray::TrayIconBuilder,
    };
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _cwd| {
                let manager = app.state::<security::SecurityManager>();
                let _ = security::unlock_and_show(app, &manager);
            },
        ))
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::default())
        .manage(terminal::TerminalManager::default())
        .manage(agents::AgentManager::default())
        .manage(security::SecurityManager::default())
        .on_menu_event(|app, event| {
            let action = event.id.as_ref();
            if action == "quitApp" {
                app.exit(0);
            } else {
                let _ = app.emit(
                    "ctrl-kanb-native",
                    message("menuAction", json!({"action":action})),
                );
            }
        })
        .setup(|app| {
            let new_task = MenuItemBuilder::with_id("newTask", "Nouvelle tâche")
                .accelerator("Ctrl+N")
                .build(app)?;
            let quick_capture = MenuItemBuilder::with_id("quickCapture", "Capturer une idée")
                .accelerator("Ctrl+Shift+N")
                .build(app)?;
            let new_project =
                MenuItemBuilder::with_id("newProject", "Nouveau projet").build(app)?;
            let file = SubmenuBuilder::new(app, "Fichier")
                .items(&[&new_task, &quick_capture, &new_project])
                .separator()
                .text("exportData", "Exporter une sauvegarde…")
                .text("importData", "Restaurer une sauvegarde…")
                .text("revealData", "Afficher les données")
                .separator()
                .text("quitApp", "Quitter CTRL KANB")
                .build()?;
            let edit = SubmenuBuilder::new(app, "Édition")
                .undo_with_text("Annuler")
                .redo_with_text("Rétablir")
                .separator()
                .cut_with_text("Couper")
                .copy_with_text("Copier")
                .paste_with_text("Coller")
                .select_all_with_text("Tout sélectionner")
                .build()?;
            let view = SubmenuBuilder::new(app, "Affichage")
                .text("flow", "Flux")
                .text("board", "Tableau")
                .text("agenda", "Agenda")
                .text("validations", "Validations")
                .text("follow", "Suivi")
                .separator()
                .text("toggleSidebar", "Afficher ou masquer le panneau gauche")
                .text("toggleTools", "Afficher ou masquer le panneau droit")
                .build()?;
            let tools = SubmenuBuilder::new(app, "Outils")
                .text("toolsChat", "Chat")
                .text("toolsTerminal", "Terminal")
                .text("toolsFiles", "Fichiers")
                .separator()
                .text("revealProject", "Afficher le projet dans l’Explorateur")
                .text("settings", "Réglages")
                .build()?;
            let help = SubmenuBuilder::new(app, "Aide")
                .text("shortcuts", "Raccourcis clavier")
                .build()?;
            let application_menu = MenuBuilder::new(app)
                .items(&[&file, &edit, &view, &tools, &help])
                .build()?;
            app.set_menu(application_menu)?;

            let open = MenuItem::with_id(app, "open", "Ouvrir CTRL KANB", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("ctrl-kanb")
                .menu(&menu)
                .tooltip("CTRL KANB");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => {
                    let manager = app.state::<security::SecurityManager>();
                    let _ = security::unlock_and_show(app, &manager);
                }
                "quit" => app.exit(0),
                _ => {}
            })
            .build(app)?;
            let background = std::env::args_os().any(|argument| argument == "--background");
            background::restore_if_enabled(app.handle()).map_err(std::io::Error::other)?;
            let manager = app.state::<security::SecurityManager>();
            security::initialize(app.handle(), &manager, background)
                .map_err(std::io::Error::other)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event
                && background::should_keep_alive(window.app_handle())
            {
                api.prevent_close();
                let manager = window.app_handle().state::<security::SecurityManager>();
                security::mark_locked(window.app_handle(), &manager);
                let _ = window.hide();
            }
        })
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
