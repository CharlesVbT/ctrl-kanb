use crate::{NativeMessage, background, message, storage};
use arboard::Clipboard;
use chrono::Local;
use serde_json::{Value, json};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
};
use tauri::AppHandle;

fn text(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn saved_root(app: &AppHandle, space_id: &str) -> Result<PathBuf, String> {
    let loaded = storage::load(app)?.board;
    let raw = if space_id == "utility-custom" {
        loaded
            .pointer("/settings/utilityCustomPath")
            .and_then(Value::as_str)
    } else {
        loaded
            .get("spaces")
            .and_then(Value::as_array)
            .and_then(|spaces| {
                spaces
                    .iter()
                    .find(|space| space.get("id").and_then(Value::as_str) == Some(space_id))
                    .and_then(|space| space.get("rootPath"))
                    .and_then(Value::as_str)
            })
    }
    .filter(|path| !path.trim().is_empty())
    .ok_or_else(|| "Ce projet n’existe plus dans CTRL KANB.".to_string())?;
    let root =
        fs::canonicalize(raw).map_err(|_| "Le dossier du projet est introuvable.".to_string())?;
    if !root.is_dir() {
        return Err("Le dossier du projet est introuvable.".into());
    }
    Ok(root)
}

fn reveal_saved_path(app: &AppHandle, requested: &str) -> Result<(), String> {
    let target =
        fs::canonicalize(requested).map_err(|_| "Ce dossier est introuvable.".to_string())?;
    let board = storage::load(app)?.board;
    let mut allowed = board
        .get("spaces")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|space| space.get("rootPath").and_then(Value::as_str))
        .filter_map(|path| fs::canonicalize(path).ok())
        .any(|root| root == target);
    if !allowed {
        allowed = board
            .pointer("/settings/utilityCustomPath")
            .and_then(Value::as_str)
            .filter(|path| !path.is_empty())
            .and_then(|path| fs::canonicalize(path).ok())
            .is_some_and(|root| root == target);
    }
    if !allowed {
        return Err("Ce dossier n’est pas enregistré dans CTRL KANB.".into());
    }
    reveal(&target)
}

pub(crate) fn verified_root(app: &AppHandle, payload: &Value) -> Result<PathBuf, String> {
    let space_id = text(payload, "spaceID");
    let root = saved_root(app, &space_id)?;
    let requested = fs::canonicalize(text(payload, "rootPath"))
        .map_err(|_| "Le dossier demandé est introuvable.".to_string())?;
    if requested != root {
        return Err("Le dossier demandé ne correspond pas au projet enregistré.".into());
    }
    Ok(root)
}

fn project_item(app: &AppHandle, payload: &Value, require_file: bool) -> Result<PathBuf, String> {
    let root = verified_root(app, payload)?;
    let relative = PathBuf::from(text(payload, "relativePath"));
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err("Ce chemin sort du projet.".into());
    }
    let candidate = fs::canonicalize(root.join(relative))
        .map_err(|_| "Ce fichier est introuvable.".to_string())?;
    if !candidate.starts_with(&root) {
        return Err("Ce chemin sort du projet.".into());
    }
    if require_file && !candidate.is_file() {
        return Err("Cette action nécessite un fichier.".into());
    }
    Ok(candidate)
}

fn clipboard(value: &str) -> Result<(), String> {
    Clipboard::new()
        .and_then(|mut clipboard| clipboard.set_text(value.to_string()))
        .map_err(|error| error.to_string())
}

fn reveal(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if path.is_file() {
            Command::new("explorer.exe")
                .arg(format!("/select,{}", path.display()))
                .spawn()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("explorer.exe")
                .arg(path)
                .spawn()
                .map_err(|error| error.to_string())?;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn size_label(bytes: u64) -> String {
    if bytes < 1_000 {
        format!("{bytes} o")
    } else if bytes < 1_000_000 {
        format!("{:.1} Ko", bytes as f64 / 1_000.0)
    } else if bytes < 1_000_000_000 {
        format!("{:.1} Mo", bytes as f64 / 1_000_000.0)
    } else {
        format!("{:.1} Go", bytes as f64 / 1_000_000_000.0)
    }
}

fn list_files(app: &AppHandle, payload: &Value) -> Result<Vec<NativeMessage>, String> {
    let root = verified_root(app, payload)?;
    let folder = project_item(app, payload, false)?;
    if !folder.is_dir() {
        return Err("Ce dossier est introuvable.".into());
    }
    let ignored = [".git", "node_modules", "DerivedData", ".DS_Store"];
    let mut entries = Vec::new();
    for item in fs::read_dir(&folder)
        .map_err(|error| error.to_string())?
        .flatten()
        .take(500)
    {
        let path = item.path();
        let name = item.file_name().to_string_lossy().into_owned();
        if ignored.contains(&name.as_str()) {
            continue;
        }
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        let directory = metadata.is_dir();
        let relative = path
            .strip_prefix(&root)
            .ok()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_default();
        entries.push(json!({"name":name,"relativePath":relative,"directory":directory,"size":if directory {0} else {metadata.len()},"sizeLabel":if directory {String::new()} else {size_label(metadata.len())}}));
        if entries.len() >= 400 {
            break;
        }
    }
    entries.sort_by(|left, right| {
        let ld = left["directory"].as_bool().unwrap_or(false);
        let rd = right["directory"].as_bool().unwrap_or(false);
        rd.cmp(&ld).then_with(|| {
            left["name"]
                .as_str()
                .unwrap_or_default()
                .to_lowercase()
                .cmp(&right["name"].as_str().unwrap_or_default().to_lowercase())
        })
    });
    Ok(vec![message(
        "projectFilesLoaded",
        json!({"spaceID":text(payload,"spaceID"),"relativePath":text(payload,"relativePath"),"entries":entries}),
    )])
}

fn export_board(app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    let board = storage::load(app)?.board;
    let name = format!(
        "CTRL-KANB-backup-{}.json",
        Local::now().format("%Y-%m-%d-%H%M")
    );
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Sauvegarde JSON", &["json"])
        .set_file_name(&name)
        .save_file()
    else {
        return Ok(Vec::new());
    };
    let bytes = serde_json::to_vec_pretty(&board).map_err(|error| error.to_string())?;
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(vec![message("boardExported", json!({"path":path}))])
}

fn import_board(app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Sauvegarde JSON", &["json"])
        .pick_file()
    else {
        return Ok(Vec::new());
    };
    if fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len()
        > 32 * 1024 * 1024
    {
        return Err("Cette sauvegarde dépasse la limite de 32 Mo.".into());
    }
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let imported: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Ce fichier n’est pas une sauvegarde CTRL KANB valide.".to_string())?;
    let (board, backup) = storage::replace_import(app, &imported)?;
    let scheduler_warning = background::disable_after_import(app).err();
    let status = if backup.is_some() {
        "Sauvegarde restaurée. L’état précédent a été conservé. Les programmations sont en pause jusqu’à leur reprise manuelle."
    } else {
        "Sauvegarde restaurée. Les programmations sont en pause jusqu’à leur reprise manuelle."
    };
    let mut messages = vec![message(
        "boardImported",
        json!({"board":board,"message":status}),
    )];
    if scheduler_warning.is_some() {
        messages.push(message(
            "nativeWarning",
            json!({"message":"La sauvegarde est restaurée et ses tâches sont en pause, mais Windows n’a pas pu retirer l’ancien lancement automatique. Désactive-le depuis Réglages → Moteur local."}),
        ));
    }
    Ok(messages)
}

fn save_copy(app: &AppHandle, payload: &Value) -> Result<Vec<NativeMessage>, String> {
    let source = project_item(app, payload, true)?;
    let filename = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("copie");
    let Some(destination) = rfd::FileDialog::new().set_file_name(filename).save_file() else {
        return Ok(Vec::new());
    };
    if fs::canonicalize(destination.parent().unwrap_or(Path::new(".")))
        .ok()
        .map(|folder| folder.join(destination.file_name().unwrap_or_default()))
        == Some(source.clone())
    {
        return Err("Choisis un autre emplacement pour enregistrer la copie.".into());
    }
    fs::copy(source, &destination).map_err(|error| error.to_string())?;
    Ok(vec![message(
        "projectFileSaved",
        json!({"path":destination}),
    )])
}

pub fn handle(
    action: &str,
    payload: &Value,
    app: &AppHandle,
) -> Option<Result<Vec<NativeMessage>, String>> {
    let result = match action {
        "chooseFolder" => Ok(rfd::FileDialog::new().pick_folder().map(|path| vec![message("folderChosen", json!({"path":path}))]).unwrap_or_default()),
        "chooseUtilityFolder" => Ok(rfd::FileDialog::new().pick_folder().map(|path| vec![message("utilityFolderChosen", json!({"name":path.file_name().unwrap_or_default().to_string_lossy(),"path":path}))]).unwrap_or_default()),
        "chooseUtilityAttachments" => Ok(rfd::FileDialog::new().pick_files().map(|paths| vec![message("utilityAttachmentsChosen", json!({"files":paths.into_iter().map(|path|json!({"name":path.file_name().unwrap_or_default().to_string_lossy(),"path":path})).collect::<Vec<_>>() }))]).unwrap_or_default()),
        "copyText" => clipboard(&text(payload,"text")).map(|_| Vec::new()),
        "exportBoard" => export_board(app), "importBoard" => import_board(app),
        "revealPath" => reveal_saved_path(app, &text(payload,"path")).map(|_|Vec::new()),
        "listProjectFiles" => list_files(app,payload),
        "openProjectFile" => project_item(app,payload,false).and_then(|path|open::that(path).map_err(|error|error.to_string())).map(|_|Vec::new()),
        "revealProjectFile" => project_item(app,payload,false).and_then(|path|reveal(&path)).map(|_|Vec::new()),
        "openProjectFileWith" => project_item(app,payload,true).and_then(|path| {
            #[cfg(target_os="windows")] { Command::new("rundll32.exe").arg("shell32.dll,OpenAs_RunDLL").arg(path).spawn().map_err(|error|error.to_string())?; }
            #[cfg(not(target_os="windows"))] { Command::new("open").arg("-a").arg("TextEdit").arg(path).spawn().map_err(|error|error.to_string())?; }
            Ok(())
        }).map(|_|Vec::new()),
        "saveProjectFileAs" => save_copy(app,payload),
        "copyProjectFilePath" => project_item(app,payload,false).and_then(|path|clipboard(&path.to_string_lossy())).map(|_|vec![message("projectFilePathCopied",json!({}))]),
        "resolveProjectFileForChat" => project_item(app,payload,true).map(|path|vec![message("utilityProjectFileAdded",json!({"spaceID":text(payload,"spaceID"),"name":path.file_name().unwrap_or_default().to_string_lossy(),"path":path}))]),
        _ => return None,
    };
    Some(result)
}
