# Force Windows to drop cached Electron branding for Slide.
$ErrorActionPreference = 'SilentlyContinue'

$installDir = Join-Path $env:LOCALAPPDATA 'Programs\slide-frontend'
$appExe = Join-Path $installDir 'Slide.exe'
$iconIco = Join-Path $installDir 'uninstallerIcon.ico'
$startMenuIco = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Slide.ico'
$shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Slide.lnk'
$muiCache = 'HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache'

if (-not (Test-Path $appExe)) {
  Write-Error "Slide is not installed at $installDir"
  exit 1
}

foreach ($suffix in @('.FriendlyAppName', '.ApplicationCompany')) {
  Remove-ItemProperty -Path $muiCache -Name ($appExe + $suffix) -ErrorAction SilentlyContinue
}

$appReg = 'HKCU:\Software\Classes\Applications\Slide.exe'
New-Item -Path $appReg -Force | Out-Null
New-Item -Path ($appReg + '\DefaultIcon') -Force | Out-Null
Set-ItemProperty -Path ($appReg + '\DefaultIcon') -Name '(default)' -Value ($iconIco + ',0')
New-Item -Path ($appReg + '\shell\open\command') -Force | Out-Null
Set-ItemProperty -Path ($appReg + '\shell\open\command') -Name '(default)' -Value ('"' + $appExe + '" "%1"')
Set-ItemProperty -Path $appReg -Name 'FriendlyAppName' -Value 'Slide'
Set-ItemProperty -Path $appReg -Name 'ApplicationCompany' -Value 'Slide'

Copy-Item -Path $iconIco -Destination $startMenuIco -Force

if (Test-Path $shortcut) {
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut($shortcut)
  $lnk.TargetPath = $appExe
  $lnk.IconLocation = ($startMenuIco + ',0')
  $lnk.Description = 'Slide'
  $lnk.Save()
}

Get-Process StartMenuExperienceHost, SearchApp, SearchHost, ShellExperienceHost | Stop-Process -Force
Start-Process "$env:WINDIR\System32\ie4uinit.exe" -ArgumentList '-ClearIconCache' -Wait
Stop-Process -Name explorer -Force
Start-Process explorer

Write-Host 'Shell icon cache refreshed for Slide.'
