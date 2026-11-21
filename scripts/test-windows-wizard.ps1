param([Parameter(Mandatory)][string]$Setup)
$ErrorActionPreference = 'Stop'
if ($env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Run this installation test on a disposable hosted runner.' }

Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Wizard {
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr dialog, int id);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
}
'@
$choice = Join-Path $env:RUNNER_TEMP '我的技能 Library'
$hint = Join-Path $env:APPDATA '@skills-hub/desktop/setup-folder.txt'
$pointer = Join-Path $env:USERPROFILE '.skills-hub/config.json'
if ((Test-Path $pointer) -or (Test-Path $hint)) { throw 'Expected a fresh user profile' }
$proc = Start-Process -FilePath $Setup -ArgumentList '/currentuser' -PassThru
$deadline = [datetime]::UtcNow.AddSeconds(90)
$editCondition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Edit)
$selected = $false
while ([datetime]::UtcNow -lt $deadline -and !(Test-Path $hint)) {
  Start-Sleep -Milliseconds 500
  $proc.Refresh()
  if ($proc.HasExited) { throw "Wizard exited before saving the folder ($($proc.ExitCode))" }
  $window = $proc.MainWindowHandle
  if ($window -eq [IntPtr]::Zero -or $selected) { continue }
  $form = [System.Windows.Automation.AutomationElement]::FromHandle($window)
  $folderEdit = $form.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
  if ($folderEdit -and !$folderEdit.Current.IsOffscreen) {
    $folderEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($choice)
    $selected = $true
  }
  $next = [Wizard]::GetDlgItem($window, 1)
  if ($next -ne [IntPtr]::Zero) { [void][Wizard]::PostMessage($next, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) }
}
if (!$selected -or !(Test-Path $hint)) { throw 'Could not complete the folder page' }
if ([IO.File]::ReadAllText($hint, [Text.Encoding]::Unicode) -cne $choice) { throw 'Wizard saved a different folder' }
if ((Test-Path $pointer) -or (Test-Path $choice)) { throw 'Installation initialized a skill store before consent' }
Write-Host 'Native wizard preserved the selected path and left the store uninitialized.'
