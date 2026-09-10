use crate::{NativeMessage, agents, message};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    env, fs,
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::Instant,
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use walkdir::WalkDir;

fn text(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn emit(app: &AppHandle, function: &str, object: Value) {
    let _ = app.emit("ctrl-kanb-native", message(function, object));
}

fn initialize() -> Value {
    json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"ctrl-kanb","title":"CTRL KANB","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}})
}

fn write_line(writer: &mut impl Write, value: &Value) -> Result<(), String> {
    serde_json::to_writer(&mut *writer, value).map_err(|error| error.to_string())?;
    writer
        .write_all(b"\n")
        .and_then(|_| writer.flush())
        .map_err(|error| error.to_string())
}

fn rpc(app: AppHandle, requests: Vec<Value>, kind: &'static str, total: usize, card_id: String) {
    thread::spawn(move || {
        let Some(path) = agents::executable("codex") else {
            let (function, object) = if kind == "list" {
                (
                    "conversationsFailed",
                    json!({"message":"Commande Codex introuvable."}),
                )
            } else if kind == "read" {
                (
                    "conversationDetailFailed",
                    json!({"cardID":card_id,"message":"Commande Codex introuvable."}),
                )
            } else {
                (
                    "syncFailed",
                    json!({"message":"Commande Codex introuvable.","completed":0,"total":total}),
                )
            };
            emit(&app, function, object);
            return;
        };
        let mut command = Command::new(path);
        command
            .args(["app-server", "--stdio"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        agents::hidden(&mut command);
        let Ok(mut child) = command.spawn() else {
            emit(
                &app,
                if kind == "list" {
                    "conversationsFailed"
                } else if kind == "read" {
                    "conversationDetailFailed"
                } else {
                    "syncFailed"
                },
                json!({"cardID":card_id,"message":"Impossible de lancer Codex App Server.","total":total,"completed":0}),
            );
            return;
        };
        let Some(mut stdin) = child.stdin.take() else {
            return;
        };
        let Some(stdout) = child.stdout.take() else {
            return;
        };
        if let Some(stderr) = child.stderr.take() {
            thread::spawn(move || {
                let mut sink = String::new();
                let _ = BufReader::new(stderr)
                    .take(1_000_000)
                    .read_to_string(&mut sink);
            });
        }
        if write_line(&mut stdin, &initialize()).is_err() {
            let _ = child.kill();
            return;
        }
        let mut reader = BufReader::new(stdout);
        let mut line = Vec::new();
        let mut initialized = false;
        let mut received = 0usize;
        let mut failed = 0usize;
        let mut results = Vec::new();
        let started = Instant::now();
        loop {
            line.clear();
            let Ok(length) = reader.read_until(b'\n', &mut line) else {
                break;
            };
            if length == 0 {
                break;
            }
            if length > 16 * 1024 * 1024 {
                break;
            }
            let Ok(value) = serde_json::from_slice::<Value>(&line) else {
                continue;
            };
            let id = value.get("id").and_then(Value::as_i64).unwrap_or(-1);
            if id == 1 && !initialized {
                initialized = true;
                let _ = write_line(&mut stdin, &json!({"method":"initialized","params":{}}));
                for request in &requests {
                    let _ = write_line(&mut stdin, request);
                }
                continue;
            }
            if id < 2 {
                continue;
            }
            if kind == "list" {
                if let Some(data) = value.pointer("/result/data").and_then(Value::as_array) {
                    emit(&app, "conversationsLoaded", json!({"conversations":data}));
                } else {
                    emit(
                        &app,
                        "conversationsFailed",
                        json!({"message":value.pointer("/error/message").and_then(Value::as_str).unwrap_or("Impossible de charger les conversations.")}),
                    );
                }
                break;
            }
            if kind == "read" {
                if let Some(thread) = value
                    .pointer("/result/thread")
                    .filter(|item| item.is_object())
                {
                    emit(
                        &app,
                        "conversationDetailLoaded",
                        json!({"cardID":card_id,"conversation":thread}),
                    );
                } else {
                    emit(
                        &app,
                        "conversationDetailFailed",
                        json!({"cardID":card_id,"threadID":requests[0]["params"]["threadId"],"message":value.pointer("/error/message").and_then(Value::as_str).unwrap_or("Conversation illisible.")}),
                    );
                }
                break;
            }
            received += 1;
            if let Some(thread) = value
                .pointer("/result/thread")
                .filter(|item| item.is_object())
            {
                results.push(thread.clone());
            } else {
                failed += 1;
            }
            emit(
                &app,
                "syncProgress",
                json!({"completed":received,"total":total}),
            );
            if received >= total {
                emit(
                    &app,
                    "conversationsSynced",
                    json!({"conversations":results,"total":total,"failed":failed,"durationMs":started.elapsed().as_millis()}),
                );
                break;
            }
        }
        let _ = child.kill();
        let _ = child.wait();
    });
}

fn list(app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    rpc(
        app.clone(),
        vec![
            json!({"id":2,"method":"thread/list","params":{"limit":80,"sortKey":"updated_at","sortDirection":"desc","archived":false,"useStateDbOnly":true}}),
        ],
        "list",
        1,
        String::new(),
    );
    Ok(Vec::new())
}

fn sync_codex(payload: &Value, app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    let mut seen = HashSet::new();
    let ids = payload
        .get("threadIDs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|id| Uuid::parse_str(id).is_ok() && seen.insert((*id).to_string()))
        .take(200)
        .map(str::to_string)
        .collect::<Vec<_>>();
    if ids.is_empty() {
        return Ok(vec![message(
            "conversationsSynced",
            json!({"conversations":[],"total":0,"failed":0,"durationMs":0}),
        )]);
    }
    let requests=ids.iter().enumerate().map(|(index,id)|json!({"id":100+index,"method":"thread/read","params":{"threadId":id,"includeTurns":true}})).collect();
    rpc(app.clone(), requests, "sync", ids.len(), String::new());
    Ok(vec![message("syncStarted", json!({"total":ids.len()}))])
}

fn read(payload: &Value, app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    let id = text(payload, "threadID");
    Uuid::parse_str(&id).map_err(|_| "Identifiant de conversation invalide.".to_string())?;
    let card = text(payload, "cardID");
    rpc(
        app.clone(),
        vec![json!({"id":2,"method":"thread/read","params":{"threadId":id,"includeTurns":true}})],
        "read",
        1,
        card,
    );
    Ok(Vec::new())
}

fn claude_home(descriptor: &Value) -> PathBuf {
    if let Some(home) = descriptor
        .get("accountHome")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    {
        return PathBuf::from(home);
    }
    env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_default()
        .join(".claude")
}

fn assistant_text(record: &Value) -> String {
    if record.get("type").and_then(Value::as_str) != Some("assistant") {
        return String::new();
    }
    let Some(content) = record.pointer("/message/content") else {
        return String::new();
    };
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    content
        .as_array()
        .into_iter()
        .flatten()
        .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n")
}

fn claude_snapshot(descriptor: &Value) -> Value {
    let id = text(descriptor, "sessionID");
    let account = text(descriptor, "accountID");
    if Uuid::parse_str(&id).is_err() {
        return json!({"sessionID":id,"accountID":account,"found":false,"error":"Identifiant de session Claude invalide."});
    }
    let projects = claude_home(descriptor).join("projects");
    let target = format!("{id}.jsonl");
    let file = WalkDir::new(projects)
        .follow_links(false)
        .max_depth(6)
        .into_iter()
        .filter_map(Result::ok)
        .find(|entry| entry.file_type().is_file() && entry.file_name().to_string_lossy() == target);
    let Some(file) = file else {
        return json!({"sessionID":id,"accountID":account,"found":false,"error":"Session locale Claude introuvable."});
    };
    let Ok(mut handle) = fs::File::open(file.path()) else {
        return json!({"sessionID":id,"accountID":account,"found":false,"error":"Session locale Claude illisible."});
    };
    let size = handle.metadata().map(|meta| meta.len()).unwrap_or(0);
    let offset = size.saturating_sub(4 * 1024 * 1024);
    let _ = handle.seek(SeekFrom::Start(offset));
    let mut bytes = Vec::new();
    let _ = handle.read_to_end(&mut bytes);
    let content = String::from_utf8_lossy(&bytes);
    let mut preview = String::new();
    let mut cwd = String::new();
    let mut updated = String::new();
    let lines = content.lines().collect::<Vec<_>>();
    for line in lines.iter().skip(if offset > 0 { 1 } else { 0 }).rev() {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if cwd.is_empty() {
            cwd = record
                .get("cwd")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        }
        if updated.is_empty() {
            updated = record
                .get("timestamp")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        }
        if preview.is_empty() {
            preview = assistant_text(&record)
        }
        if !preview.is_empty() && !cwd.is_empty() && !updated.is_empty() {
            break;
        }
    }
    if preview.len() > 12000 {
        preview.truncate(12000);
        preview.push('…');
    }
    json!({"sessionID":id,"accountID":account,"found":true,"preview":preview,"cwd":cwd,"updatedAt":updated})
}

fn sync_claude(payload: &Value, app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    let sessions = payload
        .get("sessions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(200)
        .collect::<Vec<_>>();
    let total = sessions.len();
    if total == 0 {
        return Ok(vec![
            message("claudeSyncStarted", json!({"total":0})),
            message(
                "claudeSessionsSynced",
                json!({"sessions":[],"total":0,"failed":0,"durationMs":0}),
            ),
        ]);
    }
    let app = app.clone();
    thread::spawn(move || {
        let started = Instant::now();
        let results = sessions.iter().map(claude_snapshot).collect::<Vec<_>>();
        let failed = results
            .iter()
            .filter(|item| !item.get("found").and_then(Value::as_bool).unwrap_or(false))
            .count();
        emit(
            &app,
            "claudeSessionsSynced",
            json!({"sessions":results,"total":total,"failed":failed,"durationMs":started.elapsed().as_millis()}),
        );
    });
    Ok(vec![message("claudeSyncStarted", json!({"total":total}))])
}

fn open_url(payload: &Value, claude: bool) -> Result<Vec<NativeMessage>, String> {
    let id = text(payload, "threadID");
    Uuid::parse_str(&id).map_err(|_| "Identifiant de conversation invalide.".to_string())?;
    open::that(if claude {
        format!("claude://resume?session={id}")
    } else {
        format!("codex://threads/{id}")
    })
    .map_err(|error| error.to_string())?;
    Ok(Vec::new())
}

pub fn handle(
    action: &str,
    payload: &Value,
    app: &AppHandle,
) -> Option<Result<Vec<NativeMessage>, String>> {
    Some(match action {
        "listConversations" => list(app),
        "syncConversations" => sync_codex(payload, app),
        "syncClaudeSessions" => sync_claude(payload, app),
        "readConversation" => read(payload, app),
        "openConversation" => open_url(payload, false),
        "openClaudeConversation" => open_url(payload, true),
        _ => return None,
    })
}
