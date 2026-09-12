!macro customInit
  nsExec::ExecToStack 'taskkill /F /IM "Workforce Agent.exe" /T'
!macroend

!macro customInstall
  WriteRegDWORD SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "SystemComponent" 1
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Prosync Workforce Agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.prosync.desktopagent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "desktop-agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Desktop Agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Prosync Workforce Agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.prosync.desktopagent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "desktop-agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Desktop Agent"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Workforce Agent" '"$INSTDIR\Workforce Agent.exe" --autostart'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Workforce Agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Prosync Workforce Agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.prosync.desktopagent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "desktop-agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Desktop Agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Workforce Agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Prosync Workforce Agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.prosync.desktopagent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "desktop-agent"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Desktop Agent"
!macroend
