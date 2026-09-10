use atomic_write_file::AtomicWriteFile;
use chrono::Local;
use fs2::FileExt;
use serde::Serialize;
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::AppHandle;
#[cfg(not(target_os = "windows"))]
use tauri::Manager;
use uuid::Uuid;

const MAX_BOARD_BYTES: u64 = 32 * 1024 * 1024;
const BOARD_VERSION: i64 = 22;

#[derive(Serialize)]
pub struct LoadResult {
    pub board: Value,
    pub recovered: bool,
}

pub enum SaveResult {
    Saved(Value),
    Merged(Value),
    Conflict(Value),
}

pub fn data_dir(_app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let root = std::env::var_os("LOCALAPPDATA")
            .ok_or_else(|| "%LOCALAPPDATA% est indisponible.".to_string())?;
        Ok(PathBuf::from(root).join("CTRL KANB Data"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        _app.path()
            .app_local_data_dir()
            .map(|path| path.join("CTRL KANB Windows Preview"))
            .map_err(|error| error.to_string())
    }
}

pub fn board_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("board.json"))
}

fn is_link_or_reparse(path: &Path) -> Result<bool, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    if metadata.file_type().is_symlink() {
        return Ok(true);
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        Ok(metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
    }
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

fn ensure_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = data_dir(app)?;
    if is_link_or_reparse(&path)? {
        return Err("Le dossier de données est un lien ou un point de réanalyse.".into());
    }
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    if is_link_or_reparse(&path)? {
        return Err("Le dossier de données n’est pas un dossier direct.".into());
    }
    Ok(path)
}

pub fn validate(board: &Value) -> Result<(), String> {
    let object = board
        .as_object()
        .ok_or_else(|| "Le tableau doit être un objet JSON.".to_string())?;
    if !object.get("spaces").is_some_and(Value::is_array)
        || !object.get("cards").is_some_and(Value::is_array)
    {
        return Err("Le tableau doit contenir les listes spaces et cards.".into());
    }
    Ok(())
}

fn validate_import(board: &Value) -> Result<(), String> {
    validate(board)?;
    let object = board.as_object().expect("validated object");
    for key in [
        "spaces",
        "cards",
        "utilityChats",
        "templates",
        "validations",
    ] {
        let Some(value) = object.get(key) else {
            continue;
        };
        let items = value
            .as_array()
            .ok_or_else(|| format!("La section {key} doit être une liste."))?;
        if items.len() > 100_000 || items.iter().any(|item| !item.is_object()) {
            return Err(format!("La section {key} est invalide."));
        }
    }
    if object
        .get("settings")
        .is_some_and(|value| !value.is_object())
    {
        return Err("Les réglages de cette sauvegarde sont invalides.".into());
    }
    if object.get("version").and_then(Value::as_i64).unwrap_or(0) > BOARD_VERSION {
        return Err("Cette sauvegarde vient d’une version plus récente de CTRL KANB.".into());
    }
    Ok(())
}

fn neutralize_imported_board(restored: &mut Map<String, Value>) -> usize {
    let settings = restored
        .entry("settings")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .expect("import settings validated");
    settings.insert("backgroundSchedulerEnabled".into(), json!(false));

    let mut paused = 0;
    if let Some(cards) = restored.get_mut("cards").and_then(Value::as_array_mut) {
        for card in cards {
            let Some(card) = card.as_object_mut() else {
                continue;
            };
            let status = card
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if matches!(status.as_str(), "queued" | "running") {
                card.insert("status".into(), json!("ready"));
            }
            card.remove("executionState");
            card.remove("pausedAt");

            let scheduled = card.get("launchMode").and_then(Value::as_str) == Some("scheduled");
            let archived = card
                .get("archived")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let finished = status == "done" || archived;
            if scheduled && !finished {
                card.insert("scheduleState".into(), json!("paused"));
                card.insert("scheduleNextAttemptAt".into(), json!(""));
                card.insert("scheduleTriggeredAt".into(), json!(""));
                card.insert("scheduleAttempts".into(), json!(0));
                card.insert(
                    "scheduleNote".into(),
                    json!("Programmation suspendue après restauration. Reprends-la quand tu l’as vérifiée."),
                );
                paused += 1;
            }
        }
    }
    if let Some(chats) = restored
        .get_mut("utilityChats")
        .and_then(Value::as_array_mut)
    {
        for chat in chats {
            let Some(chat) = chat.as_object_mut() else {
                continue;
            };
            if matches!(
                chat.get("status").and_then(Value::as_str),
                Some("queued" | "running")
            ) {
                chat.insert("status".into(), json!("ready"));
            }
            chat.remove("executionState");
        }
    }
    paused
}

fn read_board_file(path: &Path) -> Result<Value, String> {
    if is_link_or_reparse(path)? {
        return Err("Le fichier de données est un lien ou un point de réanalyse.".into());
    }
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let length = file.metadata().map_err(|error| error.to_string())?.len();
    if length > MAX_BOARD_BYTES {
        return Err("Le tableau dépasse la limite de 32 Mo.".into());
    }
    let mut bytes = Vec::with_capacity(length as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    let board: Value = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    validate(&board)?;
    Ok(board)
}

fn starter() -> Value {
    json!({
        "version": BOARD_VERSION,
        "spaces": [], "cards": [], "utilityChats": [], "validations": [],
        "settings": {
            "maxConcurrency": 2, "maxConcurrencyCodex": 2, "maxConcurrencyClaude": 1,
            "autoSync": true, "backgroundSchedulerEnabled": false,
            "autoArchiveCompletedDays": 0, "defaultModel": "gpt-5.6-sol",
            "defaultEffort": "medium", "defaultEffortCodex": "medium",
            "defaultEffortClaude": "medium", "sidebarCollapsed": false,
            "defaultBoardPreset": "classic", "activePresetByScope": {},
            "accounts": [], "activeAccount": {}, "accountChecks": {},
            "conversationSyncChecks": {}, "agendaMode": "week",
            "agendaTimeZone": "auto", "agendaWeekStart": "auto",
            "agendaHourCycle": "auto", "theme": "auto", "themePalette": "graphite",
            "inAppNotifications": "all", "systemNotificationsEnabled": true,
            "notificationWhen": "background",
            "notificationEvents": {"taskComplete":true,"taskFailed":true,"approval":true,"chatReply":true,"scheduleIssue":true},
            "utilityPanelOpen": false, "utilityPanelWidth": 390,
            "utilityTab": "chat", "utilityAgent": "codex",
            "utilitySpaceID": "", "utilityCustomPath": ""
        },
        "modifiedAt": Local::now().to_rfc3339()
    })
}

pub fn load(app: &AppHandle) -> Result<LoadResult, String> {
    let path = board_path(app)?;
    match read_board_file(&path) {
        Ok(board) => Ok(LoadResult {
            board,
            recovered: false,
        }),
        Err(_) if !path.exists() => Ok(LoadResult {
            board: starter(),
            recovered: false,
        }),
        Err(primary_error) => {
            let previous = path.with_file_name("board.previous.json");
            read_board_file(&previous)
                .map(|board| LoadResult {
                    board,
                    recovered: true,
                })
                .map_err(|_| primary_error)
        }
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if is_link_or_reparse(path)? {
        return Err("Refus d’écrire à travers un lien ou un point de réanalyse.".into());
    }
    let mut file = AtomicWriteFile::options()
        .open(path)
        .map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    file.commit().map_err(|error| error.to_string())
}

fn write_json(path: &Path, board: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(board).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_BOARD_BYTES {
        return Err("Le tableau dépasse la limite de 32 Mo.".into());
    }
    atomic_write(path, &bytes)
}

fn by_id(items: Option<&Vec<Value>>) -> HashMap<String, &Value> {
    items
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item.get("id")
                .and_then(Value::as_str)
                .map(|id| (id.to_string(), item))
        })
        .collect()
}

fn merge_collection(
    base: Option<&Vec<Value>>,
    incoming: Option<&Vec<Value>>,
    current: Option<&Vec<Value>>,
) -> Result<Vec<Value>, ()> {
    let base_map = by_id(base);
    let incoming_map = by_id(incoming);
    let current_map = by_id(current);
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    for list in [incoming, current, base].into_iter().flatten() {
        for item in list {
            if let Some(id) = item.get("id").and_then(Value::as_str)
                && seen.insert(id.to_string())
            {
                ids.push(id.to_string());
            }
        }
    }
    let mut merged = Vec::new();
    for id in ids {
        let ancestor = base_map.get(&id).copied();
        let local = incoming_map.get(&id).copied();
        let remote = current_map.get(&id).copied();
        let chosen = if local == remote {
            local
        } else if local == ancestor {
            remote
        } else if remote == ancestor {
            local
        } else {
            return Err(());
        };
        if let Some(value) = chosen {
            merged.push(value.clone());
        }
    }
    Ok(merged)
}

fn merge_boards(base: &Value, incoming: &Value, current: &Value) -> Result<Value, ()> {
    if validate(base).is_err() || validate(incoming).is_err() || validate(current).is_err() {
        return Err(());
    }
    let mut merged = incoming.as_object().cloned().ok_or(())?;
    merged.insert(
        "spaces".into(),
        Value::Array(merge_collection(
            base["spaces"].as_array(),
            incoming["spaces"].as_array(),
            current["spaces"].as_array(),
        )?),
    );
    merged.insert(
        "cards".into(),
        Value::Array(merge_collection(
            base["cards"].as_array(),
            incoming["cards"].as_array(),
            current["cards"].as_array(),
        )?),
    );
    Ok(Value::Object(merged))
}

fn with_lock<T>(
    app: &AppHandle,
    operation: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    let folder = ensure_data_dir(app)?;
    let lock_path = folder.join("board.json.lock");
    if is_link_or_reparse(&lock_path)? {
        return Err("Le verrou de données n’est pas un fichier direct.".into());
    }
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock_path)
        .map_err(|error| error.to_string())?;
    lock.lock_exclusive().map_err(|error| error.to_string())?;
    let result = operation(&folder);
    let _ = FileExt::unlock(&lock);
    result
}

pub fn save(
    app: &AppHandle,
    incoming: &Value,
    presented: Option<&Value>,
) -> Result<SaveResult, String> {
    validate(incoming)?;
    with_lock(app, |folder| {
        let path = folder.join("board.json");
        let current = read_board_file(&path).ok();
        let mut selected = incoming.clone();
        let mut merged = false;
        if let (Some(base), Some(disk)) = (presented, current.as_ref())
            && base != disk
            && incoming != disk
        {
            match merge_boards(base, incoming, disk) {
                Ok(value) => {
                    selected = value;
                    merged = true;
                }
                Err(()) => {
                    let conflict = folder.join(format!(
                        "board.conflict-{}-{}.json",
                        Local::now().format("%Y%m%d-%H%M%S"),
                        &Uuid::new_v4().to_string()[..8]
                    ));
                    write_json(&conflict, incoming)?;
                    return Ok(SaveResult::Conflict(disk.clone()));
                }
            }
        }
        if let Some(object) = selected.as_object_mut() {
            object.insert("version".into(), json!(BOARD_VERSION));
            object.insert("modifiedAt".into(), json!(Local::now().to_rfc3339()));
            object.entry("settings").or_insert_with(|| json!({}));
        }
        if let Some(disk) = current.as_ref() {
            write_json(&folder.join("board.previous.json"), disk)?;
        }
        write_json(&path, &selected)?;
        append_event(
            app,
            json!({"type": if merged {"board.merged"} else {"board.saved"}}),
        );
        Ok(if merged {
            SaveResult::Merged(selected)
        } else {
            SaveResult::Saved(selected)
        })
    })
}

pub fn replace_import(
    app: &AppHandle,
    imported: &Value,
) -> Result<(Value, Option<PathBuf>), String> {
    validate_import(imported)?;
    with_lock(app, |folder| {
        let path = folder.join("board.json");
        let current = read_board_file(&path).ok();
        let backup = if let Some(board) = current.as_ref() {
            let target = folder.join(format!(
                "board.before-import-{}-{}.json",
                Local::now().format("%Y%m%d-%H%M%S"),
                &Uuid::new_v4().to_string()[..8]
            ));
            write_json(&target, board)?;
            write_json(&folder.join("board.previous.json"), board)?;
            Some(target)
        } else {
            None
        };
        let mut restored = imported.as_object().cloned().unwrap_or_else(Map::new);
        restored.insert("version".into(), json!(BOARD_VERSION));
        let paused = neutralize_imported_board(&mut restored);
        restored.insert("modifiedAt".into(), json!(Local::now().to_rfc3339()));
        let board = Value::Object(restored);
        write_json(&path, &board)?;
        append_event(
            app,
            json!({"type":"board.imported","spaces":board["spaces"].as_array().map_or(0,Vec::len),"cards":board["cards"].as_array().map_or(0,Vec::len),"schedulesPaused":paused}),
        );
        Ok((board, backup))
    })
}

pub fn append_event(app: &AppHandle, mut event: Value) {
    let Ok(folder) = ensure_data_dir(app) else {
        return;
    };
    let path = folder.join("events.jsonl");
    if is_link_or_reparse(&path).unwrap_or(true) {
        return;
    }
    if let Some(object) = event.as_object_mut() {
        object.insert("at".into(), json!(Local::now().to_rfc3339()));
    }
    let Ok(mut bytes) = serde_json::to_vec(&event) else {
        return;
    };
    bytes.push(b'\n');
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(&bytes);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn board(cards: Value) -> Value {
        json!({"version":22,"spaces":[],"cards":cards,"settings":{}})
    }
    #[test]
    fn merges_independent_card_changes() {
        let base = board(json!([{"id":"a","title":"A"},{"id":"b","title":"B"}]));
        let local = board(json!([{"id":"a","title":"Local"},{"id":"b","title":"B"}]));
        let remote = board(json!([{"id":"a","title":"A"},{"id":"b","title":"Remote"}]));
        let merged = merge_boards(&base, &local, &remote).unwrap();
        assert_eq!(merged["cards"][0]["title"], "Local");
        assert_eq!(merged["cards"][1]["title"], "Remote");
    }
    #[test]
    fn rejects_same_card_conflict() {
        let base = board(json!([{"id":"a","title":"A"}]));
        let local = board(json!([{"id":"a","title":"Local"}]));
        let remote = board(json!([{"id":"a","title":"Remote"}]));
        assert!(merge_boards(&base, &local, &remote).is_err());
    }
    #[test]
    fn rejects_newer_imports() {
        assert!(validate_import(&json!({"version":23,"spaces":[],"cards":[]})).is_err());
    }

    #[test]
    fn imported_automation_is_restored_paused() {
        let mut imported = json!({
            "settings":{"backgroundSchedulerEnabled":true},
            "cards":[
                {"id":"due","status":"queued","launchMode":"scheduled","scheduledAt":"2026-01-01T10:00:00Z","scheduleState":"pending","recurrence":"weekly"},
                {"id":"done","status":"done","launchMode":"scheduled","scheduleState":"completed"}
            ],
            "utilityChats":[{"id":"chat","status":"running","executionState":"active"}]
        })
        .as_object()
        .cloned()
        .unwrap();
        assert_eq!(neutralize_imported_board(&mut imported), 1);
        assert_eq!(imported["settings"]["backgroundSchedulerEnabled"], false);
        assert_eq!(imported["cards"][0]["status"], "ready");
        assert_eq!(imported["cards"][0]["scheduleState"], "paused");
        assert_eq!(imported["cards"][0]["recurrence"], "weekly");
        assert_eq!(imported["cards"][1]["scheduleState"], "completed");
        assert_eq!(imported["utilityChats"][0]["status"], "ready");
    }
}
