!include "MUI2.nsh"
!ifndef EXE_PATH
  !error "EXE_PATH must be supplied"
!endif
!ifndef OUTPUT_PATH
  !define OUTPUT_PATH "NuwaStudioMCPSetup.exe"
!endif
Name "Nuwa Agent Relay Studio MCP"
OutFile "${OUTPUT_PATH}"
InstallDir "$LOCALAPPDATA\Programs\NuwaAgentRelayStudio"
Page directory
Page instfiles
Section "Install"
  SetOutPath "$INSTDIR"
  File /oname=nuwa-studio-mcp.exe "${EXE_PATH}"
  ExecWait '"$INSTDIR\nuwa-studio-mcp.exe" install --overwrite'
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd
Section "Uninstall"
  ExecWait '"$INSTDIR\nuwa-studio-mcp.exe" uninstall'
  Delete "$INSTDIR\nuwa-studio-mcp.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
