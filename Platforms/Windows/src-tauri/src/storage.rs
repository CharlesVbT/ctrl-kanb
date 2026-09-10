use atomic_write_file::AtomicWriteFile;
use fs2::FileExt;
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::AppHandle;
#[cfg(not(target_os = "windows"))]
use tauri::Manager;

const MAX_BOARD_BYTES: u64 = 32 * 1024 * 1024;

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

fn board_path(app: &AppHandle) -> Result<PathBuf, String> {
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
        return Err("Le dossier de données Windows est un lien ou un point de réanalyse.".into());
    }
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    if is_link_or_reparse(&path)? {
        return Err("Le dossier de données Windows n’est pas un dossier direct.".into());
    }
    Ok(path)
}

fn validate(board: &Value) -> Result<(), String> {
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

fn read_board_file(path: &Path) -> Result<Value, String> {
    if is_link_or_reparse(path)? {
        return Err("Le fichier de données Windows est un lien ou un point de réanalyse.".into());
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
        "version": 22,
        "spaces": [],
        "cards": [],
        "utilityChats": [],
        "validations": [],
        "settings": {}
    })
}

pub fn load(app: &AppHandle) -> Result<Value, String> {
    let path = board_path(app)?;
    match read_board_file(&path) {
        Ok(board) => Ok(board),
        Err(_) if !path.exists() => Ok(starter()),
        Err(primary_error) => {
            let previous = path.with_file_name("board.previous.json");
            read_board_file(&previous).map_err(|_| primary_error)
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

pub fn save(app: &AppHandle, board: &Value) -> Result<(), String> {
    validate(board)?;
    let folder = ensure_data_dir(app)?;
    let lock_path = folder.join("board.json.lock");
    if is_link_or_reparse(&lock_path)? {
        return Err("Le verrou de données Windows n’est pas un fichier direct.".into());
    }
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock_path)
        .map_err(|error| error.to_string())?;
    lock.lock_exclusive().map_err(|error| error.to_string())?;

    let result = (|| {
        let path = folder.join("board.json");
        if path.exists() {
            let current = fs::read(&path).map_err(|error| error.to_string())?;
            if serde_json::from_slice::<Value>(&current)
                .ok()
                .as_ref()
                .is_some_and(|value| validate(value).is_ok())
            {
                atomic_write(&folder.join("board.previous.json"), &current)?;
            }
        }
        let bytes = serde_json::to_vec_pretty(board).map_err(|error| error.to_string())?;
        if bytes.len() as u64 > MAX_BOARD_BYTES {
            return Err("Le tableau dépasse la limite de 32 Mo.".into());
        }
        atomic_write(&path, &bytes)
    })();

    let _ = FileExt::unlock(&lock);
    result
}
