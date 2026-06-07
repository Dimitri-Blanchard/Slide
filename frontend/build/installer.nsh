; Custom NSIS hooks for Slide (electron-builder)
; Fix false "Slide cannot be closed" when the app is only hidden in the tray.

!macro _SLIDE_KILL_RUNNING_APP
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    DetailPrint "Closing ${PRODUCT_NAME}..."
    nsExec::Exec 'taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T /F'
    Sleep 2000
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      Sleep 1500
      nsExec::Exec 'taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T /F'
      Sleep 1000
    ${EndIf}
  ${EndIf}
!macroend

!macro customCheckAppRunning
  !insertmacro _SLIDE_KILL_RUNNING_APP
!macroend

!macro customInit
  !insertmacro _SLIDE_KILL_RUNNING_APP
!macroend

; Windows caches exe labels/icons in MuiCache — refresh without blocking install (ExecWait can hang).
!macro customInstall
  DeleteRegValue HKCU "Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache" "$appExe.FriendlyAppName"
  DeleteRegValue HKCU "Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache" "$appExe.ApplicationCompany"

  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\DefaultIcon" "" "$INSTDIR\uninstallerIcon.ico,0"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\FriendlyAppName" "" "${PRODUCT_NAME}"
  !ifdef COMPANY_NAME
    WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\ApplicationCompany" "" "${COMPANY_NAME}"
  !endif

  CopyFiles /SILENT "$INSTDIR\uninstallerIcon.ico" "$SMPROGRAMS\Slide.ico"

  !ifdef DO_NOT_CREATE_START_MENU_SHORTCUT
  !else
    Delete "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$SMPROGRAMS\Slide.ico" 0 "" "" "${PRODUCT_NAME}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  !endif

  !ifdef DO_NOT_CREATE_DESKTOP_SHORTCUT
  !else
    ${ifNot} ${isNoDesktopShortcut}
      Delete "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$SMPROGRAMS\Slide.ico" 0 "" "" "${PRODUCT_NAME}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${endif}
  !endif

  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  Exec '"$WINDIR\System32\ie4uinit.exe" -ClearIconCache'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  Delete "$SMPROGRAMS\Slide.ico"
!macroend
