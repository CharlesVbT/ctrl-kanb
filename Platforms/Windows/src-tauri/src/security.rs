use crate::{NativeMessage, message, storage};
use serde_json::{Value, json};
use std::{
    fs,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct SecurityManager {
    locked: AtomicBool,
}

fn marker(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let folder = storage::data_dir(app)?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    Ok(folder.join("app-lock.enabled"))
}

pub fn enabled(app: &AppHandle) -> bool {
    let Ok(path) = marker(app) else { return false };
    fs::symlink_metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
}

fn set_enabled(app: &AppHandle, value: bool) -> Result<(), String> {
    let path = marker(app)?;
    if value {
        fs::write(path, b"CTRL KANB Windows Hello\n").map_err(|error| error.to_string())
    } else {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[cfg(target_os = "windows")]
fn authenticate(reason: &str) -> Result<bool, String> {
    use windows::{
        Security::Credentials::UI::{
            UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
        },
        core::HSTRING,
    };
    let availability = UserConsentVerifier::CheckAvailabilityAsync()
        .map_err(|error| error.to_string())?
        .get()
        .map_err(|error| error.to_string())?;
    if availability != UserConsentVerifierAvailability::Available {
        return Err(
            "Windows Hello ou le code de session n’est pas disponible sur cette machine.".into(),
        );
    }
    let result = UserConsentVerifier::RequestVerificationAsync(&HSTRING::from(reason))
        .map_err(|error| error.to_string())?
        .get()
        .map_err(|error| error.to_string())?;
    Ok(result == UserConsentVerificationResult::Verified)
}

#[cfg(not(target_os = "windows"))]
fn authenticate(_reason: &str) -> Result<bool, String> {
    Ok(true)
}

fn status(app: &AppHandle) -> NativeMessage {
    message(
        "securityStatus",
        json!({"lockEnabled":enabled(app),"biometry":if cfg!(target_os="windows"){"Windows Hello"}else{""}}),
    )
}

pub fn mark_locked(app: &AppHandle, manager: &SecurityManager) {
    if enabled(app) {
        manager.locked.store(true, Ordering::SeqCst);
    }
}

pub fn unlock_and_show(app: &AppHandle, manager: &SecurityManager) -> Result<bool, String> {
    if enabled(app) && manager.locked.load(Ordering::SeqCst) && !authenticate("Ouvrir CTRL KANB")? {
        return Ok(false);
    }
    manager.locked.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(true)
}

pub fn initialize(
    app: &AppHandle,
    manager: &SecurityManager,
    background: bool,
) -> Result<(), String> {
    if enabled(app) {
        manager.locked.store(true, Ordering::SeqCst);
    }
    if !background {
        let _ = unlock_and_show(app, manager)?;
    }
    Ok(())
}

pub fn handle(
    action: &str,
    payload: &Value,
    app: &AppHandle,
    manager: &SecurityManager,
) -> Option<Result<Vec<NativeMessage>, String>> {
    let result = match action {
        "securityStatus" => Ok(vec![status(app)]),
        "setAppLock" => (|| -> Result<Vec<NativeMessage>, String> {
            let requested = payload
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if authenticate(if requested {
                "Activer le verrouillage de CTRL KANB"
            } else {
                "Désactiver le verrouillage de CTRL KANB"
            })? {
                set_enabled(app, requested)?;
                manager.locked.store(false, Ordering::SeqCst);
            }
            Ok(vec![status(app)])
        })(),
        "lockNow" => (|| -> Result<Vec<NativeMessage>, String> {
            if enabled(app) {
                manager.locked.store(true, Ordering::SeqCst);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
                let _ = unlock_and_show(app, manager)?;
            }
            Ok(Vec::new())
        })(),
        _ => return None,
    };
    Some(result)
}
