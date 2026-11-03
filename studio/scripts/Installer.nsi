!include "MUI2.nsh"
!ifndef EXE_PATH
  !error "EXE_PATH must be supplied"
!endif
!ifndef OUTPUT_PATH
  !define OUTPUT_PATH "NuwaAgentRelayStudioSetup.exe"
!endif
Name "Nuwa Agent Relay Studio MCP"
OutFile "${OUTPUT_PATH}"
InstallDir "$LOCALAPPDATA\Programs\NuwaAgentRelayMCP"
Page directory
Page instfiles
Section "Install"
  SetOutPath "$INSTDIR"
  File /oname=nuwa-agent-relay-mcp.exe "${EXE_PATH}"
  ExecWait '"$INSTDIR\nuwa-agent-relay-mcp.exe" install --overwrite'
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd
Section "Uninstall"
  ExecWait '"$INSTDIR\nuwa-agent-relay-mcp.exe" uninstall'
  Delete "$INSTDIR\nuwa-agent-relay-mcp.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
