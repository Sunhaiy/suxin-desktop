
$ErrorActionPreference = 'SilentlyContinue'

# P/Invoke: foreground window + idle detection
$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SxActivity {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  [StructLayout(LayoutKind.Sequential)]
  private struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LASTINPUTINFO lii);

  public static int GetIdleMs() {
    var lii = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO)) };
    if (!GetLastInputInfo(ref lii)) return 0;
    int idle = Environment.TickCount - (int)lii.dwTime;
    return idle < 0 ? 0 : idle;
  }
}
'@
Add-Type -TypeDefinition $sig -EA SilentlyContinue

# UI Automation for browser URL extraction
$uiaOk = $false
try {
    Add-Type -AssemblyName UIAutomationClient -EA Stop
    Add-Type -AssemblyName UIAutomationTypes  -EA Stop
    $uiaOk = $true
} catch {}

$browsers = [System.Collections.Generic.HashSet[string]]@(
    'chrome','msedge','firefox','brave','vivaldi','opera','whale','arc')

function Get-BrowserUrl([IntPtr]$hwnd) {
    if (-not $uiaOk) { return '' }
    try {
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
        $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Edit)
        $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
        if (-not $el) { return '' }
        $vp  = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $val = $vp.Current.Value
        if ($val -match '^https?://') { return $val }
    } catch {}
    return ''
}

while ($true) {
    $h    = [SxActivity]::GetForegroundWindow()
    $sb   = New-Object System.Text.StringBuilder(512)
    [SxActivity]::GetWindowText($h, $sb, 512) | Out-Null
    $title = $sb.ToString()

    $pid2 = [uint32]0
    [SxActivity]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
    $p    = Get-Process -Id $pid2 -EA SilentlyContinue
    $n    = $p.ProcessName

    $idle = [SxActivity]::GetIdleMs()

    $url = ''
    if ($n -and $browsers.Contains($n) -and $idle -lt 60000) {
        $url = Get-BrowserUrl $h
    }

    $row = [PSCustomObject]@{
      app=$n; title=$title; url=$url; idleMs=$idle; pid=[int]$pid2
      processPath=$p.Path; description=$p.Description
    }
    [Console]::Out.Flush()
    [Console]::WriteLine(($row | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
    Start-Sleep -Seconds 5
}
