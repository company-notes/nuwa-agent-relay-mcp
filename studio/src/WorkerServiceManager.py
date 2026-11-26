"""Manage the current user's windowless Worker task, independently of MCP clients."""

import hashlib
import os
import subprocess
import time
from base64 import b64encode
from enum import IntEnum
from pathlib import Path


class WorkerTaskState(IntEnum):
    ABSENT = 0
    READY = 1
    RUNNING = 2
    DISABLED = 3


class WindowsWorkerService:
    EXECUTABLE = "nuwa-studio-worker.exe"
    SCRIPT = r"""
$ErrorActionPreference = 'Stop'
$taskName = $env:NUWA_TASK_NAME
$exe = $env:NUWA_TASK_EXE
$arguments = $env:NUWA_TASK_ARGS
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$tasks = @(Get-ScheduledTask -TaskPath '\' | Where-Object { $_.TaskName -eq $taskName })
if ($tasks.Count -gt 1) { throw 'Ambiguous Worker task.' }
$task = $tasks | Select-Object -First 1
if ($task) {
    $actions = @($task.Actions)
    $user = $task.Principal.UserId
    if ($user -like 'S-1-*') {
        $sid = $user
    } else {
        $sid = ([Security.Principal.NTAccount]$user).Translate([Security.Principal.SecurityIdentifier]).Value
    }
    if ($sid -ne $identity.User.Value -or $actions.Count -ne 1 -or
        $actions[0].Execute -ne $exe -or $actions[0].Arguments -cne $arguments) {
        throw 'An unrelated scheduled task occupies the Worker task name.'
    }
}
switch ($env:NUWA_TASK_OPERATION) {
    'install' {
        if ($task) { throw 'Remove the previous Worker task before installing.' }
        $action = New-ScheduledTaskAction -Execute $exe -Argument $arguments
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
        $principal = New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
        Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
    }
    'start' {
        if (-not $task) { throw 'Worker task is not installed.' }
        Start-ScheduledTask -TaskName $taskName -TaskPath '\'
    }
    'remove' {
        if ($task) {
            if ($task.State -in @('Running', 'Queued')) { throw 'Worker task is still active.' }
            Unregister-ScheduledTask -TaskName $taskName -TaskPath '\' -Confirm:$false
        }
    }
    'status' {
        if (-not $task) { [Console]::Write('0'); break }
        switch ([string]$task.State) {
            'Ready' { [Console]::Write('1') }
            'Running' { [Console]::Write('2') }
            'Queued' { [Console]::Write('2') }
            'Disabled' { [Console]::Write('3') }
            default { throw 'Unknown Worker task state.' }
        }
    }
    default { throw 'Unknown Worker task operation.' }
}
"""

    def __init__(self, config, executable: Path):
        self.config = config
        self.executable = executable.resolve()
        home = config.configDir().resolve()
        digest = hashlib.sha256(os.path.normcase(str(home)).encode("utf-8")).hexdigest()
        self.taskName = "NuwaStudioWorker-" + digest[:16]
        self.arguments = subprocess.list2cmdline(["serve", "--home", str(home)])

    def _run(self, operation: str) -> str:
        if os.name != "nt":
            raise RuntimeError("Worker task installation currently requires Windows.")

        powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        command = b64encode(self.SCRIPT.encode("utf-16-le")).decode("ascii")
        environment = {key: value for key, value in os.environ.items() if key.upper() != "PSMODULEPATH"}
        environment.update({
            "NUWA_TASK_NAME": self.taskName, "NUWA_TASK_EXE": str(self.executable),
            "NUWA_TASK_ARGS": self.arguments, "NUWA_TASK_OPERATION": operation,
        })
        result = subprocess.run(
            [str(powershell), "-NoProfile", "-NonInteractive", "-EncodedCommand", command],
            capture_output=True, timeout=40, env=environment, creationflags=subprocess.CREATE_NO_WINDOW,
        )

        if result.returncode:
            raise RuntimeError(f"Windows Worker task {operation} failed (exit {result.returncode}).")

        return result.stdout.decode("ascii").strip()

    def status(self) -> WorkerTaskState:
        return WorkerTaskState(int(self._run("status")))

    def stop(self) -> None:
        state = self.status()

        if state == WorkerTaskState.ABSENT:
            return

        marker = self.config.workerStopPath()
        marker.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        marker.touch()

        deadline = time.monotonic() + 100

        while self.status() == WorkerTaskState.RUNNING:
            if time.monotonic() >= deadline:
                marker.unlink(missing_ok=True)
                raise RuntimeError("Worker is finishing an active exchange. Retry Setup after it finishes.")

            time.sleep(0.5)

    def remove(self) -> None:
        self.stop()
        self._run("remove")

    def start(self) -> None:
        state = self.status()

        if state in (WorkerTaskState.ABSENT, WorkerTaskState.DISABLED):
            raise RuntimeError("Install or repair Nuwa Studio before starting its Worker service.")

        self.config.workerStopPath().unlink(missing_ok=True)

        if state == WorkerTaskState.READY and self.config.workerBridgePath().is_file():
            self._run("start")

    def install(self) -> None:
        if not self.executable.is_file():
            raise RuntimeError("Studio Worker executable is missing.")

        self.remove()
        self._run("install")
        self.start()
