#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import tempfile


project = pathlib.Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix="ctrl-kanb-security-test-") as temporary:
    root = pathlib.Path(temporary)
    data = root / "data"
    victim = root / "victim"
    data.mkdir(mode=0o700)
    victim.mkdir(mode=0o755)
    board = data / "board.json"
    board.write_text(json.dumps({"spaces": [], "cards": [], "settings": {"backgroundSchedulerEnabled": False}}), encoding="utf-8")
    (data / "local.txt").write_text("local\n", encoding="utf-8")
    outside = victim / "outside.txt"
    outside.write_text("outside\n", encoding="utf-8")
    (data / "external-directory").symlink_to(victim, target_is_directory=True)
    (data / "external-file").symlink_to(outside)
    (data / "events.jsonl").symlink_to(outside)

    app_probe = root / "security-probe"
    compile_environment = {**os.environ, "CLANG_MODULE_CACHE_PATH": str(root / "clang-cache")}
    subprocess.run([
        "clang", "-fobjc-arc", "-fmodules", "-mmacosx-version-min=14.0",
        "-framework", "Cocoa", "-framework", "WebKit", "-framework", "UserNotifications",
        "-framework", "LocalAuthentication", "-framework", "Security", "-framework", "UniformTypeIdentifiers",
        str(project / "Tests" / "SecurityBoundaryTests.m"),
        str(project / "Sources" / "App" / "AppServerClient.m"),
        "-o", str(app_probe),
    ], env=compile_environment, check=True)
    environment = {
        **os.environ,
        "CTRL_KANB_DATA_FILE": str(board),
        "TEST_SECURITY_ROOT": str(root),
    }
    subprocess.run([str(app_probe)], env=environment, check=True, timeout=20)

    linked_victim = root / "linked-victim"
    linked_victim.mkdir(mode=0o755)
    linked_marker = linked_victim / "marker.txt"
    linked_marker.write_text("do not touch\n", encoding="utf-8")
    linked_marker.chmod(0o644)
    linked_data = root / "linked-data"
    linked_data.symlink_to(linked_victim, target_is_directory=True)
    subprocess.run([str(app_probe)], env={
        **os.environ,
        "CTRL_KANB_DATA_FILE": str(linked_data / "board.json"),
        "TEST_SECURITY_ROOT": str(root),
        "TEST_PARENT_LINK": "1",
        "TEST_VICTIM_FILE": str(linked_marker),
    }, check=True, timeout=20)

    helper = root / "ctrl-kanb-wake"
    subprocess.run([
        "clang", "-fobjc-arc", "-fmodules", "-mmacosx-version-min=14.0",
        "-framework", "Cocoa", str(project / "Sources" / "Helper" / "main.m"),
        "-o", str(helper),
    ], env=compile_environment, check=True)
    helper_data = root / "helper-data" / "board.json"
    helper_data.parent.mkdir(mode=0o755)
    helper_data.write_text(json.dumps({"settings": {"backgroundSchedulerEnabled": False}}), encoding="utf-8")
    subprocess.run([str(helper)], env={**os.environ, "CTRL_KANB_DATA_FILE": str(helper_data)}, check=True, timeout=10)
    status_file = helper_data.parent / "scheduler-status.json"
    assert helper_data.parent.stat().st_mode & 0o777 == 0o700
    assert status_file.stat().st_mode & 0o777 == 0o600
    print("PASS permissions privées du helper de planification")

    helper_victim = root / "helper-victim"
    helper_victim.mkdir(mode=0o755)
    helper_board = helper_victim / "board.json"
    helper_board.write_text(json.dumps({"settings": {"backgroundSchedulerEnabled": False}}), encoding="utf-8")
    helper_link = root / "helper-link"
    helper_link.symlink_to(helper_victim, target_is_directory=True)
    subprocess.run([str(helper)], env={**os.environ, "CTRL_KANB_DATA_FILE": str(helper_link / "board.json")}, check=True, timeout=10)
    assert not (helper_victim / "scheduler-status.json").exists()
    assert helper_victim.stat().st_mode & 0o777 == 0o755
    print("PASS helper refuse un dossier de données symbolique")

    helper_status_victim = root / "helper-status-victim"
    helper_status_victim.mkdir(mode=0o755)
    status_target = helper_status_victim / "target.txt"
    status_target.write_text("unchanged\n", encoding="utf-8")
    status_target.chmod(0o644)
    guarded_data = root / "helper-guarded" / "board.json"
    guarded_data.parent.mkdir(mode=0o700)
    guarded_data.write_text(json.dumps({"settings": {"backgroundSchedulerEnabled": False}}), encoding="utf-8")
    (guarded_data.parent / "scheduler-status.json").symlink_to(status_target)
    subprocess.run([str(helper)], env={**os.environ, "CTRL_KANB_DATA_FILE": str(guarded_data)}, check=True, timeout=10)
    assert status_target.read_text(encoding="utf-8") == "unchanged\n"
    assert status_target.stat().st_mode & 0o777 == 0o644
    print("PASS helper ne suit pas le lien du fichier de statut")
