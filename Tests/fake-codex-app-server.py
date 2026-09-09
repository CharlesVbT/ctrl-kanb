#!/usr/bin/env python3
"""Deterministic Codex App Server used by CTRL KANB native bridge tests."""

import json
import os
import signal
import sys
import time
import unicodedata


def receive():
    line = sys.stdin.readline()
    if not line:
        raise AssertionError("CTRL KANB closed stdin before the scenario completed")
    return json.loads(line)


def send(message):
    print(json.dumps(message, ensure_ascii=False), flush=True)


cwd = os.environ["TEST_CWD"]
session = os.environ.get("TEST_SESSION")
active_writer = bool(os.environ.get("TEST_ACTIVE_WRITER"))
expected_prompt = os.environ.get("TEST_EXPECTED_PROMPT", "")
thread_id = session or "11111111-2222-4333-8444-555555555555"

initialize = receive()
assert initialize["id"] == 1 and initialize["method"] == "initialize", initialize
assert initialize["params"]["capabilities"]["experimentalApi"] is True, initialize
send({"id": 1, "result": {"userAgent": "fake-codex"}})

initialized = receive()
assert initialized["method"] == "initialized", initialized

if os.environ.get("TEST_SYNC"):
    # Le faux serveur attend toutes les lectures avant d'en rendre une seule.
    # Le test ne peut donc finir que si CTRL KANB envoie les requetes en
    # parallele, au lieu d'attendre chaque reponse avant la suivante.
    count = int(os.environ.get("TEST_SYNC_COUNT", "2"))
    reads = [receive() for _ in range(count)]
    assert all(message["method"] == "thread/read" for message in reads), reads
    assert all(message["params"].get("includeTurns") is True for message in reads), reads
    for message in reversed(reads):
        requested_id = message["params"]["threadId"]
        send(
            {
                "id": message["id"],
                "result": {
                    "thread": {
                        "id": requested_id,
                        "name": f"Conversation {requested_id}",
                        "cwd": cwd,
                        "status": {"type": "idle"},
                        "turns": [],
                    }
                },
            }
        )
    while True:
        time.sleep(0.2)

project_list = receive()
assert project_list["id"] == 20 and project_list["method"] == "project/list", project_list
send(
    {
        "id": 20,
        "result": {
            "data": [
                {
                    "id": "project-parent",
                    "name": "Projet parent",
                    "roots": [{"path": "/private/tmp"}],
                },
                {
                    "id": "project-exact",
                    "name": "Projet exact",
                    "roots": [{"path": cwd}],
                },
            ],
            "nextCursor": None,
        },
    }
)

open_thread = receive()
expected_method = "thread/resume" if session else "thread/start"
assert open_thread["id"] == 2 and open_thread["method"] == expected_method, open_thread
assert open_thread["params"]["cwd"] == cwd, open_thread
if session:
    assert open_thread["params"]["threadId"] == session, open_thread
else:
    assert open_thread["params"]["projectId"] == "project-exact", open_thread
    # Sans threadSource, le fil est rattache au projet mais reste hors de la
    # liste des conversations de l app Codex : elle n affiche que « user ».
    assert open_thread["params"].get("threadSource") == "user", open_thread

if active_writer:
    assert session and open_thread["method"] == "thread/resume", open_thread
    send({"id": 2, "error": {"code": -32000, "message": f"thread {session} already has an active writer"}})
    open_thread = receive()
    assert open_thread["id"] == 2 and open_thread["method"] == "thread/start", open_thread
    assert open_thread["params"]["cwd"] == cwd, open_thread
    assert open_thread["params"]["projectId"] == "project-exact", open_thread
    assert open_thread["params"].get("threadSource") == "user", open_thread
    thread_id = "99999999-2222-4333-8444-555555555555"

send(
    {
        "id": 2,
        "result": {
            "thread": {
                "id": thread_id,
                "name": "Tâche Codex test",
                "cwd": cwd,
                "projectId": "project-exact",
            }
        },
    }
)

resumed = bool(session) and not active_writer
metadata_seen = not resumed
while True:
    message = receive()
    if message.get("id") == 21:
        assert resumed, message
        assert message["method"] == "thread/metadata/update", message
        assert message["params"] == {
            "threadId": thread_id,
            "projectId": "project-exact",
        }, message
        metadata_seen = True
        send({"id": 21, "result": {}})
        continue
    if message.get("id") == 3:
        assert not resumed and message["method"] == "thread/name/set", message
        if active_writer:
            assert unicodedata.normalize("NFC", message["params"]["name"]) == unicodedata.normalize("NFC", expected_prompt), message
        send({"id": 3, "result": {}})
        continue
    if message.get("id") == 4:
        assert message["method"] == "turn/start", message
        assert message["params"]["threadId"] == thread_id, message
        assert message["params"]["model"] == os.environ.get("TEST_EXPECTED_MODEL", "gpt-5.6-luna"), message
        assert message["params"]["effort"] == os.environ.get("TEST_EXPECTED_EFFORT", "low"), message
        prompt = message["params"]["input"][0]["text"]
        assert unicodedata.normalize("NFC", expected_prompt) in unicodedata.normalize("NFC", prompt), (expected_prompt, prompt)
        assert metadata_seen, "resume must reattach the thread before starting the turn"
        send({"id": 4, "result": {"turn": {"id": "turn-test", "status": "inProgress"}}})
        if os.environ.get("TEST_IGNORE_INTERRUPT"):
            # Un agent qui n honore ni « turn/interrupt » ni SIGTERM. CTRL KANB
            # doit malgre tout rendre la main a l utilisateur.
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            while True:
                time.sleep(0.2)
        send(
            {
                "method": "item/completed",
                "params": {
                    "threadId": thread_id,
                    "turnId": "turn-test",
                    "item": {"type": "agentMessage", "text": "Projet et conversation vérifiés."},
                },
            }
        )
        send(
            {
                "method": "turn/completed",
                "params": {
                    "threadId": thread_id,
                    "turn": {"id": "turn-test", "status": "completed"},
                },
            }
        )
        break
