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
!ifndef OUTPUT_PATH
  !error "OUTPUT_PATH must be supplied"
!endif

!define APP_NAME "Nuwa Relay MCP"
!define APP_PUBLISHER "Nuwa Information"
!define REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\nuwa-relay-mcp"
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
  SetOutPath "$INSTDIR"
  ClearErrors
  File /oname=nuwa-relay-mcp.exe "${EXE_PATH}"
  IfErrors installFailed

  DetailPrint "Checking the installed executable version..."
  nsExec::ExecToStack /TIMEOUT=120000 '"$INSTDIR\nuwa-relay-mcp.exe" --version'
  Pop $0
  Pop $1
  StrCmp $0 "0" 0 installFailed
  StrCmp $1 "${APP_VERSION}$\r$\n" versionOK
  StrCmp $1 "${APP_VERSION}$\n" versionOK
  StrCmp $1 "${APP_VERSION}" versionOK installFailed

  versionOK:
  DetailPrint "Registering MCP and installing the official Skill..."
  nsExec::ExecToLog /TIMEOUT=180000 '"$INSTDIR\nuwa-relay-mcp.exe" install --target all --overwrite'
  Pop $0
  StrCmp $0 "0" 0 installFailed

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
  DetailPrint "Removing MCP registration and managed Skills..."
  nsExec::ExecToLog /TIMEOUT=180000 '"$INSTDIR\nuwa-relay-mcp.exe" uninstall --target all'
  Pop $0
  StrCmp $0 "0" 0 uninstallFailed

  ClearErrors
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
