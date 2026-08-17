!macro customInit
  nsExec::ExecToStack 'taskkill /F /IM "Workforce Agent.exe" /T'
!macroend

!macro customInstall
  WriteRegDWORD SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "SystemComponent" 1
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Prosync Workforce Agent" '"$INSTDIR\Workforce Agent.exe" --autostart'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Prosync Workforce Agent"
!macroend
