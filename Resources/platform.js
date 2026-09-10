(() => {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) return;

  const pending = [];
  const dispatch = message => {
    const name = typeof message?.function === "string" ? message.function : "";
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) return;
    const handler = window.CodexBoard?.[name];
    if (typeof handler === "function") handler(message.object ?? {});
    else pending.push(message);
  };
  const flush = () => {
    for (let index = 0; index < pending.length;) {
      const message = pending[index];
      const handler = window.CodexBoard?.[message.function];
      if (typeof handler !== "function") { index += 1; continue; }
      pending.splice(index, 1);
      handler(message.object ?? {});
    }
  };
  const failure = error => dispatch({
    function: "nativeError",
    object: { message: String(error?.message || error || "Le pont Windows n’a pas répondu.") }
  });

  if (tauri.event?.listen) {
    tauri.event.listen("ctrl-kanb-native", event => dispatch(event.payload)).catch(failure);
  }
  window.ctrlKanbNative = {
    postMessage(payload) {
      tauri.core.invoke("bridge_message", { payload })
        .then(messages => {
          if (Array.isArray(messages)) messages.forEach(dispatch);
          flush();
        })
        .catch(failure);
    }
  };
  window.addEventListener("DOMContentLoaded", flush, { once: true });
})();
