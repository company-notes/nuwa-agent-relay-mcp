; Nuwa Relay MCP Windows Setup. Build with studio/Build.py.
Unicode True
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef APP_VERSION
  !error "APP_VERSION must be supplied"
!endif
!ifndef EXE_PATH
  !error "EXE_PATH must be supplied"
!endif
!ifndef WORKER_PATH
  !error "WORKER_PATH must be supplied"
!endif
!ifndef OUTPUT_PATH
  !error "OUTPUT_PATH must be supplied"
!endif

!define APP_NAME "Nuwa Relay MCP"
!define APP_PUBLISHER "Nuwa Information"
!define REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\nuwa-relay-mcp"
!define WORKER_PROTOCOL_KEY "Software\Classes\nuwa-studio-worker"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Nuwa Relay MCP Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard installs Nuwa Relay MCP and registers its MCP server and official Skill in supported AI clients. Existing registrations and Skills may be updated; mcp-install creates backups."
!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT "Restart or reload the MCP servers in your AI client. Sign in to Nuwa separately when needed."
!define MUI_FINISHPAGE_NOAUTOCLOSE

Name "${APP_NAME}"
OutFile "${OUTPUT_PATH}"
InstallDir "$LOCALAPPDATA\Programs\nuwa-relay-mcp"
InstallDirRegKey HKCU "${REG_KEY}" "InstallLocation"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ClearErrors
  SetOutPath "$INSTDIR"
  IfErrors installFailed

  copyExecutable:
  ClearErrors
  SetOverwrite try
  File /oname=nuwa-relay-mcp.exe "${EXE_PATH}"
  SetOverwrite on
  IfErrors 0 executableReady

  ; A locked executable must never be skipped or forcibly stopped.
  DetailPrint "Nuwa Relay MCP cannot be replaced. It may still be in use."
  IfSilent updateDeferred
  MessageBox MB_RETRYCANCEL|MB_ICONINFORMATION|MB_DEFBUTTON2 "Nuwa Relay MCP cannot be updated right now. It may still be in use.$\r$\n$\r$\nFinish your work and close the AI clients using Nuwa Relay MCP (such as Codex or Claude Code), then choose Retry.$\r$\n$\r$\nChoose Cancel to update later. Setup will not stop your running work. If the problem persists after closing the clients, check the installation folder permissions and available disk space." IDRETRY copyExecutable

  updateDeferred:
  DetailPrint "Installation deferred. Close the clients using Nuwa Relay MCP and retry later."
  SetErrorLevel 20
  Abort

  executableReady:
  DetailPrint "Checking the installed executable version..."
  nsExec::ExecToStack /TIMEOUT=120000 '"$INSTDIR\nuwa-relay-mcp.exe" --version'
  Pop $0
  Pop $1
  StrCmp $0 "0" 0 installFailed
  StrCmp $1 "${APP_VERSION}$\r$\n" versionOK
  StrCmp $1 "${APP_VERSION}$\n" versionOK
  StrCmp $1 "${APP_VERSION}" versionOK installFailed

  versionOK:
  DetailPrint "Stopping the owned Worker service after its current exchange..."
  nsExec::ExecToLog /TIMEOUT=180000 '"$INSTDIR\nuwa-relay-mcp.exe" worker service-remove'
  Pop $0
  StrCmp $0 "0" 0 installFailed

  ClearErrors
  SetOverwrite on
  File /oname=nuwa-studio-worker.exe "${WORKER_PATH}"
  IfErrors installFailed

  DetailPrint "Registering MCP and installing the official Skill..."
  nsExec::ExecToLog /TIMEOUT=180000 '"$INSTDIR\nuwa-relay-mcp.exe" install --target all --overwrite'
  Pop $0
  StrCmp $0 "0" 0 installFailed

  DetailPrint "Registering windowless Worker startup for the current user..."
  nsExec::ExecToLog /TIMEOUT=180000 '"$INSTDIR\nuwa-relay-mcp.exe" worker service-install'
  Pop $0
  StrCmp $0 "0" 0 installFailed

  ; Register a fixed, credential-free protocol command. Never pass the URL to the executable.
  ClearErrors
  ReadRegStr $0 HKCU "${WORKER_PROTOCOL_KEY}\shell\open\command" ""
  StrCmp $0 "" workerProtocolReady
  StrCmp $0 '$\"$INSTDIR\nuwa-studio-worker.exe$\" pair' workerProtocolReady installFailed

  workerProtocolReady:
  ClearErrors
  WriteRegStr HKCU "${WORKER_PROTOCOL_KEY}" "" "URL:Nuwa Studio Worker"
  WriteRegStr HKCU "${WORKER_PROTOCOL_KEY}" "URL Protocol" ""
  WriteRegStr HKCU "${WORKER_PROTOCOL_KEY}\shell\open\command" "" '$\"$INSTDIR\nuwa-studio-worker.exe$\" pair'
  IfErrors installFailed

  CreateDirectory "$SMPROGRAMS\Nuwa Studio"
  CreateShortCut "$SMPROGRAMS\Nuwa Studio\Connect Worker.lnk" "$INSTDIR\nuwa-studio-worker.exe" "pair"
  IfErrors installFailed

  ClearErrors
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${REG_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${REG_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${REG_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REG_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${REG_KEY}" "DisplayIcon" "$INSTDIR\nuwa-relay-mcp.exe"
  WriteRegDWORD HKCU "${REG_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REG_KEY}" "NoRepair" 1
  IfErrors installFailed
  Goto installDone

  installFailed:
  DetailPrint "Installation failed. Close active MCP clients and retry."
  SetErrorLevel 1
  IfSilent +2
  MessageBox MB_OK|MB_ICONSTOP "Nuwa Relay MCP installation failed. See the installation log, close active MCP clients and retry."
  Abort

  installDone:
SectionEnd

Section "Uninstall"
  DetailPrint "Stopping and removing the owned Worker task..."
  nsExec::ExecToLog /TIMEOUT=180000 '"$INSTDIR\nuwa-relay-mcp.exe" worker service-remove'
  Pop $0
  StrCmp $0 "0" 0 uninstallFailed

  DetailPrint "Removing MCP registration and managed Skills..."
  nsExec::ExecToLog /TIMEOUT=180000 '"$INSTDIR\nuwa-relay-mcp.exe" uninstall --target all'
  Pop $0
  StrCmp $0 "0" 0 uninstallFailed

  ReadRegStr $0 HKCU "${WORKER_PROTOCOL_KEY}\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\nuwa-studio-worker.exe$\" pair' 0 workerProtocolRemoved
  DeleteRegKey HKCU "${WORKER_PROTOCOL_KEY}"

  workerProtocolRemoved:
  ClearErrors
  Delete "$INSTDIR\nuwa-studio-worker.exe"
  IfErrors uninstallFailed
  Delete "$SMPROGRAMS\Nuwa Studio\Connect Worker.lnk"
  RMDir "$SMPROGRAMS\Nuwa Studio"
  Delete "$INSTDIR\nuwa-relay-mcp.exe"
  IfErrors uninstallFailed
  DeleteRegKey HKCU "${REG_KEY}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Goto uninstallDone

  uninstallFailed:
  DetailPrint "Uninstall failed. The uninstaller is retained for retry."
  SetErrorLevel 1
  IfSilent +2
  MessageBox MB_OK|MB_ICONSTOP "Nuwa Relay MCP could not be fully removed. See the log and retry."
  Abort

  uninstallDone:
SectionEnd
