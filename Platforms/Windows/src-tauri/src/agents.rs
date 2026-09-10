use crate::{NativeMessage, message, notifications, platform};
use chrono::Utc;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, VecDeque},
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Clone)]
pub struct AgentManager {
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    runs: HashMap<String, ActiveRun>,
    starting: HashMap<String, (String, Option<String>)>,
    queue: VecDeque<Value>,
    max_codex: usize,
    max_claude: usize,
}

struct ActiveRun {
    engine: String,
    conversation: Option<String>,
    pid: u32,
    context: Arc<Mutex<RunContext>>,
}

struct RunContext {
    card_id: String,
    engine: String,
    card: Value,
    space: Value,
    mode: String,
    auto_approve: bool,
    created: bool,
    force_new: bool,
    recovered: bool,
    initialized: bool,
    thread_id: String,
    turn_id: String,
    latest: String,
    pending: HashMap<String, Value>,
    stdin: Arc<Mutex<ChildStdin>>,
    finished: bool,
}

impl Default for AgentManager {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                runs: HashMap::new(),
                starting: HashMap::new(),
                queue: VecDeque::new(),
                max_codex: 2,
                max_claude: 1,
            })),
        }
    }
}

fn string(value: &Value, pointer: &str) -> String {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn is_claude(payload: &Value) -> bool {
    matches!(
        string(payload, "/card/agentEngine").as_str(),
        "claude-code" | "claudeCode"
    )
}

fn engine(payload: &Value) -> String {
    if is_claude(payload) {
        "claude-code".into()
    } else {
        "codex".into()
    }
}

fn claude_model(value: &str) -> Option<&str> {
    let model = value.trim();
    if model.is_empty() || model == "default" || model.starts_with("gpt-") {
        None
    } else {
        Some(model)
    }
}

fn conversation(payload: &Value) -> Option<String> {
    if payload
        .get("newConversation")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }
    let id = string(payload, "/card/conversationID");
    (!id.is_empty()).then(|| format!("{}:{id}", engine(payload)))
}

fn emit(app: &AppHandle, function: &str, object: Value) {
    let _ = app.emit("ctrl-kanb-native", message(function, object));
}

pub(crate) fn executable(engine: &str) -> Option<PathBuf> {
    let name = if engine == "claude-code" {
        "claude"
    } else {
        "codex"
    };
    let override_names = if engine == "claude-code" {
        ["CTRL_KANB_CLAUDE_PATH", "CLAUDE_PATH"]
    } else {
        ["CTRL_KANB_CODEX_PATH", "CODEX_PATH"]
    };
    let mut candidates = Vec::new();
    for override_name in override_names {
        if let Some(path) = env::var_os(override_name) {
            candidates.push(PathBuf::from(path));
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(root) = env::var_os("LOCALAPPDATA") {
            if name == "codex" {
                let root = PathBuf::from(root);
                let managed = root.join("OpenAI/Codex/bin");
                let mut current = fs::read_dir(&managed)
                    .into_iter()
                    .flatten()
                    .filter_map(Result::ok)
                    .map(|entry| entry.path().join("codex.exe"))
                    .filter(|path| path.is_file())
                    .collect::<Vec<_>>();
                current.sort_by_key(|path| {
                    std::cmp::Reverse(
                        fs::metadata(path)
                            .and_then(|metadata| metadata.modified())
                            .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                    )
                });
                candidates.extend(current);
                candidates.push(root.join("Programs/OpenAI/Codex/bin/codex.exe"));
            }
        }
        if let Some(root) = env::var_os("USERPROFILE") {
            candidates.push(PathBuf::from(root).join(format!(".local/bin/{name}.exe")));
        }
    }
    for folder in env::split_paths(&env::var_os("PATH").unwrap_or_default()) {
        candidates.push(folder.join(format!("{name}.exe")));
        #[cfg(not(target_os = "windows"))]
        candidates.push(folder.join(name));
    }
    candidates.into_iter().find(|path| path.is_file())
}

pub fn availability() -> Value {
    json!({"codex":executable("codex").is_some(),"claude":executable("claude-code").is_some()})
}

fn expanded_account_home(home: &str) -> PathBuf {
    let value = home.trim();
    for (token, variable) in [
        ("%LOCALAPPDATA%", "LOCALAPPDATA"),
        ("%USERPROFILE%", "USERPROFILE"),
    ] {
        if value
            .get(..token.len())
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(token))
            && let Some(root) = env::var_os(variable)
        {
            return PathBuf::from(root).join(value[token.len()..].trim_start_matches(['/', '\\']));
        }
    }
    if let Some(rest) = value
        .strip_prefix("~/")
        .or_else(|| value.strip_prefix("~\\"))
        && let Some(root) = env::var_os("USERPROFILE").or_else(|| env::var_os("HOME"))
    {
        return PathBuf::from(root).join(rest);
    }
    PathBuf::from(value)
}

fn apply_account(command: &mut Command, engine: &str, home: &str) -> Result<(), String> {
    command.env_remove("CLAUDECODE");
    if home.trim().is_empty() {
        return Ok(());
    }
    let path = expanded_account_home(home);
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    command.env(
        if engine == "claude-code" {
            "CLAUDE_CONFIG_DIR"
        } else {
            "CODEX_HOME"
        },
        path,
    );
    Ok(())
}

pub(crate) fn hidden(_command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        _command.creation_flags(0x08000000);
    }
}

fn send_line(stdin: &Arc<Mutex<ChildStdin>>, value: &Value) -> Result<(), String> {
    let mut line = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    line.push(b'\n');
    let mut writer = stdin
        .lock()
        .map_err(|_| "Le flux de l’agent est indisponible.")?;
    writer
        .write_all(&line)
        .and_then(|_| writer.flush())
        .map_err(|error| error.to_string())
}

fn request_root(app: &AppHandle, payload: &Value) -> Result<PathBuf, String> {
    let flat =
        json!({"spaceID":string(payload,"/space/id"),"rootPath":string(payload,"/space/rootPath")});
    platform::verified_root(app, &flat)
}

fn display_root(space: &Value) -> String {
    let displayed = string(space, "/displayRootPath");
    if displayed.trim().is_empty() {
        string(space, "/rootPath")
    } else {
        displayed
    }
}

fn path_stays_in_project(raw: &str, root: &Path) -> bool {
    let requested = Path::new(raw);
    let candidate = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        root.join(requested)
    };
    let Ok(root) = fs::canonicalize(root) else {
        return false;
    };
    let Ok(candidate) = fs::canonicalize(candidate) else {
        return false;
    };
    candidate == root || candidate.starts_with(root)
}

fn claude_read_input_stays_in_project(tool: &str, input: &Value, root: &Path) -> bool {
    if tool == "Glob" {
        let pattern = input.get("pattern").and_then(Value::as_str).unwrap_or("");
        let pattern_path = Path::new(pattern);
        if pattern.is_empty()
            || pattern.starts_with('~')
            || pattern_path.is_absolute()
            || pattern_path
                .components()
                .any(|component| component == std::path::Component::ParentDir)
        {
            return false;
        }
    }
    let key = if tool == "Read" { "file_path" } else { "path" };
    let Some(raw) = input
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    else {
        return tool != "Read";
    };
    path_stays_in_project(raw, root)
}

fn active_counts(inner: &Inner, selected: &str) -> usize {
    inner
        .runs
        .values()
        .filter(|run| run.engine == selected)
        .count()
        + inner
            .starting
            .values()
            .filter(|(engine, _)| engine == selected)
            .count()
}

fn can_start(inner: &Inner, payload: &Value) -> bool {
    let selected = engine(payload);
    let key = conversation(payload);
    if let Some(key) = key.as_ref()
        && (inner
            .runs
            .values()
            .any(|run| run.conversation.as_ref() == Some(key))
            || inner
                .starting
                .values()
                .any(|(_, conversation)| conversation.as_ref() == Some(key)))
    {
        return false;
    }
    active_counts(inner, &selected)
        < if selected == "claude-code" {
            inner.max_claude
        } else {
            inner.max_codex
        }
}

fn queue_message(inner: &Inner) -> NativeMessage {
    let mut codex = 1;
    let mut claude = 1;
    let items = inner.queue.iter().filter_map(|payload| {
        let id = string(payload, "/card/id"); if id.is_empty() { return None; }
        let selected = engine(payload); let blocked = conversation(payload).is_some_and(|key| {
            inner.runs.values().any(|run| run.conversation.as_ref() == Some(&key))
                || inner.starting.values().any(|(_, current)| current.as_ref() == Some(&key))
        });
        let position = if selected == "claude-code" { let value=claude; claude+=1; value } else { let value=codex; codex+=1; value };
        Some(json!({"cardID":id,"position":position,"reason":if blocked {"conversation"} else {"capacity"}}))
    }).collect::<Vec<_>>();
    message(
        "queueUpdated",
        json!({"items":items,"activeCodex":active_counts(inner,"codex"),"activeClaude":active_counts(inner,"claude-code"),"limitCodex":inner.max_codex,"limitClaude":inner.max_claude}),
    )
}

fn reserve_or_queue(manager: &AgentManager, payload: Value) -> Result<bool, String> {
    let id = string(&payload, "/card/id");
    if id.is_empty() {
        return Err("Identifiant de tâche absent.".into());
    }
    let mut inner = manager
        .inner
        .lock()
        .map_err(|_| "La file d’exécution est indisponible.")?;
    if inner.runs.contains_key(&id)
        || inner.starting.contains_key(&id)
        || inner
            .queue
            .iter()
            .any(|item| string(item, "/card/id") == id)
    {
        return Ok(false);
    }
    if can_start(&inner, &payload) {
        inner
            .starting
            .insert(id, (engine(&payload), conversation(&payload)));
        Ok(true)
    } else {
        inner.queue.push_back(payload);
        Ok(false)
    }
}

fn command_for(payload: &Value, root: &Path, session: &mut String) -> Result<Command, String> {
    let selected = engine(payload);
    let path = executable(&selected).ok_or_else(|| {
        if selected == "claude-code" {
            "Claude Code est introuvable. Installe la CLI officielle pour Windows."
        } else {
            "Codex est introuvable. Installe l’application ou la CLI officielle pour Windows."
        }
        .to_string()
    })?;
    let mut command = Command::new(path);
    if selected == "codex" {
        command.args(["app-server", "--stdio"]);
    } else {
        let card = &payload["card"];
        let mode = string(payload, "/mode");
        let model = card
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("default");
        let mut effort = card
            .get("reasoningEffort")
            .and_then(Value::as_str)
            .unwrap_or("medium");
        if !["low", "medium", "high", "xhigh", "max"].contains(&effort) {
            effort = "medium";
        }
        let title = card
            .get("title")
            .and_then(Value::as_str)
            .filter(|title| !title.is_empty())
            .unwrap_or("Tâche CTRL KANB");
        command.args([
            "--print",
            "--verbose",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--permission-prompt-tool",
            "stdio",
            "--permission-mode",
            "default",
        ]);
        if let Some(model) = claude_model(model) {
            command.args(["--model", model]);
        }
        command.args([
            "--effort",
            effort,
            "--name",
            title,
            "--strict-mcp-config",
            "--mcp-config",
            "{\"mcpServers\":{}}",
        ]);
        if mode != "workspaceWrite" {
            command.args([
                "--setting-sources",
                "",
                "--tools",
                "Read,Glob,Grep",
                "--disable-slash-commands",
            ]);
        }
        let existing = string(payload, "/card/conversationID");
        if !existing.is_empty()
            && !payload
                .get("newConversation")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        {
            Uuid::parse_str(&existing)
                .map_err(|_| "L’identifiant de session Claude est invalide.".to_string())?;
            *session = existing;
            command.args(["--resume", session.as_str()]);
        } else {
            *session = Uuid::new_v4().to_string();
            command.args(["--session-id", session.as_str()]);
        }
    }
    command
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_account(&mut command, &selected, &string(payload, "/accountHome"))?;
    hidden(&mut command);
    Ok(command)
}

fn initialize_codex(context: &Arc<Mutex<RunContext>>) -> Result<(), String> {
    let stdin = context
        .lock()
        .map_err(|_| "Agent indisponible.")?
        .stdin
        .clone();
    send_line(
        &stdin,
        &json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"Codex Desktop","title":"CTRL KANB","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}}),
    )
}

fn launch(manager: &AgentManager, payload: Value, app: &AppHandle) -> Result<(), String> {
    let card_id = string(&payload, "/card/id");
    let selected = engine(&payload);
    let root = request_root(app, &payload)?;
    let mut session = if selected == "codex" {
        string(&payload, "/card/conversationID")
    } else {
        String::new()
    };
    let mut command = command_for(&payload, &root, &mut session)?;
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let pid = child.id();
    let stdin = Arc::new(Mutex::new(
        child
            .stdin
            .take()
            .ok_or("Entrée de l’agent indisponible.")?,
    ));
    let stdout = child
        .stdout
        .take()
        .ok_or("Sortie de l’agent indisponible.")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Erreur de l’agent indisponible.")?;
    let context = Arc::new(Mutex::new(RunContext {
        card_id: card_id.clone(),
        engine: selected.clone(),
        card: payload["card"].clone(),
        space: payload["space"].clone(),
        mode: string(&payload, "/mode"),
        auto_approve: payload
            .get("autoApprove")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        created: conversation(&payload).is_none(),
        force_new: payload
            .get("newConversation")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        recovered: false,
        initialized: false,
        thread_id: session,
        turn_id: String::new(),
        latest: String::new(),
        pending: HashMap::new(),
        stdin: stdin.clone(),
        finished: false,
    }));
    {
        let mut inner = manager
            .inner
            .lock()
            .map_err(|_| "La file d’exécution est indisponible.")?;
        inner.starting.remove(&card_id);
        inner.runs.insert(
            card_id.clone(),
            ActiveRun {
                engine: selected.clone(),
                conversation: conversation(&payload),
                pid,
                context: context.clone(),
            },
        );
    }
    emit(app, "runnerStarted", json!({"cardID":card_id}));
    let initialized = if selected == "codex" {
        initialize_codex(&context)
    } else {
        if let Ok(ctx) = context.lock() {
            emit(
                app,
                "conversationAssociated",
                json!({
                    "cardID":ctx.card_id,"threadID":ctx.thread_id,"engine":"claude-code",
                    "name":ctx.card.get("title").and_then(Value::as_str).unwrap_or("Session Claude"),
                    "cwd":display_root(&ctx.space),"projectName":ctx.space.get("name").and_then(Value::as_str).unwrap_or(""),
                    "accountID":ctx.card.get("accountID").and_then(Value::as_str).unwrap_or(""),"created":ctx.created
                }),
            );
        }
        send_line(
            &stdin,
            &json!({"type":"control_request","request_id":"ctrl-init","request":{"subtype":"initialize"}}),
        )
    };
    if let Err(error) = initialized {
        if let Ok(mut inner) = manager.inner.lock() {
            inner.runs.remove(&card_id);
        }
        if let Ok(mut ctx) = context.lock() {
            ctx.finished = true;
        }
        kill_process(pid);
        return Err(error);
    }

    let reader_manager = manager.clone();
    let reader_context = context.clone();
    let reader_app = app.clone();
    thread::spawn(move || read_messages(stdout, reader_context, reader_manager, reader_app));
    let errors = Arc::new(Mutex::new(String::new()));
    let errors_writer = errors.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut text = String::new();
        let _ = reader.read_to_string(&mut text);
        if text.len() > 1_000_000 {
            text.truncate(1_000_000);
        }
        if let Ok(mut saved) = errors_writer.lock() {
            *saved = text;
        }
    });
    let wait_manager = manager.clone();
    let wait_context = context;
    let wait_app = app.clone();
    thread::spawn(move || {
        let status = child.wait();
        let done = wait_context.lock().map(|ctx| ctx.finished).unwrap_or(true);
        if !done {
            let detail = errors
                .lock()
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| {
                    status
                        .map(|value| {
                            format!(
                                "L’agent s’est arrêté avec le code {}.",
                                value.code().unwrap_or(-1)
                            )
                        })
                        .unwrap_or_else(|error| error.to_string())
                });
            finish(&wait_manager, &wait_app, &wait_context, false, Some(detail));
        }
    });
    Ok(())
}

fn read_messages(
    stdout: impl Read,
    context: Arc<Mutex<RunContext>>,
    manager: AgentManager,
    app: AppHandle,
) {
    let mut reader = BufReader::new(stdout);
    let mut bytes = Vec::new();
    loop {
        bytes.clear();
        let Ok(length) = reader.read_until(b'\n', &mut bytes) else {
            break;
        };
        if length == 0 {
            break;
        }
        if length > 16 * 1024 * 1024 {
            finish(
                &manager,
                &app,
                &context,
                false,
                Some("Une réponse native dépasse la limite autorisée.".into()),
            );
            break;
        }
        if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
            handle_message(&manager, &app, &context, &value);
        }
    }
}

fn send_context(context: &Arc<Mutex<RunContext>>, value: &Value) -> Result<(), String> {
    let stdin = context
        .lock()
        .map_err(|_| "Agent indisponible.")?
        .stdin
        .clone();
    send_line(&stdin, value)
}

fn start_codex_thread(context: &Arc<Mutex<RunContext>>) -> Result<(), String> {
    let ctx = context.lock().map_err(|_| "Agent indisponible.")?;
    let resume = !ctx.force_new && !ctx.thread_id.is_empty();
    let reviewer = if ctx.auto_approve {
        "auto_review"
    } else {
        "user"
    };
    let mut params = json!({"cwd":ctx.space["rootPath"],"approvalPolicy":"on-request","approvalsReviewer":reviewer,"sandbox":if ctx.mode=="workspaceWrite"{"workspace-write"}else{"read-only"}});
    if resume {
        params["threadId"] = json!(ctx.thread_id);
        params["excludeTurns"] = json!(true);
    } else {
        params["serviceName"] = json!("CTRL KANB");
        params["threadSource"] = json!("user");
        params["ephemeral"] = json!(false);
    }
    let method = if resume {
        "thread/resume"
    } else {
        "thread/start"
    };
    let stdin = ctx.stdin.clone();
    drop(ctx);
    send_line(&stdin, &json!({"id":2,"method":method,"params":params}))
}

fn handle_codex(
    manager: &AgentManager,
    app: &AppHandle,
    context: &Arc<Mutex<RunContext>>,
    message: &Value,
) {
    let id = message.get("id").and_then(Value::as_i64);
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    if message.get("error").is_some() {
        let detail = string(message, "/error/message");
        if id == Some(2) && detail.to_lowercase().contains("active writer") {
            if let Ok(mut ctx) = context.lock() {
                ctx.force_new = true;
                ctx.recovered = true;
                ctx.thread_id.clear();
            }
            let _ = start_codex_thread(context);
            return;
        }
        if matches!(id, Some(1 | 2 | 4)) {
            finish(
                manager,
                app,
                context,
                false,
                Some(if detail.is_empty() {
                    "Erreur Codex App Server.".into()
                } else {
                    detail
                }),
            );
        }
        return;
    }
    if id == Some(1) {
        let _ = send_context(context, &json!({"method":"initialized","params":{}}));
        let _ = start_codex_thread(context);
        return;
    }
    if id == Some(2) {
        let thread_id = string(message, "/result/thread/id");
        if thread_id.is_empty() {
            finish(
                manager,
                app,
                context,
                false,
                Some("Codex n’a pas retourné d’identifiant de conversation.".into()),
            );
            return;
        }
        let (mut association, turn) = if let Ok(mut ctx) = context.lock() {
            ctx.thread_id = thread_id.clone();
            let association = json!({"cardID":ctx.card_id,"threadID":thread_id,"name":ctx.card.get("title").and_then(Value::as_str).unwrap_or("Conversation Codex"),"preview":"","cwd":display_root(&ctx.space),"created":ctx.created,"recovered":ctx.recovered,"accountID":ctx.card.get("accountID").and_then(Value::as_str).unwrap_or("")});
            let sandbox = if ctx.mode == "workspaceWrite" {
                json!({"type":"workspaceWrite","writableRoots":[ctx.space["rootPath"]],"networkAccess":false,"excludeTmpdirEnvVar":false,"excludeSlashTmp":false})
            } else {
                json!({"type":"readOnly","networkAccess":false})
            };
            let reviewer = if ctx.auto_approve {
                "auto_review"
            } else {
                "user"
            };
            let mut params = json!({"threadId":ctx.thread_id,"input":[{"type":"text","text":ctx.card.get("prompt").and_then(Value::as_str).unwrap_or(""),"text_elements":[]}],"cwd":ctx.space["rootPath"],"approvalPolicy":"on-request","approvalsReviewer":reviewer,"sandboxPolicy":sandbox});
            if let Some(model) = ctx
                .card
                .get("model")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
            {
                params["model"] = json!(model);
            }
            if let Some(effort) = ctx
                .card
                .get("reasoningEffort")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
            {
                params["effort"] = json!(effort);
            }
            (association, params)
        } else {
            return;
        };
        emit(app, "conversationAssociated", association.take());
        let _ = send_context(
            context,
            &json!({"id":4,"method":"turn/start","params":turn}),
        );
        return;
    }
    if id == Some(4) {
        if let Ok(mut ctx) = context.lock() {
            ctx.turn_id = string(message, "/result/turn/id");
        }
        return;
    }
    if method == "turn/started" {
        if let Ok(mut ctx) = context.lock() {
            ctx.turn_id = string(message, "/params/turn/id");
        }
    } else if method == "item/completed" && string(message, "/params/item/type") == "agentMessage" {
        let text = string(message, "/params/item/text");
        if !text.is_empty() {
            if let Ok(mut ctx) = context.lock() {
                ctx.latest = text.clone();
            }
            let id = context
                .lock()
                .map(|ctx| ctx.card_id.clone())
                .unwrap_or_default();
            emit(app, "runnerEvent", json!({"cardID":id,"message":text}));
        }
    } else if method == "turn/completed" {
        let success = string(message, "/params/turn/status") == "completed";
        let error = if success {
            None
        } else {
            Some(string(message, "/params/turn/error/message"))
        };
        finish(manager, app, context, success, error);
    } else if message.get("id").is_some()
        && (method.ends_with("requestApproval") || method == "item/tool/requestUserInput")
    {
        let key = message["id"].to_string();
        if let Ok(mut ctx) = context.lock() {
            ctx.pending.insert(key.clone(), message.clone());
            let kind = if method == "item/tool/requestUserInput" {
                "input"
            } else if method.contains("fileChange") {
                "file"
            } else {
                "command"
            };
            emit(
                app,
                "approvalRequested",
                json!({"cardID":ctx.card_id,"requestID":message["id"],"kind":kind,"params":message["params"],"agentEngine":"codex","mode":ctx.mode,"threadID":ctx.thread_id}),
            );
        }
    }
}

fn handle_claude(
    manager: &AgentManager,
    app: &AppHandle,
    context: &Arc<Mutex<RunContext>>,
    message: &Value,
) {
    let kind = message.get("type").and_then(Value::as_str).unwrap_or("");
    if kind == "control_response" && string(message, "/response/request_id") == "ctrl-init" {
        if string(message, "/response/subtype") == "error" {
            finish(
                manager,
                app,
                context,
                false,
                Some(string(message, "/response/error")),
            );
            return;
        }
        if let Ok(mut ctx) = context.lock() {
            ctx.initialized = true;
            let request = json!({"type":"user","message":{"role":"user","content":ctx.card.get("prompt").and_then(Value::as_str).unwrap_or("")},"parent_tool_use_id":Value::Null,"session_id":""});
            let _ = send_line(&ctx.stdin, &request);
        }
    }
    let session = string(message, "/session_id");
    if !session.is_empty() {
        if let Ok(mut ctx) = context.lock() {
            if ctx.thread_id != session {
                ctx.thread_id = session.clone();
                emit(
                    app,
                    "conversationAssociated",
                    json!({"cardID":ctx.card_id,"threadID":session,"engine":"claude-code","name":ctx.card.get("title").and_then(Value::as_str).unwrap_or("Session Claude"),"cwd":display_root(&ctx.space),"projectName":ctx.space.get("name").and_then(Value::as_str).unwrap_or(""),"accountID":ctx.card.get("accountID").and_then(Value::as_str).unwrap_or("")}),
                );
            }
        }
    }
    if kind == "assistant" {
        if let Some(content) = message
            .pointer("/message/content")
            .and_then(Value::as_array)
        {
            for block in content {
                if block.get("type").and_then(Value::as_str) == Some("text") {
                    let text = block
                        .get("text")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    if !text.is_empty() {
                        if let Ok(mut ctx) = context.lock() {
                            ctx.latest = text.clone();
                            emit(
                                app,
                                "runnerEvent",
                                json!({"cardID":ctx.card_id,"message":text}),
                            );
                        }
                    }
                }
            }
        }
    } else if kind == "result" {
        let success = !message
            .get("is_error")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            && string(message, "/subtype") == "success";
        if let Some(text) = message
            .get("result")
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
        {
            if let Ok(mut ctx) = context.lock() {
                ctx.latest = text.to_string();
            }
        }
        let error = if success {
            None
        } else {
            Some(claude_result_error(message))
        };
        finish(manager, app, context, success, error);
    } else if kind == "control_request" {
        let request_id = string(message, "/request_id");
        if request_id.is_empty() {
            return;
        }
        if string(message, "/request/subtype") != "can_use_tool" {
            let _ = send_context(
                context,
                &json!({"type":"control_response","response":{"subtype":"error","request_id":request_id,"error":"Cette demande n’est pas prise en charge par CTRL KANB."}}),
            );
            return;
        }
        if let Ok(mut ctx) = context.lock() {
            let request = message["request"].clone();
            let tool = string(message, "/request/tool_name");
            let input = request.get("input").cloned().unwrap_or_else(|| json!({}));
            if ctx.mode == "readOnly"
                && (!["Read", "Glob", "Grep"].contains(&tool.as_str())
                    || !claude_read_input_stays_in_project(
                        &tool,
                        &input,
                        Path::new(ctx.space["rootPath"].as_str().unwrap_or("")),
                    ))
            {
                let stdin = ctx.stdin.clone();
                let card_id = ctx.card_id.clone();
                drop(ctx);
                let _ = send_line(
                    &stdin,
                    &json!({"type":"control_response","response":{"subtype":"success","request_id":request_id,"response":{"behavior":"deny","message":"Lecture refusée : le chemin demandé sort du dossier du projet."}}}),
                );
                emit(
                    app,
                    "runnerEvent",
                    json!({"cardID":card_id,"message":"Lecture refusée : le chemin demandé sort du dossier du projet."}),
                );
                return;
            }
            ctx.pending.insert(request_id.clone(), request.clone());
            let question = tool == "AskUserQuestion";
            let kind = if question {
                "input"
            } else if ["Edit", "Write", "NotebookEdit"].contains(&tool.as_str()) {
                "file"
            } else {
                "command"
            };
            emit(
                app,
                "approvalRequested",
                json!({"cardID":ctx.card_id,"requestID":request_id,"kind":kind,"params":{"cwd":display_root(&ctx.space),"tool":tool,"input":input,"questions":request["input"]["questions"]},"agentEngine":"claude-code","mode":ctx.mode,"threadID":ctx.thread_id}),
            );
        }
    } else if kind == "control_cancel_request" {
        let id = string(message, "/request_id");
        if let Ok(mut ctx) = context.lock() {
            ctx.pending.remove(&id);
            emit(
                app,
                "requestResolved",
                json!({"cardID":ctx.card_id,"requestID":id}),
            );
        }
    }
}

fn claude_result_error(message: &Value) -> String {
    message
        .get("errors")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|value| !value.is_empty())
        .or_else(|| {
            message
                .get("result")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "Claude Code n’a pas terminé cette exécution.".into())
}

fn handle_message(
    manager: &AgentManager,
    app: &AppHandle,
    context: &Arc<Mutex<RunContext>>,
    message: &Value,
) {
    let selected = context
        .lock()
        .map(|ctx| ctx.engine.clone())
        .unwrap_or_default();
    if selected == "claude-code" {
        handle_claude(manager, app, context, message)
    } else {
        handle_codex(manager, app, context, message)
    }
}

fn finish(
    manager: &AgentManager,
    app: &AppHandle,
    context: &Arc<Mutex<RunContext>>,
    success: bool,
    error: Option<String>,
) {
    let (card_id, thread_id, summary, card) = if let Ok(mut ctx) = context.lock() {
        if ctx.finished {
            return;
        }
        ctx.finished = true;
        (
            ctx.card_id.clone(),
            ctx.thread_id.clone(),
            ctx.latest.clone(),
            ctx.card.clone(),
        )
    } else {
        return;
    };
    let pid = if let Ok(mut inner) = manager.inner.lock() {
        let pid = inner.runs.remove(&card_id).map(|run| run.pid);
        inner.starting.remove(&card_id);
        pid
    } else {
        None
    };
    if let Some(pid) = pid {
        // Codex App Server reste sinon en attente sur stdin après la fin du tour.
        // Fermer tout l'arbre évite les auteurs fantômes et libère la conversation.
        kill_process(pid);
    }
    let mut result = json!({"cardID":card_id,"success":success,"exitCode":if success{0}else{1},"threadID":thread_id,"summary":summary});
    if let Some(error) = error.filter(|v| !v.is_empty()) {
        result["error"] = json!(error);
    }
    emit(app, "runnerFinished", result);
    let utility = card
        .get("utilityChat")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let category = if utility {
        "chatReply"
    } else if success {
        "taskComplete"
    } else if card.get("launchMode").and_then(Value::as_str) == Some("scheduled") {
        "scheduleIssue"
    } else {
        "taskFailed"
    };
    let title = if utility {
        if success {
            "Réponse reçue"
        } else {
            "Échec du chat IA"
        }
    } else if success {
        "Tâche terminée"
    } else {
        "Échec d’une tâche IA"
    };
    let body = card
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or(if success {
            "Le résultat est prêt à être relu."
        } else {
            "Une intervention est nécessaire."
        });
    notifications::deliver(app, title, body, category);
    start_queued(manager, app);
}

fn fail_start(manager: &AgentManager, app: &AppHandle, payload: &Value, error: String) {
    let id = string(payload, "/card/id");
    if let Ok(mut inner) = manager.inner.lock() {
        inner.starting.remove(&id);
    }
    emit(
        app,
        "runnerFinished",
        json!({"cardID":id,"success":false,"exitCode":1,"error":error}),
    );
    start_queued(manager, app);
}

fn start_queued(manager: &AgentManager, app: &AppHandle) {
    loop {
        let next = {
            let mut inner = match manager.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return,
            };
            let index = inner
                .queue
                .iter()
                .position(|payload| can_start(&inner, payload));
            let Some(index) = index else {
                emit(app, "queueUpdated", queue_message(&inner).object);
                return;
            };
            let payload = inner.queue.remove(index).expect("queue index");
            let id = string(&payload, "/card/id");
            inner
                .starting
                .insert(id, (engine(&payload), conversation(&payload)));
            payload
        };
        if let Err(error) = launch(manager, next.clone(), app) {
            fail_start(manager, app, &next, error);
            return;
        }
    }
}

fn start(
    payload: &Value,
    app: &AppHandle,
    manager: &AgentManager,
) -> Result<Vec<NativeMessage>, String> {
    let mut request = payload.clone();
    let root = request_root(app, &request)?;
    request["space"]["displayRootPath"] = json!(string(&request, "/space/rootPath"));
    request["space"]["rootPath"] = json!(root);
    let start = reserve_or_queue(manager, request.clone())?;
    if start {
        if let Err(error) = launch(manager, request.clone(), app) {
            fail_start(manager, app, &request, error);
        }
    }
    let inner = manager
        .inner
        .lock()
        .map_err(|_| "La file d’exécution est indisponible.")?;
    Ok(vec![queue_message(&inner)])
}

fn stop(
    payload: &Value,
    app: &AppHandle,
    manager: &AgentManager,
) -> Result<Vec<NativeMessage>, String> {
    let id = string(payload, "/cardID");
    let removed = {
        let mut inner = manager
            .inner
            .lock()
            .map_err(|_| "La file d’exécution est indisponible.")?;
        if let Some(index) = inner
            .queue
            .iter()
            .position(|item| string(item, "/card/id") == id)
        {
            inner.queue.remove(index);
            None
        } else {
            inner.runs.remove(&id)
        }
    };
    if let Some(run) = removed {
        if let Ok(mut ctx) = run.context.lock() {
            ctx.finished = true;
        }
        kill_process(run.pid);
        emit(app, "runnerCanceled", json!({"cardID":id}));
        start_queued(manager, app);
    } else {
        emit(app, "runnerCanceled", json!({"cardID":id}));
    }
    let inner = manager
        .inner
        .lock()
        .map_err(|_| "La file d’exécution est indisponible.")?;
    Ok(vec![queue_message(&inner)])
}

fn kill_process(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill.exe");
        command.args(["/PID", &pid.to_string(), "/T", "/F"]);
        hidden(&mut command);
        let _ = command.status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }
}

fn respond(
    payload: &Value,
    app: &AppHandle,
    manager: &AgentManager,
) -> Result<Vec<NativeMessage>, String> {
    let id = string(payload, "/cardID");
    let run = {
        let inner = manager
            .inner
            .lock()
            .map_err(|_| "La file d’exécution est indisponible.")?;
        inner.runs.get(&id).map(|run| run.context.clone())
    };
    let Some(context) = run else {
        return Ok(vec![message(
            "requestUnresolved",
            json!({"cardID":id,"requestID":payload["requestID"]}),
        )]);
    };
    let key = payload["requestID"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| payload["requestID"].to_string());
    let (mut request, selected, stdin) = if let Ok(mut ctx) = context.lock() {
        let Some(request) = ctx.pending.remove(&key) else {
            return Ok(vec![message(
                "requestUnresolved",
                json!({"cardID":id,"requestID":payload["requestID"]}),
            )]);
        };
        (request, ctx.engine.clone(), ctx.stdin.clone())
    } else {
        return Err("L’agent est indisponible.".into());
    };
    if selected == "claude-code" {
        let result = &payload["result"];
        let question = request.get("tool_name").and_then(Value::as_str) == Some("AskUserQuestion");
        let allow = matches!(
            result.get("decision").and_then(Value::as_str),
            Some("accept" | "acceptForSession")
        ) || (question
            && result
                .get("answers")
                .and_then(Value::as_object)
                .is_some_and(|v| !v.is_empty()));
        let mut response = json!({"behavior":if allow{"allow"}else{"deny"}});
        if allow {
            let mut input = request
                .get_mut("input")
                .cloned()
                .unwrap_or_else(|| json!({}));
            if question {
                let mut answers = serde_json::Map::new();
                if let Some(values) = result.get("answers").and_then(Value::as_object) {
                    for (key, value) in values {
                        answers.insert(
                            key.clone(),
                            json!(
                                value
                                    .get("answers")
                                    .and_then(Value::as_array)
                                    .map(|parts| parts
                                        .iter()
                                        .filter_map(Value::as_str)
                                        .collect::<Vec<_>>()
                                        .join(", "))
                                    .unwrap_or_default()
                            ),
                        );
                    }
                }
                input["answers"] = Value::Object(answers);
            }
            response["updatedInput"] = input;
        } else {
            response["message"] = json!("Action refusée dans CTRL KANB.");
        }
        send_line(
            &stdin,
            &json!({"type":"control_response","response":{"subtype":"success","request_id":string(payload,"/requestID"),"response":response}}),
        )?;
    } else {
        send_line(
            &stdin,
            &json!({"id":payload["requestID"],"result":payload["result"]}),
        )?;
    }
    emit(
        app,
        "requestResolved",
        json!({"cardID":id,"requestID":payload["requestID"]}),
    );
    Ok(Vec::new())
}

fn probe(payload: &Value, app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    let selected = string(payload, "/engine");
    let engine_name = if selected.starts_with("claude") {
        "claude-code"
    } else {
        "codex"
    };
    let path = executable(engine_name).ok_or_else(|| "Commande introuvable.".to_string())?;
    let home = string(payload, "/home");
    let account = string(payload, "/account");
    let app = app.clone();
    let engine_label = selected.clone();
    thread::spawn(move || {
        let mut command = Command::new(path);
        if engine_name == "claude-code" {
            command.args([
                "--print",
                "Reponds uniquement par le mot pong.",
                "--output-format",
                "json",
                "--disable-slash-commands",
                "--strict-mcp-config",
                "--tools",
                "",
            ]);
        } else {
            command.args([
                "exec",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "--color",
                "never",
                "Reponds uniquement par le mot pong.",
            ]);
        }
        command.stdout(Stdio::piped()).stderr(Stdio::piped());
        let _ = apply_account(&mut command, engine_name, &home);
        hidden(&mut command);
        let result = command.output();
        let (state, detail) = match result {
            Ok(output) if engine_name == "claude-code" => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let parsed = serde_json::from_str::<Value>(stdout.trim()).ok();
                let answer = parsed
                    .as_ref()
                    .and_then(|value| value.get("result"))
                    .and_then(Value::as_str)
                    .unwrap_or_else(|| stdout.trim());
                let explicit_error = parsed
                    .as_ref()
                    .and_then(|value| value.get("is_error"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                if output.status.success()
                    && !explicit_error
                    && answer.trim().eq_ignore_ascii_case("pong")
                {
                    ("ready", "pong".to_string())
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let raw = if answer.trim().is_empty() {
                        stderr.trim()
                    } else {
                        answer.trim()
                    };
                    ("blocked", compact_probe_detail(raw))
                }
            }
            Ok(output) if output.status.success() => {
                let answer = String::from_utf8_lossy(&output.stdout);
                if answer.trim().eq_ignore_ascii_case("pong") {
                    ("ready", "pong".to_string())
                } else {
                    ("blocked", compact_probe_detail(answer.trim()))
                }
            }
            Ok(output) => (
                "blocked",
                compact_probe_detail(String::from_utf8_lossy(&output.stderr).trim()),
            ),
            Err(error) => ("blocked", error.to_string()),
        };
        emit(
            &app,
            "agentProbeResult",
            json!({"engine":engine_label,"account":account,"at":Utc::now().to_rfc3339(),"state":state,"detail":if detail.is_empty(){if state=="ready"{"pong"}else{"Le moteur n’a pas répondu."}}else{&detail}}),
        );
    });
    Ok(Vec::new())
}

fn compact_probe_detail(raw: &str) -> String {
    let detail = raw.trim();
    if detail.is_empty() {
        return "Le moteur n’a pas répondu.".into();
    }
    if let Some(line) = detail
        .lines()
        .find(|line| line.to_lowercase().contains("usage limit"))
    {
        return line.trim().chars().take(500).collect();
    }
    detail.chars().take(500).collect()
}

fn login(payload: &Value) -> Result<Vec<NativeMessage>, String> {
    let selected = string(payload, "/engine");
    let engine_name = if selected.starts_with("claude") {
        "claude-code"
    } else {
        "codex"
    };
    let path = executable(engine_name).ok_or_else(|| "Commande introuvable.".to_string())?;
    let mut command = Command::new(path);
    if engine_name == "claude-code" {
        command.args(["auth", "login"]);
    } else {
        command.arg("login");
    }
    apply_account(&mut command, engine_name, &string(payload, "/home"))?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x00000010);
    }
    command.spawn().map_err(|error| error.to_string())?;
    Ok(Vec::new())
}

pub fn restored(manager: &AgentManager) -> Value {
    if let Ok(inner) = manager.inner.lock() {
        json!({"running":inner.runs.keys().cloned().collect::<Vec<_>>(),"queued":inner.queue.iter().map(|item|string(item,"/card/id")).collect::<Vec<_>>()})
    } else {
        json!({"running":[],"queued":[]})
    }
}

pub fn handle(
    action: &str,
    payload: &Value,
    app: &AppHandle,
    manager: &AgentManager,
) -> Option<Result<Vec<NativeMessage>, String>> {
    Some(match action {
        "run" => start(payload, app, manager),
        "stop" => stop(payload, app, manager),
        "respondRequest" => respond(payload, app, manager),
        "setConcurrency" => {
            if let Ok(mut inner) = manager.inner.lock() {
                inner.max_codex = payload
                    .get("codex")
                    .and_then(Value::as_u64)
                    .unwrap_or(2)
                    .clamp(1, 8) as usize;
                inner.max_claude = payload
                    .get("claude")
                    .and_then(Value::as_u64)
                    .unwrap_or(1)
                    .clamp(1, 8) as usize;
            }
            start_queued(manager, app);
            Ok(Vec::new())
        }
        "agentProbe" => probe(payload, app),
        "agentLogin" => login(payload),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(id: &str, conversation: &str) -> Value {
        json!({
            "card":{"id":id,"agentEngine":"claude-code","conversationID":conversation},
            "space":{"id":"space","rootPath":"C:\\workspace"}
        })
    }

    #[test]
    fn a_conversation_stays_sequential_while_other_sessions_can_start() {
        let mut inner = Inner {
            runs: HashMap::new(),
            starting: HashMap::new(),
            queue: VecDeque::new(),
            max_codex: 2,
            max_claude: 2,
        };
        inner.starting.insert(
            "first".into(),
            ("claude-code".into(), Some("claude-code:session-a".into())),
        );
        assert!(!can_start(&inner, &payload("second", "session-a")));
        assert!(can_start(&inner, &payload("third", "session-b")));
    }

    #[test]
    fn claude_read_only_rejects_paths_outside_the_project() {
        let root = env::temp_dir().join(format!("ctrl-kanb-agent-test-{}", Uuid::new_v4()));
        let outside = env::temp_dir().join(format!("ctrl-kanb-outside-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("inside.txt"), "ok").unwrap();
        fs::write(&outside, "no").unwrap();
        assert!(claude_read_input_stays_in_project(
            "Read",
            &json!({"file_path":root.join("inside.txt")}),
            &root,
        ));
        assert!(!claude_read_input_stays_in_project(
            "Read",
            &json!({"file_path":outside}),
            &root,
        ));
        assert!(!claude_read_input_stays_in_project(
            "Glob",
            &json!({"pattern":"../outside/**"}),
            &root,
        ));
        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn claude_result_error_keeps_the_authentication_detail() {
        let message = json!({
            "type":"result",
            "subtype":"success",
            "is_error":true,
            "result":"Not logged in · Please run /login"
        });
        assert_eq!(
            claude_result_error(&message),
            "Not logged in · Please run /login"
        );
    }

    #[test]
    fn claude_default_model_does_not_force_an_unavailable_alias() {
        assert_eq!(claude_model("default"), None);
        assert_eq!(claude_model(""), None);
        assert_eq!(claude_model("gpt-5.6-sol"), None);
        assert_eq!(claude_model("sonnet"), Some("sonnet"));
        assert_eq!(claude_model("claude-sonnet-4-6"), Some("claude-sonnet-4-6"));
    }
}
