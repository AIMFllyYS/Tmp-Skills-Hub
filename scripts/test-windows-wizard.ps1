param([Parameter(Mandatory)][string]$Setup)
$ErrorActionPreference = 'Stop'
if ($env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Run this installation test on a disposable hosted runner.' }

# Use the native edit control, including on runners without a foreground desktop.
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class Wizard {
  private delegate bool Visitor(IntPtr handle, IntPtr data);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, Visitor visit, IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr size, StringBuilder value);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] public static extern IntPtr SetText(IntPtr hwnd, uint msg, IntPtr zero, string value);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr dialog, int id);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  public static IntPtr Folder(IntPtr parent) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(parent, (h, _) => {
      var name = new StringBuilder(80);
      GetClassName(h, name, name.Capacity);
      if (name.ToString() == "Edit" && Text(h).EndsWith(@".skills-hub\skills", StringComparison.OrdinalIgnoreCase)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string Text(IntPtr h) {
    var value = new StringBuilder(1024);
    SendMessage(h, 0xD, (IntPtr)value.Capacity, value);
    return value.ToString();
  }
}
"@
$choice = Join-Path $env:RUNNER_TEMP '我的技能 Library'
$hint = Join-Path $env:APPDATA '@skills-hub/desktop/setup-folder.txt'
$pointer = Join-Path $env:USERPROFILE '.skills-hub/config.json'
if ((Test-Path $pointer) -or (Test-Path $hint)) { throw 'Expected a fresh user profile' }
$proc = Start-Process -FilePath $Setup -ArgumentList '/currentuser' -PassThru
$deadline = [datetime]::UtcNow.AddMinutes(2)
$selected = $false
$previousButton = ''
while ([datetime]::UtcNow -lt $deadline -and !(Test-Path $hint)) {
  Start-Sleep -Milliseconds 300
  $proc.Refresh()
  if ($proc.HasExited) { throw "Wizard exited before saving the folder ($($proc.ExitCode))" }
  $window = $proc.MainWindowHandle
  if ($window -eq [IntPtr]::Zero -or $selected) { continue }
  $next = [Wizard]::GetDlgItem($window, 1)
  $caption = [Wizard]::Text($next)
  $folderEdit = [Wizard]::Folder($window)
  if ($folderEdit -ne [IntPtr]::Zero) {
    [void][Wizard]::SetText($folderEdit, 0xC, [IntPtr]::Zero, $choice)
    if ([Wizard]::Text($folderEdit) -cne $choice) { throw 'Could not set the selected path' }
    $selected = $true
    Write-Host 'Selected the custom folder in the native directory field.'
    [void][Wizard]::PostMessage($next, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero)
  } elseif ($caption -ne $previousButton) {
    Write-Host "Wizard button: $caption"
    $previousButton = $caption
    if ($caption -match 'Next|下一步') {
      [void][Wizard]::PostMessage($next, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero)
    }
  }
}
if (!$selected -or !(Test-Path $hint)) { throw "Folder page incomplete. Selected=$selected, saved=$(Test-Path $hint), last button=$previousButton" }
if ([IO.File]::ReadAllText($hint, [Text.Encoding]::Unicode) -cne $choice) { throw 'Wizard saved a different folder' }
if ((Test-Path $pointer) -or (Test-Path $choice)) { throw 'Installation initialized a skill store before consent' }
Write-Host 'Native wizard preserved the selected path and left the store uninitialized.'
