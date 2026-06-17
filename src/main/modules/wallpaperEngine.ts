/**
 * Live Wallpaper Engine
 *
 * Creates a frameless BrowserWindow and embeds it behind the Windows desktop
 * icons using the WorkerW trick (same technique as Wallpaper Engine).
 *
 * Sources supported:
 *   - Built-in HTML/Canvas animations (seeded to getDataBase()/wallpaper-themes/)
 *   - Local video files (mp4, webm, mkv, mov) — wrapped in a generated HTML page
 */
import { BrowserWindow, ipcMain, screen, dialog } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getDataBase } from './paths'

// ── Built-in theme HTML ──────────────────────────────────────────────────────

const THEME_MATRIX = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#000;overflow:hidden}canvas{display:block}</style>
</head><body><canvas id=c></canvas><script>
const C=document.getElementById('c'),X=C.getContext('2d')
function R(){C.width=innerWidth;C.height=innerHeight;D=new Array(Math.ceil(C.width/14)).fill(1)}
window.onresize=R;R();let D
const CH='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'
function draw(){
  X.fillStyle='rgba(0,0,0,0.05)';X.fillRect(0,0,C.width,C.height)
  X.font='14px monospace'
  for(let i=0;i<D.length;i++){
    X.fillStyle=Math.random()>.97?'#afffaf':'#00ff41'
    X.fillText(CH[~~(Math.random()*CH.length)],i*14,D[i]*14)
    if(D[i]*14>C.height&&Math.random()>.975)D[i]=0;else D[i]++
  }
}
setInterval(draw,33)
</script></body></html>`

const THEME_PARTICLES = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#0a0f1e;overflow:hidden}canvas{display:block}</style>
</head><body><canvas id=c></canvas><script>
const C=document.getElementById('c'),X=C.getContext('2d')
let W,H,P=[]
function R(){W=C.width=innerWidth;H=C.height=innerHeight}
window.onresize=R;R()
for(let i=0;i<150;i++)P.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,r:Math.random()*2.5+.5,h:Math.random()*60+200})
function draw(){
  X.fillStyle='rgba(10,15,30,0.12)';X.fillRect(0,0,W,H)
  for(const p of P){
    p.x+=p.vx;p.y+=p.vy
    if(p.x<0||p.x>W)p.vx*=-1
    if(p.y<0||p.y>H)p.vy*=-1
    X.beginPath();X.arc(p.x,p.y,p.r,0,Math.PI*2)
    X.fillStyle='hsla('+p.h+',100%,72%,0.85)';X.fill()
  }
  for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){
    const d=Math.hypot(P[i].x-P[j].x,P[i].y-P[j].y)
    if(d<130){X.strokeStyle='hsla(210,100%,70%,'+(1-d/130)*.12+')';X.lineWidth=.8;X.beginPath();X.moveTo(P[i].x,P[i].y);X.lineTo(P[j].x,P[j].y);X.stroke()}
  }
  requestAnimationFrame(draw)
}
draw()
</script></body></html>`

const THEME_AURORA = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#000;overflow:hidden}canvas{display:block}</style>
</head><body><canvas id=c></canvas><script>
const C=document.getElementById('c'),X=C.getContext('2d')
let W,H,t=0
function R(){W=C.width=innerWidth;H=C.height=innerHeight}
window.onresize=R;R()
const COLS=['#00e5ff','#00bfa5','#7c4dff','#e040fb','#ff4081','#69f0ae']
function N(x,t){return Math.sin(x*.008+t*.25)*Math.cos(x*.004+t*.15)}
function draw(){
  X.fillStyle='rgba(0,0,0,0.06)';X.fillRect(0,0,W,H)
  for(let x=0;x<W;x+=3){
    const v=N(x,t),y=H*.3+v*H*.18+Math.sin(x*.003+t*.4)*H*.06
    const ci=Math.floor((v+1)/2*COLS.length)%COLS.length
    const g=X.createLinearGradient(0,y,0,y+H*.45)
    g.addColorStop(0,COLS[ci]+'99');g.addColorStop(.5,COLS[(ci+1)%COLS.length]+'44');g.addColorStop(1,'transparent')
    X.fillStyle=g;X.fillRect(x,y,3,H*.5)
  }
  t+=.007;requestAnimationFrame(draw)
}
draw()
</script></body></html>`

const THEME_STARS = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#000;overflow:hidden}canvas{display:block}</style>
</head><body><canvas id=c></canvas><script>
const C=document.getElementById('c'),X=C.getContext('2d')
let W,H,S=[]
function R(){W=C.width=innerWidth;H=C.height=innerHeight}
window.onresize=R;R()
function mk(){return{x:(Math.random()-.5)*W*3,y:(Math.random()-.5)*H*3,z:Math.random()*W,pz:0}}
for(let i=0;i<800;i++){const s=mk();s.pz=s.z;S.push(s)}
function draw(){
  X.fillStyle='rgba(0,0,0,0.2)';X.fillRect(0,0,W,H)
  for(const s of S){
    s.pz=s.z;s.z-=3;if(s.z<=0){Object.assign(s,mk());s.pz=s.z=W}
    const sx=s.x/s.z*W+W*.5,sy=s.y/s.z*H+H*.5
    const px=s.x/s.pz*W+W*.5,py=s.y/s.pz*H+H*.5
    const r=Math.max(.1,(1-s.z/W)*2.5)
    const b=Math.floor((1-s.z/W)*255)
    X.strokeStyle='rgb('+b+','+b+',255)';X.lineWidth=r;X.beginPath();X.moveTo(px,py);X.lineTo(sx,sy);X.stroke()
  }
  requestAnimationFrame(draw)
}
draw()
</script></body></html>`

const THEME_GEOMETRIC = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#0a0010;overflow:hidden}canvas{display:block}</style>
</head><body><canvas id=c></canvas><script>
const C=document.getElementById('c'),X=C.getContext('2d')
let W,H,t=0
function R(){W=C.width=innerWidth;H=C.height=innerHeight}
window.onresize=R;R()
const SH=Array.from({length:14},(_,i)=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*70+20,n:3+~~(Math.random()*5),rot:Math.random()*Math.PI*2,sp:(Math.random()-.5)*.006,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,h:i*26}))
function poly(x,y,r,n,a){X.beginPath();for(let i=0;i<n;i++){const θ=a+i/n*Math.PI*2;i?X.lineTo(x+Math.cos(θ)*r,y+Math.sin(θ)*r):X.moveTo(x+Math.cos(θ)*r,y+Math.sin(θ)*r)};X.closePath()}
function draw(){
  X.fillStyle='rgba(10,0,16,0.18)';X.fillRect(0,0,W,H)
  for(const s of SH){
    s.rot+=s.sp;s.x+=s.vx;s.y+=s.vy
    if(s.x<-s.r||s.x>W+s.r)s.vx*=-1
    if(s.y<-s.r||s.y>H+s.r)s.vy*=-1
    const pr=s.r*(1+Math.sin(t*.8+s.h)*.2)
    poly(s.x,s.y,pr,s.n,s.rot)
    const g=X.createRadialGradient(s.x,s.y,0,s.x,s.y,pr)
    g.addColorStop(0,'hsla('+(s.h+t*15)+',90%,65%,0.55)')
    g.addColorStop(1,'hsla('+(s.h+t*15+50)+',80%,40%,0.08)')
    X.fillStyle=g;X.fill()
    X.strokeStyle='hsla('+(s.h+t*15)+',100%,80%,0.35)';X.lineWidth=1;X.stroke()
  }
  t+=.018;requestAnimationFrame(draw)
}
draw()
</script></body></html>`

// ── Theme catalog ────────────────────────────────────────────────────────────

export interface WallpaperTheme {
  id:     string
  name:   string
  desc:   string
  colors: string[]   // gradient preview colors
}

export const THEMES: WallpaperTheme[] = [
  { id: 'matrix',    name: '数字雨',   desc: '经典黑客风格绿色矩阵',   colors: ['#000','#001a00','#00ff41'] },
  { id: 'particles', name: '粒子网络', desc: '浮动粒子连线构成的星云',   colors: ['#0a0f1e','#1d4ed8','#7dd3fc'] },
  { id: 'aurora',    name: '极光',     desc: '流动的北极光彩带',        colors: ['#000','#064e3b','#7c4dff','#e040fb'] },
  { id: 'stars',     name: '星际穿越', desc: '深空高速穿越星场',        colors: ['#000','#0a0a1a','#6060ff'] },
  { id: 'geometric', name: '几何流',   desc: '漂浮变换的几何形体',      colors: ['#0a0010','#7c3aed','#f59e0b'] },
]

const THEME_HTML: Record<string, string> = {
  matrix:    THEME_MATRIX,
  particles: THEME_PARTICLES,
  aurora:    THEME_AURORA,
  stars:     THEME_STARS,
  geometric: THEME_GEOMETRIC,
}

// ── Storage helpers ──────────────────────────────────────────────────────────

function getThemeDir(): string {
  const d = path.join(getDataBase(), 'wallpaper-themes')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

function seedThemes(): void {
  const dir = getThemeDir()
  for (const [id, html] of Object.entries(THEME_HTML)) {
    const p = path.join(dir, `${id}.html`)
    if (!fs.existsSync(p)) fs.writeFileSync(p, html, 'utf8')
  }
}

function getConfigPath(): string { return path.join(getDataBase(), 'wallpaper-engine-config.json') }

interface EngineConfig {
  enabled: boolean
  source?: { type: 'theme' | 'video'; id: string; path?: string }
  volume:  number
}

function loadConfig(): EngineConfig {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) }
  catch { return { enabled: false, volume: 0 } }
}

function saveConfig(c: EngineConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(c))
}

// ── WorkerW embedding (Windows-specific) ─────────────────────────────────────

const EMBED_PS = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Threading;
public class WE {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string a,string b);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p,IntPtr c,string a,string b);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h,uint m,IntPtr w,IntPtr l,uint f,uint t,out IntPtr r);
  [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr c,IntPtr p);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int ht,uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int i);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h,int i,int v);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint u);
  [DllImport("user32.dll",CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr h,System.Text.StringBuilder s,int m);
  [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);

  // Win10: sibling WorkerW after the one with SHELLDLL_DefView
  // Win11 24H2: WorkerW is a DIRECT CHILD of Progman (not a top-level sibling)
  static IntPtr FindWorkerW(IntPtr pm){
    IntPtr cur=FindWindowEx(IntPtr.Zero,IntPtr.Zero,"WorkerW",null);
    while(cur!=IntPtr.Zero){
      if(FindWindowEx(cur,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero){
        IntPtr next=FindWindowEx(IntPtr.Zero,cur,"WorkerW",null);
        if(next!=IntPtr.Zero){Console.WriteLine("Win10 sibling WorkerW="+next.ToInt64());return next;}
      }
      cur=FindWindowEx(IntPtr.Zero,cur,"WorkerW",null);
    }
    // Windows 11 24H2: look for WorkerW as direct child of Progman
    IntPtr child=FindWindowEx(pm,IntPtr.Zero,"WorkerW",null);
    if(child!=IntPtr.Zero){Console.WriteLine("Win11 child WorkerW="+child.ToInt64());return child;}
    return IntPtr.Zero;
  }

  public static void Embed(long hwnd){
    IntPtr tgt=new IntPtr(hwnd);
    IntPtr pm=FindWindow("Progman",null);
    Console.WriteLine("pm="+pm.ToInt64()+" pmEx=0x"+GetWindowLong(pm,-20).ToString("X"));
    IntPtr res;

    // Trigger WorkerW creation
    int[]wp=new int[]{0,0x0D,0x0D};int[]lp=new int[]{0,0,1};
    for(int i=0;i<3;i++){SendMessageTimeout(pm,0x052C,new IntPtr(wp[i]),new IntPtr(lp[i]),0,500,out res);Thread.Sleep(50);}

    // Wait up to 3s for WorkerW to appear
    IntPtr ww=IntPtr.Zero;
    for(int attempt=0;attempt<30&&ww==IntPtr.Zero;attempt++){
      Thread.Sleep(100);ww=FindWorkerW(pm);
    }

    int sw=GetSystemMetrics(0),sh=GetSystemMetrics(1);
    if(ww!=IntPtr.Zero){
      int wwEx=GetWindowLong(ww,-20);
      Console.WriteLine("WorkerW="+ww.ToInt64()+" exStyle=0x"+wwEx.ToString("X"));
      SetParent(tgt,ww);
      // Use full screen dimensions from GetSystemMetrics — WorkerW client rect
      // can be off by 1px due to DPI rounding, leaving a visible seam on the right.
      Console.WriteLine("embed W="+sw+" H="+sh);
      SetWindowPos(tgt,(IntPtr)1,0,0,sw,sh,0x0040);
      ShowWindow(tgt,5);
    } else {
      // No WorkerW found — HWND_BOTTOM fallback
      Console.WriteLine("no WorkerW found sw="+sw+" sh="+sh+" — HWND_BOTTOM fallback");
      int ex=GetWindowLong(tgt,-20);
      SetWindowLong(tgt,-20,(ex&~0x00040000)|0x00000080);
      SetWindowPos(tgt,(IntPtr)1,0,0,sw,sh,0x0010|0x0040);
      ShowWindow(tgt,4);
    }
    Console.WriteLine("done");
  }
}
'@
[WE]::Embed($args[0])
`

function embedInDesktop(hwnd: string): Promise<void> {
  const scriptPath = path.join(getDataBase(), 'embed-wallpaper.ps1')
  fs.writeFileSync(scriptPath, EMBED_PS, 'utf8')
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath, hwnd,
    ], { windowsHide: true }, (err, stdout, stderr) => {
      if (stdout) console.log('[wallpaperEngine] PS:', stdout.trim())
      if (err) {
        console.error('[wallpaperEngine] embed error:', err.message)
        if (stderr) console.error('[wallpaperEngine] PS stderr:', stderr.trim())
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

function getHwnd(win: BrowserWindow): string {
  const buf = win.getNativeWindowHandle()
  return buf.length >= 8
    ? buf.readBigUInt64LE(0).toString()
    : buf.readUInt32LE(0).toString()
}

// ── Engine ───────────────────────────────────────────────────────────────────

let win:         BrowserWindow | null = null
let paused       = false
let embedded     = false
let loadHandler: (() => Promise<void>) | null = null

function buildVideoPage(filePath: string, volume: number): string {
  // Use forward slashes and proper file:// URL
  const url = 'file:///' + filePath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1:')
  return `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#000;overflow:hidden}video{width:100vw;height:100vh;object-fit:cover}</style>
</head><body>
<video autoplay loop muted playsinline>
  <source src="${url}">
</video>
<script>
  const v=document.querySelector('video')
  v.volume=${volume}
  v.muted=${volume === 0}
  v.play().catch(()=>{})
</script>
</body></html>`
}

async function createWindow(): Promise<BrowserWindow> {
  const { bounds } = screen.getPrimaryDisplay()
  const w = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    frame: false, transparent: false,
    skipTaskbar: true, focusable: false,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })
  w.setIgnoreMouseEvents(true)
  return w
}

async function startEngine(cfg: EngineConfig): Promise<void> {
  if (!cfg.source) return

  const needEmbed = !win || win.isDestroyed()
  if (needEmbed) {
    win = await createWindow()
    embedded = false
  }

  const { source } = cfg

  if (source.type === 'theme') {
    const htmlPath = path.join(getThemeDir(), `${source.id}.html`)
    win.loadFile(htmlPath)
  } else {
    if (!source.path || !fs.existsSync(source.path)) return
    const tmpHtml = path.join(getDataBase(), '_wallpaper-video.html')
    fs.writeFileSync(tmpHtml, buildVideoPage(source.path, cfg.volume))
    win.loadFile(tmpHtml)
  }

  if (!embedded) {
    // Remove any stale handler from a previous startEngine call that hasn't fired yet
    if (loadHandler) { win.webContents.removeListener('did-finish-load', loadHandler); loadHandler = null }
    loadHandler = async () => {
      loadHandler = null
      if (!win || win.isDestroyed()) return
      const hwnd = getHwnd(win)

      // Chromium's GPU swap chain must be initialized BEFORE SetParent.
      // Cross-process reparenting after init preserves the rendering pipeline.
      // Show at opacity 0 to avoid a visible flash before the window is embedded.
      win.setOpacity(0)
      win.showInactive()
      await new Promise(r => setTimeout(r, 500))

      if (!win || win.isDestroyed()) return
      console.log('[wallpaperEngine] embedding hwnd=' + hwnd)
      try {
        await embedInDesktop(hwnd)
        embedded = true
        console.log('[wallpaperEngine] embed done')
      } catch (e) {
        console.error('[wallpaperEngine] embed failed:', e)
      }
      if (!win || win.isDestroyed()) return
      win.setOpacity(1)
    }
    win.webContents.once('did-finish-load', loadHandler)
  }
  paused = false
}

function stopEngine(): void {
  if (win && !win.isDestroyed()) {
    if (loadHandler) { win.webContents.removeListener('did-finish-load', loadHandler) }
    win.destroy()
  }
  win = null
  paused = false
  embedded = false
  loadHandler = null
}

async function execInWin(js: string): Promise<void> {
  if (!win || win.isDestroyed()) return
  try { await win.webContents.executeJavaScript(js) } catch {}
}

// ── IPC ──────────────────────────────────────────────────────────────────────

export function setupWallpaperEngineIPC(): void {
  seedThemes()

  const cfg = loadConfig()
  if (cfg.enabled && cfg.source) startEngine(cfg)

  ipcMain.handle('wallpaper:getThemes',  () => THEMES)
  ipcMain.handle('wallpaper:getConfig',  () => loadConfig())

  ipcMain.handle('wallpaper:setSource', async (_e, source: EngineConfig['source']) => {
    const c = { ...loadConfig(), source, enabled: true }
    saveConfig(c)
    await startEngine(c)
  })

  ipcMain.handle('wallpaper:setEnabled', async (_e, enabled: boolean) => {
    const c = { ...loadConfig(), enabled }
    saveConfig(c)
    if (enabled && c.source) await startEngine(c)
    else stopEngine()
  })

  ipcMain.handle('wallpaper:setVolume', async (_e, volume: number) => {
    const c = { ...loadConfig(), volume }
    saveConfig(c)
    await execInWin(`const v=document.querySelector('video');if(v){v.volume=${volume};v.muted=${volume === 0}}`)
  })

  ipcMain.handle('wallpaper:setPaused', async (_e, p: boolean) => {
    paused = p
    await execInWin(p ? 'document.querySelector("video")?.pause()' : 'document.querySelector("video")?.play()')
  })

  ipcMain.handle('wallpaper:getStatus', () => ({
    active:  !!win && !win.isDestroyed(),
    paused,
    config:  loadConfig(),
  }))

  ipcMain.handle('wallpaper:pickVideo', async () => {
    const result = await dialog.showOpenDialog({
      title:   '选择视频文件',
      filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mkv', 'mov', 'avi'] }],
      properties: ['openFile'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('wallpaper:stop', () => stopEngine())
}

export function shutdownWallpaperEngine(): void { stopEngine() }
