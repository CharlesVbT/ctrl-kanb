use crate::{NativeMessage, message, platform};
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{Read, Write},
    process::Command,
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter};

struct Session {
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    // ConPTY owns handles that must remain alive for the whole terminal session.
    _master: Box<dyn MasterPty + Send>,
}

#[derive(Clone, Default)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

fn value(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn emit(app: &AppHandle, function: &str, object: Value) {
    let _ = app.emit("ctrl-kanb-native", message(function, object));
}

fn shell() -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        let mut command = CommandBuilder::new("powershell.exe");
        // The app renders its own prompt and submits complete command lines.
        // Script input avoids PowerShell's cursor-position handshake, which a
        // line-oriented embedded terminal cannot answer like a full emulator.
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-NoExit",
            "-Command",
            "-",
        ]);
        command.env("TERM", "xterm-256color");
        command
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut command = CommandBuilder::new("/bin/zsh");
        command.args(["-f"]);
        command.env("TERM", "xterm-256color");
        command
    }
}

fn start(
    payload: &Value,
    app: &AppHandle,
    manager: &TerminalManager,
) -> Result<Vec<NativeMessage>, String> {
    let id = value(payload, "terminalID");
    if id.is_empty() {
        return Err("Identifiant du terminal absent.".into());
    }
    let root = platform::verified_root(app, payload)?;
    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "Le terminal est indisponible.")?;
    if sessions.contains_key(&id) {
        return Ok(Vec::new());
    }

    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;
    let mut command = shell();
    command.cwd(&root);
    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    let killer = child.clone_killer();
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    sessions.insert(
        id.clone(),
        Session {
            writer,
            killer,
            _master: pair.master,
        },
    );
    drop(sessions);

    let reader_app = app.clone();
    let reader_id = id.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(length) => emit(
                    &reader_app,
                    "terminalOutput",
                    json!({"terminalID":reader_id,"text":String::from_utf8_lossy(&buffer[..length])}),
                ),
                Err(_) => break,
            }
        }
    });
    let wait_app = app.clone();
    let wait_id = id.clone();
    let wait_sessions = manager.sessions.clone();
    thread::spawn(move || {
        let (exit_code, status_message) = match child.wait() {
            Ok(status) => (status.exit_code() as i64, String::new()),
            Err(error) => (-1, error.to_string()),
        };
        emit(
            &wait_app,
            "terminalStopped",
            json!({"terminalID":wait_id,"exitCode":exit_code,"message":status_message}),
        );
        if let Ok(mut sessions) = wait_sessions.lock() {
            sessions.remove(&wait_id);
        }
    });
    Ok(vec![message(
        "terminalStarted",
        json!({"terminalID":id,"path":root}),
    )])
}

fn write(
    payload: &Value,
    manager: &TerminalManager,
    interrupt: bool,
) -> Result<Vec<NativeMessage>, String> {
    let id = value(payload, "terminalID");
    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "Le terminal est indisponible.")?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| "La session du terminal n’est plus active.".to_string())?;
    if interrupt {
        session
            .writer
            .write_all(&[3])
            .map_err(|error| error.to_string())?;
    } else {
        let command = value(payload, "command");
        if command.is_empty() || command.len() > 20_000 {
            return Err("La commande du terminal est vide ou trop longue.".into());
        }
        session
            .writer
            .write_all(format!("{command}\r\n").as_bytes())
            .map_err(|error| error.to_string())?;
    }
    session.writer.flush().map_err(|error| error.to_string())?;
    Ok(Vec::new())
}

fn stop(payload: &Value, manager: &TerminalManager) -> Result<Vec<NativeMessage>, String> {
    let id = value(payload, "terminalID");
    let Some(mut session) = manager
        .sessions
        .lock()
        .map_err(|_| "Le terminal est indisponible.")?
        .remove(&id)
    else {
        return Ok(Vec::new());
    };
    session.killer.kill().map_err(|error| error.to_string())?;
    Ok(Vec::new())
}

fn open_system(payload: &Value, app: &AppHandle) -> Result<Vec<NativeMessage>, String> {
    let root = platform::verified_root(app, payload)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        Command::new("powershell.exe")
            .args(["-NoLogo"])
            .current_dir(root)
            .creation_flags(0x00000010)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("open")
            .args(["-a", "Terminal"])
            .current_dir(root)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(Vec::new())
}

pub fn handle(
    action: &str,
    payload: &Value,
    app: &AppHandle,
    manager: &TerminalManager,
) -> Option<Result<Vec<NativeMessage>, String>> {
    Some(match action {
        "startTerminal" => start(payload, app, manager),
        "terminalCommand" => write(payload, manager, false),
        "terminalInterrupt" => write(payload, manager, true),
        "stopTerminal" => stop(payload, manager),
        "openSystemTerminal" => open_system(payload, app),
        _ => return None,
    })
}
