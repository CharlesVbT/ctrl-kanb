use crate::{NativeMessage, message, storage};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

pub fn deliver(app: &AppHandle, title: &str, body: &str, category: &str) {
    let Ok(board) = storage::load(app).map(|loaded| loaded.board) else {
        return;
    };
    if !board
        .pointer("/settings/systemNotificationsEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(true)
    {
        return;
    }
    if !board
        .pointer(&format!("/settings/notificationEvents/{category}"))
        .and_then(Value::as_bool)
        .unwrap_or(true)
    {
        return;
    }
    let background_only = board
        .pointer("/settings/notificationWhen")
        .and_then(Value::as_str)
        == Some("background");
    let focused = app
        .get_webview_window("main")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false);
    if background_only && focused {
        return;
    }
    let _ = app.notification().builder().title(title).body(body).show();
}

fn status() -> NativeMessage {
    message(
        "notificationAuthorizationStatus",
        json!({"status":"authorized"}),
    )
}

pub fn handle(action: &str, _payload: &Value) -> Option<Result<Vec<NativeMessage>, String>> {
    Some(match action {
        "notificationStatus" | "requestNotifications" => Ok(vec![status()]),
        "openNotificationSettings" => open::that("ms-settings:notifications")
            .map(|_| Vec::new())
            .map_err(|error| error.to_string()),
        _ => return None,
    })
}
