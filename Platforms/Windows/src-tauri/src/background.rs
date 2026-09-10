#[cfg(target_os = "windows")]
use crate::agents;
use crate::{NativeMessage, message, storage};
use serde_json::{Value, json};
#[cfg(target_os = "windows")]
use std::{env, process::Command};
use tauri::AppHandle;

#[cfg(target_os = "windows")]
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const RUN_VALUE: &str = "CTRL KANB";

#[cfg(target_os = "windows")]
fn hidden(command: &mut Command) {
    agents::hidden(command);
}

fn startup_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("reg.exe");
        command.args(["query", RUN_KEY, "/v", RUN_VALUE]);
        hidden(&mut command);
        command.status().is_ok_and(|status| status.success())
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn board_enabled(app: &AppHandle) -> bool {
    storage::load(app)
        .ok()
        .and_then(|loaded| {
            loaded
                .board
                .pointer("/settings/backgroundSchedulerEnabled")
                .and_then(Value::as_bool)
        })
        .unwrap_or(false)
}

pub fn should_keep_alive(app: &AppHandle) -> bool {
    board_enabled(app)
}

pub fn restore_if_enabled(app: &AppHandle) -> Result<(), String> {
    if board_enabled(app) && !startup_installed() {
        configure(app, true)?;
    }
    Ok(())
}

pub fn status(app: &AppHandle, error: Option<&str>) -> Value {
    let enabled = board_enabled(app);
    let installed = startup_installed();
    let state = if error.is_some() {
        "error"
    } else if !enabled {
        "disabled"
    } else if installed {
        "installed"
    } else {
        "missing"
    };
    let status = error.map(str::to_string).unwrap_or_else(|| {
        if enabled && installed {
            "Le moteur Windows est installé et contrôle les tâches chaque minute.".into()
        } else if enabled {
            "Le lancement automatique Windows est introuvable.".into()
        } else {
            "Aucun service ne tourne sans ton accord.".into()
        }
    });
    json!({"enabled":enabled,"installed":installed,"state":state,"message":status,"lastCheck":"","error":error.unwrap_or("")})
}

fn store_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let mut loaded = storage::load(app)?.board;
    let base = loaded.clone();
    loaded["settings"]["backgroundSchedulerEnabled"] = json!(enabled);
    match storage::save(app, &loaded, Some(&base))? {
        storage::SaveResult::Saved(_) | storage::SaveResult::Merged(_) => Ok(()),
        storage::SaveResult::Conflict(_) => {
            Err("Les réglages ont changé en même temps. Réessaie.".into())
        }
    }
}

fn configure(app: &AppHandle, enabled: bool) -> Result<Vec<NativeMessage>, String> {
    #[cfg(target_os = "windows")]
    {
        if !enabled && !startup_installed() {
            store_enabled(app, false)?;
            return Ok(vec![message(
                "backgroundSchedulerStatus",
                status(app, None),
            )]);
        }
        let mut command = Command::new("reg.exe");
        if enabled {
            let executable = env::current_exe().map_err(|error| error.to_string())?;
            let launch = format!("\"{}\" --background", executable.display());
            command.args([
                "add", RUN_KEY, "/v", RUN_VALUE, "/t", "REG_SZ", "/d", &launch, "/f",
            ]);
        } else {
            command.args(["delete", RUN_KEY, "/v", RUN_VALUE, "/f"]);
        }
        hidden(&mut command);
        let output = command.output().map_err(|error| error.to_string())?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if enabled {
                store_enabled(app, false)?;
            }
            return Err(if detail.is_empty() {
                if enabled {
                    "Windows a refusé d’activer le lancement à la connexion.".into()
                } else {
                    "Windows n’a pas pu retirer le lancement à la connexion.".into()
                }
            } else {
                detail
            });
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
    }
    store_enabled(app, enabled)?;
    Ok(vec![message(
        "backgroundSchedulerStatus",
        status(app, None),
    )])
}

pub fn disable_after_import(app: &AppHandle) -> Result<(), String> {
    configure(app, false).map(|_| ())
}

pub fn handle(
    action: &str,
    payload: &Value,
    app: &AppHandle,
) -> Option<Result<Vec<NativeMessage>, String>> {
    Some(match action {
        "backgroundSchedulerStatus" => Ok(vec![message(
            "backgroundSchedulerStatus",
            status(app, None),
        )]),
        "setBackgroundScheduler" => configure(
            app,
            payload
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        ),
        _ => return None,
    })
}
