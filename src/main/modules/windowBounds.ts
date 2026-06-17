import { execFileSync } from 'child_process'

export interface WinRect { x: number; y: number; w: number; h: number; title: string }

const PS_SCRIPT = `
$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WE {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWP lp, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int  GetWindowText(IntPtr h, StringBuilder s, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  public delegate bool EnumWP(IntPtr h, IntPtr p);
}
'@
Add-Type -TypeDefinition $sig
$list = [System.Collections.Generic.List[string]]::new()
[WE]::EnumWindows({
  param($h,$_)
  if ([WE]::IsWindowVisible($h)) {
    $r = New-Object WE+RECT
    if ([WE]::GetWindowRect($h, [ref]$r)) {
      $w = $r.R - $r.L; $ht = $r.B - $r.T
      if ($w -gt 80 -and $ht -gt 80) {
        $sb = New-Object System.Text.StringBuilder(256)
        [WE]::GetWindowText($h, $sb, 256) | Out-Null
        $t = $sb.ToString().Trim()
        if ($t) { $list.Add("$($r.L)|$($r.T)|$w|$ht|$t") }
      }
    }
  }
  $true
}, [IntPtr]::Zero) | Out-Null
$list -join "\`n"
`

export function getVisibleWindowRects(): WinRect[] {
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
      { encoding: 'utf8', timeout: 4000 }
    )
    return out.trim().split('\n').filter(Boolean).map(line => {
      const [x, y, w, h, ...tp] = line.split('|')
      return { x: +x, y: +y, w: +w, h: +h, title: tp.join('|') }
    }).filter(r => r.w > 0 && r.h > 0)
  } catch { return [] }
}
