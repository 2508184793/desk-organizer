param(
  [int]$ParentPid = 0,
  [string]$ProcName = '',
  [string]$ParentStartTime = '',
  [switch]$ForceShow
)
# Desktop icon restore watchdog.
# Created via WMI Win32_Process.Create so it survives the app process tree
# (Electron kills child_process children on exit via its Job Object).
# Blocks on the parent process handle; the kernel signals it the instant the
# parent dies (crash / kill / power loss), then restores desktop icons.
# Idempotent: does nothing if icons are already visible or a new app instance
# has taken over.
# NOTE: keep this file pure ASCII (PS 5.1 reads UTF-8 without BOM as ANSI).

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DZWatch {
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern IntPtr FindWindowA(string cls, string title);
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern IntPtr FindWindowExA(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessageA(IntPtr h, uint msg, int w, int l);
}
'@

$LogFile = Join-Path $env:TEMP 'dz-watchdog.log'
function Log($msg) {
  try { Add-Content -Path $LogFile -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss.fff'), $msg) -Encoding ASCII } catch {}
}

Log ("started parentPid=" + $ParentPid + " procName=" + $ProcName)

function Test-IconsHidden {
  try {
    $dv = [DZWatch]::FindWindowExA([DZWatch]::FindWindowA('Progman', 'Program Manager'), [IntPtr]::Zero, 'SHELLDLL_DefView', $null)
    if ($dv -eq [IntPtr]::Zero) { return $false }
    $lv = [DZWatch]::FindWindowExA($dv, [IntPtr]::Zero, 'SysListView32', 'FolderView')
    if ($lv -eq [IntPtr]::Zero) { return $false }
    return (-not [DZWatch]::IsWindowVisible($lv))
  } catch {
    return $false
  }
}

function Restore-Icons {
  $dv = [DZWatch]::FindWindowExA([DZWatch]::FindWindowA('Progman', 'Program Manager'), [IntPtr]::Zero, 'SHELLDLL_DefView', $null)
  if ($dv -ne [IntPtr]::Zero) {
    [DZWatch]::PostMessageA($dv, 0x0111, 0x7402, 0) | Out-Null
    Log 'toggle sent'
  } else {
    Log 'defView not found'
  }
}

# ForceShow: boot-time restore (RunOnce at next logon) - just show icons, no parent logic.
if ($ForceShow) {
  Log 'force-show'
  if (Test-IconsHidden) { Restore-Icons }
  exit
}

# Block until the parent process dies. Returns the instant the handle signals.
# PID reuse is guarded by comparing the start time first.
$diedAt = $null
try {
  $p = [System.Diagnostics.Process]::GetProcessById($ParentPid)
  if ($ParentStartTime -and $p.StartTime.ToUniversalTime().ToString('o') -ne $ParentStartTime) {
    Log 'parent pid reused by another process, treat as dead'
    $diedAt = (Get-Date).ToUniversalTime()
  } else {
    $p.WaitForExit()
    $diedAt = (Get-Date).ToUniversalTime()
  }
} catch {
  # Parent already gone (PID missing)
  Log 'parent already gone'
  $diedAt = (Get-Date).ToUniversalTime()
}
if (-not $diedAt) { $diedAt = (Get-Date).ToUniversalTime() }

# A new instance = same executable started AFTER the parent died.
# Lingering children of the dead app started before the death and are ignored.
function Test-NewInstance {
  if (-not $ProcName) { return $false }
  try {
    $cut = $diedAt.AddSeconds(-1)
    return [bool]([System.Diagnostics.Process]::GetProcessesByName($ProcName) | Where-Object { $_.StartTime.ToUniversalTime() -gt $cut })
  } catch {
    return $false
  }
}

$hidden = Test-IconsHidden
if (-not (Test-NewInstance) -and $hidden) {
  # Pure crash path: restore immediately (no relaunch pending).
  Restore-Icons
} elseif (Test-NewInstance) {
  Log 'new instance took over, skip restore'
} else {
  Log ("iconsHidden=" + $hidden + ", nothing to restore")
}
