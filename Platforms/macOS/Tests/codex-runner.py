#!/usr/bin/env python3
import json
import os
import pathlib
import shutil
import subprocess
import time
import tempfile

def probe(command, environment, timeout=10):
    """Lance la sonde native et remonte son message si elle echoue."""
    run = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=timeout)
    if run.returncode != 0:
        raise SystemExit((run.stderr or run.stdout).strip() or f"sonde native : code {run.returncode}")
    return run

project = pathlib.Path(__file__).resolve().parents[1]
fake_server = project / "Tests" / "Fixtures" / "fake-codex-app-server.py"

with tempfile.TemporaryDirectory(prefix="ctrl-kanb-codex-test-") as temporary:
    temporary_path = pathlib.Path(temporary)
    fake_executable = temporary_path / "fake-codex-app-server.py"
    shutil.copy2(fake_server, fake_executable)
    fake_executable.chmod(0o755)
    workspace = temporary_path / "workspace exact"
    workspace.mkdir()
    (workspace / "README.md").write_text("outil natif\n", encoding="utf-8")
    board_file = temporary_path / "board.json"
    board_file.write_text(json.dumps({
        "version": 18,
        "spaces": [{"id": "test-space", "name": "Projet exact", "rootPath": str(workspace)}],
        "cards": [],
        "settings": {"autoSync": False, "utilityCustomPath": str(workspace)},
    }), encoding="utf-8")
    binary = temporary_path / "codex-probe"
    compile_environment = {**os.environ, "CLANG_MODULE_CACHE_PATH": str(temporary_path / "clang-cache")}
    subprocess.run(
        [
            "clang", "-fobjc-arc", "-fmodules", "-mmacosx-version-min=14.0",
            "-framework", "Cocoa", "-framework", "WebKit", "-framework", "UserNotifications", "-framework", "UniformTypeIdentifiers",
            str(project / "Tests" / "CodexRunnerTests.m"),
            str(project / "Sources" / "App" / "AppServerClient.m"),
            "-o", str(binary),
        ],
        env=compile_environment,
        check=True,
    )

    sync_environment = {
        **os.environ,
        "CTRL_KANB_CODEX_PATH": str(fake_executable),
        "CTRL_KANB_DATA_FILE": str(board_file),
        "TEST_CWD": str(workspace),
        "TEST_SYNC": "1",
        "TEST_SYNC_COUNT": "2",
    }
    sync_run = probe([str(binary)], sync_environment)
    sync_result = json.loads(sync_run.stdout)
    sync_events = sync_result["events"]
    started_events = [event["data"] for event in sync_events if event["event"] == "syncStarted"]
    progress_events = [event["data"] for event in sync_events if event["event"] == "syncProgress"]
    completed_events = [event["data"] for event in sync_events if event["event"] == "conversationsSynced"]
    assert sync_result["complete"], ("synchronisation parallele", sync_result)
    assert started_events == [{"total": 2}], ("demarrage synchronisation", sync_events)
    assert [event["completed"] for event in progress_events] == [1, 2], ("progression synchronisation", sync_events)
    assert completed_events and completed_events[-1]["total"] == 2, ("fin synchronisation", sync_events)
    assert completed_events[-1]["failed"] == 0, ("echec inattendu", sync_events)
    assert {thread["id"] for thread in completed_events[-1]["conversations"]} == {"sync-thread-1", "sync-thread-2"}, sync_events
    print("PASS conversations distinctes en parallele et meme conversation en file")
    print("PASS synchronisation parallele avec progression")

    tools_environment = {
        **os.environ,
        "CTRL_KANB_DATA_FILE": str(board_file),
        "TEST_CWD": str(workspace),
        "TEST_TOOLS": "1",
        "VIRTUAL_ENV": "/private/tmp/stack-env",
        "VIRTUAL_ENV_PROMPT": "(stack-env) ",
        "PS1": "(stack-env) prompt % ",
    }
    tools_run = probe([str(binary)], tools_environment)
    tools_result = json.loads(tools_run.stdout)
    assert tools_result["listed"], ("navigation de fichiers", tools_result)
    assert tools_result["customListed"], ("navigation du dossier libre", tools_result)
    assert tools_result["escapeRejected"], ("sortie du projet", tools_result)
    assert tools_result["fileResolved"], ("ajout d'un fichier du projet au chat", tools_result)
    assert tools_result["terminalStarted"] and tools_result["terminalOutput"] and tools_result["terminalPTY"] and tools_result["terminalInterrupted"] and tools_result["terminalStopped"], ("terminal natif", tools_result)
    assert "stack-env" not in "".join(event.get("data", {}).get("text", "") for event in tools_result["events"] if event.get("event") == "terminalOutput"), ("environnement terminal isole", tools_result)
    print("PASS terminal zsh démarré dans le projet et navigateur de fichiers confiné")

    cases = [
        ("new thread assigned to exact project", {}),
        (
            "existing thread reassigned to exact project",
            {"TEST_SESSION": "87654321-1234-4234-8234-123456789abc"},
        ),
        (
            "busy existing thread continues in a new conversation",
            {"TEST_SESSION": "87654321-1234-4234-8234-123456789abc", "TEST_ACTIVE_WRITER": "1", "TEST_UTILITY_CHAT": "1"},
        ),
    ]
    for name, extra in cases:
        prompt = "Instruction contextualisée CTRL KANB"
        environment = {
            **os.environ,
            "CTRL_KANB_CODEX_PATH": str(fake_executable),
            "CTRL_KANB_DATA_FILE": str(board_file),
            "TEST_CWD": str(workspace),
            "TEST_PROMPT": prompt,
            "TEST_EXPECTED_PROMPT": prompt,
            **extra,
        }
        run = probe([str(binary)], environment)
        result = json.loads(run.stdout)
        assert result["complete"], (name, result)
        assert result["result"]["success"] is True, (name, result)
        associations = [event["data"] for event in result["events"] if event["event"] == "conversationAssociated"]
        assert associations and associations[-1]["projectID"] == "project-exact", (name, result)
        assert associations[-1]["projectName"] == "Projet exact", (name, result)
        expected_created = "TEST_SESSION" not in extra or "TEST_ACTIVE_WRITER" in extra
        assert associations[-1]["created"] == expected_created, (name, associations[-1])
        assert bool(associations[-1].get("recovered")) == ("TEST_ACTIVE_WRITER" in extra), (name, associations[-1])
        print("PASS", name)

    # Un agent peut ignorer « turn/interrupt » puis SIGTERM. La suspension
    # demandee par l utilisateur doit aboutir quand meme, sinon la carte reste
    # figee sur « Suspension… » et le processus survit.
    stubborn = {
        **os.environ,
        "CTRL_KANB_CODEX_PATH": str(fake_executable),
        "CTRL_KANB_DATA_FILE": str(board_file),
        "TEST_CWD": str(workspace),
        "TEST_PROMPT": "Instruction contextualisée CTRL KANB",
        "TEST_EXPECTED_PROMPT": "Instruction contextualisée CTRL KANB",
        "TEST_IGNORE_INTERRUPT": "1",
        "TEST_STOP_AFTER_SECONDS": "1.5",
    }
    started = time.monotonic()
    run = probe([str(binary)], stubborn, timeout=40)
    elapsed = time.monotonic() - started
    result = json.loads(run.stdout)
    assert result["complete"], ("suspension d un agent recalcitrant", result)
    events = [event["event"] for event in result["events"]]
    assert "runnerCanceled" in events, ("la suspension n a pas rendu la main", events)
    assert elapsed < 20, ("la suspension a pris trop longtemps", elapsed)
    print(f"PASS suspension aboutit malgre un agent recalcitrant ({elapsed:.1f}s)")

print("7 Codex runner scenarios passed")
