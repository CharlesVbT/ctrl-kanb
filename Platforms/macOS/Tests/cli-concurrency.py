#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import tempfile


project = pathlib.Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix="ctrl-kanb-cli-test-") as temporary:
    temporary_path = pathlib.Path(temporary)
    binary = temporary_path / "ctrl-kanb"
    compile_environment = {
        **os.environ,
        "CLANG_MODULE_CACHE_PATH": str(temporary_path / "clang-cache"),
    }
    subprocess.run(
        [
            "clang", "-fobjc-arc", "-fmodules", "-mmacosx-version-min=14.0",
            "-framework", "Foundation",
            str(project / "Sources" / "CLI" / "main.m"),
            "-o", str(binary),
        ],
        env=compile_environment,
        check=True,
    )

    board_file = temporary_path / "data" / "board.json"
    board_file.parent.mkdir(mode=0o700)
    board_file.write_text(json.dumps({
        "version": 22,
        "spaces": [{
            "id": "test-space",
            "name": "Projet fictif",
            "rootPath": str(temporary_path / "workspace"),
        }],
        "cards": [],
        "settings": {"priorities": [{"id": "normal", "code": "N"}]},
    }), encoding="utf-8")
    environment = {**os.environ, "CTRL_KANB_DATA_FILE": str(board_file)}
    total = 12
    processes = [
        subprocess.Popen(
            [
                str(binary), "add-card", "--space", "Projet fictif",
                "--title", f"Tache {index}", "--prompt", f"Consigne {index}",
            ],
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for index in range(total)
    ]
    failures = []
    for process in processes:
        stdout, stderr = process.communicate(timeout=20)
        if process.returncode != 0:
            failures.append((process.returncode, stdout, stderr))
    assert not failures, failures

    board = json.loads(board_file.read_text(encoding="utf-8"))
    titles = {card["title"] for card in board["cards"]}
    expected = {f"Tache {index}" for index in range(total)}
    assert len(board["cards"]) == total, (len(board["cards"]), total)
    assert titles == expected, (titles, expected)
    assert board_file.stat().st_mode & 0o777 == 0o600
    print(f"PASS {total} ajouts CLI concurrents conserves sans perte")

    linked_victim = temporary_path / "linked-victim"
    linked_victim.mkdir(mode=0o755)
    linked_board = linked_victim / "board.json"
    linked_board.write_text(json.dumps({"version": 22, "spaces": [], "cards": [], "settings": {}}), encoding="utf-8")
    linked_data = temporary_path / "linked-data"
    linked_data.symlink_to(linked_victim, target_is_directory=True)
    refused = subprocess.run([str(binary), "spaces"], env={**os.environ, "CTRL_KANB_DATA_FILE": str(linked_data / "board.json")}, capture_output=True, text=True)
    assert refused.returncode != 0
    assert not (linked_victim / "board.json.lock").exists()
    assert linked_victim.stat().st_mode & 0o777 == 0o755
    print("PASS CLI refuse un dossier de donnees symbolique")

    guarded = temporary_path / "guarded" / "board.json"
    guarded.parent.mkdir(mode=0o700)
    guarded.write_text(json.dumps({
        "version": 22,
        "spaces": [{"id": "guarded-space", "name": "Garde", "rootPath": str(temporary_path)}],
        "cards": [],
        "settings": {},
    }), encoding="utf-8")
    previous_target = temporary_path / "previous-target.txt"
    previous_target.write_text("unchanged\n", encoding="utf-8")
    previous_target.chmod(0o644)
    (guarded.parent / "board.previous.json").symlink_to(previous_target)
    guarded_run = subprocess.run([str(binary), "add-card", "--space", "Garde", "--title", "Refusee", "--prompt", "Test"], env={**os.environ, "CTRL_KANB_DATA_FILE": str(guarded)}, capture_output=True, text=True)
    assert guarded_run.returncode != 0
    assert previous_target.read_text(encoding="utf-8") == "unchanged\n"
    assert previous_target.stat().st_mode & 0o777 == 0o644
    print("PASS CLI ne suit pas le lien de sauvegarde precedente")
