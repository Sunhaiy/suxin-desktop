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
import { app, BrowserWindow, ipcMain, screen, dialog, shell } from 'electron'
import { execFile, spawn } from 'child_process'
import { createHash } from 'crypto'
import ffmpegStatic from 'ffmpeg-static'
import * as https from 'https'
import fs from 'fs'
import path from 'path'
import { getDataBase } from './paths'

// ── HTTP helpers (no key needed) ─────────────────────────────────────────────

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(httpGet(res.headers.location))
          return
        }
        let data = ''
        res.setEncoding('utf8')
        res.on('data', chunk => (data += chunk))
        res.on('end', () => resolve(data))
      }
    )
    req.on('error', reject)
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function httpPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', chunk => (data += chunk))
        res.on('end', () => resolve(data))
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body)
    req.end()
  })
}

// ── Online Workshop browsing ──────────────────────────────────────────────────

export interface OnlineWorkshopItem {
  id: string
  title: string
  previewUrl: string
  workshopUrl: string
  type: 'video' | 'web' | 'other'
  subscriptions: number
  tags: string[]
}

const TYPE_TAGS = new Set(['video', 'web', 'scene', 'application', '2d', '3d'])

function parseWorkshopItems(details: any[]): OnlineWorkshopItem[] {
  return details
    .filter((f: any) => f.result === 1 && f.title && f.preview_url)
    .map((f: any) => {
      const allTags: string[] = (f.tags ?? []).map((t: any) => String(t.tag ?? ''))
      const lower = allTags.map(t => t.toLowerCase())
      let type: OnlineWorkshopItem['type'] = 'other'
      if (lower.includes('video')) type = 'video'
      else if (lower.includes('web')) type = 'web'
      return {
        id: String(f.publishedfileid),
        title: String(f.title),
        previewUrl: String(f.preview_url),
        workshopUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${f.publishedfileid}`,
        type,
        subscriptions: Number(f.subscriptions ?? 0),
        tags: allTags.filter(t => !TYPE_TAGS.has(t.toLowerCase())).slice(0, 4),
      } as OnlineWorkshopItem
    })
    .filter((item: OnlineWorkshopItem) => item.type === 'video' || item.type === 'web')
}

// Primary: Steam Web API QueryFiles — works without a key, accessible from China
async function browseViaAPI(sort: string, page: number): Promise<OnlineWorkshopItem[]> {
  // query_type: 1=most_recent, 3=trending
  const queryType = sort === 'mostrecent' ? 1 : 3
  const url = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/` +
    `?appid=431960&query_type=${queryType}&numperpage=30&page=${page - 1}` +
    `&return_details=1&return_previews=1&return_tags=1&filetype=0`
  const raw = await httpGet(url)
  const data = JSON.parse(raw)
  if (data?.response?.result && data.response.result !== 1) throw new Error('API result ' + data.response.result)
  return parseWorkshopItems(data?.response?.publishedfiledetails ?? [])
}

// Fallback: scrape steamcommunity.com HTML then call GetPublishedFileDetails
// Requires steamcommunity.com to be reachable (blocked in mainland China).
async function browseViaHTML(sort: string, page: number): Promise<OnlineWorkshopItem[]> {
  const url = `https://steamcommunity.com/workshop/browse/?appid=431960&browsesort=${sort}&section=readytousefiles&numperpage=30&p=${page}`
  const html = await httpGet(url)
  const ids: string[] = []
  const re = /filedetails\/\?id=(\d+)/g
  let m
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1])
  }
  if (!ids.length) return []
  const body = ['itemcount=' + ids.length, ...ids.map((id, i) => `publishedfileids[${i}]=${id}`)].join('&')
  const raw = await httpPost('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', body)
  return parseWorkshopItems(JSON.parse(raw)?.response?.publishedfiledetails ?? [])
}

export async function browseOnlineWorkshop(sort: string, page: number): Promise<OnlineWorkshopItem[]> {
  try {
    return await browseViaAPI(sort, page)
  } catch (e) {
    console.warn('[wallpaperEngine] QueryFiles API failed, falling back to HTML scrape:', e)
    return browseViaHTML(sort, page)
  }
}

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

// Fragment shader in a separate <script> tag to avoid backtick nesting.
// Uses animationType="3drotate": the prism tumbles in full 3-D space so each
// face catches the light differently — matches the React Bits Prism demo.
const THEME_PRISM = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#000;overflow:hidden}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style>
</head><body>
<canvas id="c"></canvas>
<script id="frag" type="x-shader/x-fragment">
precision highp float;
uniform vec2  iResolution;
uniform float iTime;
uniform float uHeight;
uniform float uBaseHalf;
uniform mat3  uRot;
uniform int   uUseBaseWobble;
uniform float uGlow;
uniform vec2  uOffsetPx;
uniform float uNoise;
uniform float uSaturation;
uniform float uColorFreq;
uniform float uBloom;
uniform float uCenterShift;
uniform float uInvBaseHalf;
uniform float uInvHeight;
uniform float uMinAxis;
uniform float uPxScale;
uniform float uTimeScale;
vec4 tanh4(vec4 x){vec4 e=exp(2.0*x);return(e-1.0)/(e+1.0);}
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
float sdOctaAnisoInv(vec3 p){
  vec3 q=vec3(abs(p.x)*uInvBaseHalf,abs(p.y)*uInvHeight,abs(p.z)*uInvBaseHalf);
  return(q.x+q.y+q.z-1.0)*uMinAxis*0.5773502692;
}
float sdPyramidUpInv(vec3 p){return max(sdOctaAnisoInv(p),-p.y);}
void main(){
  vec2 f=(gl_FragCoord.xy-0.5*iResolution.xy-uOffsetPx)*uPxScale;
  float z=5.0;vec4 o=vec4(0.0);vec3 p;
  mat2 wob=mat2(1.0);
  if(uUseBaseWobble==1){
    float t=iTime*uTimeScale;
    float c0=cos(t),c1=cos(t+33.0),c2=cos(t+11.0);
    wob=mat2(c0,c1,c2,c0);
  }
  for(int i=0;i<100;i++){
    p=vec3(f,z);p.xz=p.xz*wob;p=uRot*p;
    vec3 q=p;q.y+=uCenterShift;
    float d=0.1+0.2*abs(sdPyramidUpInv(q));
    z-=d;
    o+=(sin((p.y+z)*uColorFreq+vec4(0.0,1.0,2.0,3.0))+1.0)/d;
  }
  o=tanh4(o*o*(uGlow*uBloom)/1e5);
  vec3 col=o.rgb+(rand(gl_FragCoord.xy+vec2(iTime))-0.5)*uNoise;
  col=clamp(col,0.0,1.0);
  float L=dot(col,vec3(0.2126,0.7152,0.0722));
  col=clamp(mix(vec3(L),col,uSaturation),0.0,1.0);
  gl_FragColor=vec4(col,1.0);
}
<\/script>
<script>
(function(){
  var C=document.getElementById('c');
  var gl=C.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false});
  if(!gl){document.body.style.background='#111';return;}
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);

  var VS='attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
  var FS=document.getElementById('frag').textContent;

  function sh(type,src){
    var s=gl.createShader(type);
    gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog=gl.createProgram();
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));
  gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));
  gl.linkProgram(prog);gl.useProgram(prog);

  var buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  var aPos=gl.getAttribLocation(prog,'position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos,2,gl.FLOAT,false,0,0);

  var names=['iResolution','iTime','uHeight','uBaseHalf','uRot','uUseBaseWobble',
    'uGlow','uOffsetPx','uNoise','uSaturation','uColorFreq','uBloom',
    'uCenterShift','uInvBaseHalf','uInvHeight','uMinAxis','uPxScale','uTimeScale'];
  var U={};
  names.forEach(function(n){U[n]=gl.getUniformLocation(prog,n);});

  // Exact React Bits defaults (transparent=true → SAT=1.5)
  var H=3.5,BW=5.5,BH=BW*0.5,GLOW=1.0,NOISE=0.5,SCALE=3.6,CFREQ=1.0,BLOOM=1.0,TS=0.5,SAT=1.5;

  gl.uniform1f(U.uHeight,H);
  gl.uniform1f(U.uBaseHalf,BH);
  gl.uniform1i(U.uUseBaseWobble,0);
  gl.uniform1f(U.uGlow,GLOW);
  gl.uniform2f(U.uOffsetPx,0,0);
  gl.uniform1f(U.uNoise,NOISE);
  gl.uniform1f(U.uSaturation,SAT);
  gl.uniform1f(U.uColorFreq,CFREQ);
  gl.uniform1f(U.uBloom,BLOOM);
  gl.uniform1f(U.uCenterShift,H*0.25);
  gl.uniform1f(U.uInvBaseHalf,1/BH);
  gl.uniform1f(U.uInvHeight,1/H);
  gl.uniform1f(U.uMinAxis,Math.min(BH,H));
  gl.uniform1f(U.uTimeScale,TS);

  function resize(){
    C.width=window.innerWidth;C.height=window.innerHeight;
    gl.viewport(0,0,C.width,C.height);
    gl.uniform2f(U.iResolution,C.width,C.height);
    gl.uniform1f(U.uPxScale,1/(C.height*0.1*SCALE));
  }
  window.addEventListener('resize',resize);resize();

  // 3drotate: randomise angular speeds and phase offsets each session
  var wX=0.3+Math.random()*0.6;
  var wY=0.2+Math.random()*0.7;
  var wZ=0.1+Math.random()*0.5;
  var phX=Math.random()*Math.PI*2;
  var phZ=Math.random()*Math.PI*2;
  var rotBuf=new Float32Array(9);

  // Build YXZ Euler rotation matrix in column-major order for WebGL
  function setMat3FromEuler(yY,pX,rZ,out){
    var cy=Math.cos(yY),sy=Math.sin(yY);
    var cx=Math.cos(pX),sx=Math.sin(pX);
    var cz=Math.cos(rZ),sz=Math.sin(rZ);
    out[0]=cy*cz+sy*sx*sz; out[1]=cx*sz;            out[2]=-sy*cz+cy*sx*sz;
    out[3]=-cy*sz+sy*sx*cz;out[4]=cx*cz;             out[5]=sy*sz+cy*sx*cz;
    out[6]=sy*cx;           out[7]=-sx;               out[8]=cy*cx;
    return out;
  }

  var t0=performance.now();
  function frame(){
    var time=(performance.now()-t0)*0.001;
    var ts=time*TS;
    var yaw=ts*wY;
    var pitch=Math.sin(ts*wX+phX)*0.6;
    var roll=Math.sin(ts*wZ+phZ)*0.5;
    gl.uniformMatrix3fv(U.uRot,false,setMat3FromEuler(yaw,pitch,roll,rotBuf));
    gl.uniform1f(U.iTime,time);
    gl.drawArrays(gl.TRIANGLES,0,3);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
<\/script>
</body></html>`

// DarkVeil: CPPN-based organic neural-network background (React Bits).
// Shader weights are baked in; no npm dependency needed.
const THEME_DARKVEIL = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#000;overflow:hidden}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style>
</head><body>
<canvas id="c"></canvas>
<script id="frag" type="x-shader/x-fragment">
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uHueShift;
uniform float uNoise;
uniform float uScan;
uniform float uScanFreq;
uniform float uWarp;
#define iTime uTime
#define iResolution uResolution
vec4 buf[8];
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
mat3 rgb2yiq=mat3(0.299,0.587,0.114,0.596,-0.274,-0.322,0.211,-0.523,0.312);
mat3 yiq2rgb=mat3(1.0,0.956,0.621,1.0,-0.272,-0.647,1.0,-1.106,1.703);
vec3 hueShiftRGB(vec3 col,float deg){
  vec3 yiq=rgb2yiq*col;
  float rad=radians(deg);float ch=cos(rad),sh=sin(rad);
  return clamp(yiq2rgb*vec3(yiq.x,yiq.y*ch-yiq.z*sh,yiq.y*sh+yiq.z*ch),0.0,1.0);
}
vec4 sigmoid(vec4 x){return 1./(1.+exp(-x));}
vec4 cppn_fn(vec2 co,float in0,float in1,float in2){
  buf[6]=vec4(co.x,co.y,0.3948333106474662+in0,0.36+in1);
  buf[7]=vec4(0.14+in2,sqrt(co.x*co.x+co.y*co.y),0.,0.);
  buf[0]=mat4(vec4(6.5404263,-3.6126034,0.7590882,-1.13613),vec4(2.4582713,3.1660357,1.2219609,0.06276096),vec4(-5.478085,-6.159632,1.8701609,-4.7742867),vec4(6.039214,-5.542865,-0.90925294,3.251348))*buf[6]+mat4(vec4(0.8473259,-5.722911,3.975766,1.6522468),vec4(-0.24321538,0.5839259,-1.7661959,-5.350116),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(0.21808943,1.1243913,-1.7969975,5.0294676);
  buf[1]=mat4(vec4(-3.3522482,-6.0612736,0.55641043,-4.4719114),vec4(0.8631464,1.7432913,5.643898,1.6106541),vec4(2.4941394,-3.5012043,1.7184316,6.357333),vec4(3.310376,8.209261,1.1355612,-1.165539))*buf[6]+mat4(vec4(5.24046,-13.034365,0.009859298,15.870829),vec4(2.987511,3.129433,-0.89023495,-1.6822904),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-5.9457836,-6.573602,-0.8812491,1.5436668);
  buf[0]=sigmoid(buf[0]);buf[1]=sigmoid(buf[1]);
  buf[2]=mat4(vec4(-15.219568,8.095543,-2.429353,-1.9381982),vec4(-5.951362,4.3115187,2.6393783,1.274315),vec4(-7.3145227,6.7297835,5.2473326,5.9411426),vec4(5.0796127,8.979051,-1.7278991,-1.158976))*buf[6]+mat4(vec4(-11.967154,-11.608155,6.1486754,11.237008),vec4(2.124141,-6.263192,-1.7050359,-0.7021966),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-4.17164,-3.2281182,-4.576417,-3.6401186);
  buf[3]=mat4(vec4(3.1832156,-13.738922,1.879223,3.233465),vec4(0.64300746,12.768129,1.9141049,0.50990224),vec4(-0.049295485,4.4807224,1.4733979,1.801449),vec4(5.0039253,13.000481,3.3991797,-4.5561905))*buf[6]+mat4(vec4(-0.1285731,7.720628,-3.1425676,4.742367),vec4(0.6393625,3.714393,-0.8108378,-0.39174938),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-1.1811101,-21.621881,0.7851888,1.2329718);
  buf[2]=sigmoid(buf[2]);buf[3]=sigmoid(buf[3]);
  buf[4]=mat4(vec4(5.214916,-7.183024,2.7228765,2.6592617),vec4(-5.601878,-25.3591,4.067988,0.4602802),vec4(-10.57759,24.286327,21.102104,37.546658),vec4(4.3024497,-1.9625226,2.3458803,-1.372816))*buf[0]+mat4(vec4(-17.6526,-10.507558,2.2587414,12.462782),vec4(6.265566,-502.75443,-12.642513,0.9112289),vec4(-10.983244,20.741234,-9.701768,-0.7635988),vec4(5.383626,1.4819539,-4.1911616,-4.8444734))*buf[1]+mat4(vec4(12.785233,-16.345072,-0.39901125,1.7955981),vec4(-30.48365,-1.8345358,1.4542528,-1.1118771),vec4(19.872723,-7.337935,-42.941723,-98.52709),vec4(8.337645,-2.7312303,-2.2927687,-36.142323))*buf[2]+mat4(vec4(-16.298317,3.5471997,-0.44300047,-9.444417),vec4(57.5077,-35.609753,16.163465,-4.1534753),vec4(-0.07470326,-3.8656476,-7.0901804,3.1523974),vec4(-12.559385,-7.077619,1.490437,-0.8211543))*buf[3]+vec4(-7.67914,15.927437,1.3207729,-1.6686112);
  buf[5]=mat4(vec4(-1.4109162,-0.372762,-3.770383,-21.367174),vec4(-6.2103205,-9.35908,0.92529047,8.82561),vec4(11.460242,-22.348068,13.625772,-18.693201),vec4(-0.3429052,-3.9905605,-2.4626114,-0.45033523))*buf[0]+mat4(vec4(7.3481627,-4.3661838,-6.3037653,-3.868115),vec4(1.5462853,6.5488915,1.9701879,-0.58291394),vec4(6.5858274,-2.2180402,3.7127688,-1.3730392),vec4(-5.7973905,10.134961,-2.3395722,-5.965605))*buf[1]+mat4(vec4(-2.5132585,-6.6685553,-1.4029363,-0.16285264),vec4(-0.37908727,0.53738135,4.389061,-1.3024765),vec4(-0.70647055,2.0111287,-5.1659346,-3.728635),vec4(-13.562562,10.487719,-0.9173751,-2.6487076))*buf[2]+mat4(vec4(-8.645013,6.5546675,-6.3944063,-5.5933375),vec4(-0.57783127,-1.077275,36.91025,5.736769),vec4(14.283112,3.7146652,7.1452246,-4.5958776),vec4(2.7192075,3.6021907,-4.366337,-2.3653464))*buf[3]+vec4(-5.9000807,-4.329569,1.2427121,8.59503);
  buf[4]=sigmoid(buf[4]);buf[5]=sigmoid(buf[5]);
  buf[6]=mat4(vec4(-1.61102,0.7970257,1.4675229,0.20917463),vec4(-28.793737,-7.1390953,1.5025433,4.656581),vec4(-10.94861,39.66238,0.74318546,-10.095605),vec4(-0.7229728,-1.5483948,0.7301322,2.1687684))*buf[0]+mat4(vec4(3.2547753,21.489103,-1.0194173,-3.3100595),vec4(-3.7316632,-3.3792162,-7.223193,-0.23685838),vec4(13.1804495,0.7916005,5.338587,5.687114),vec4(-4.167605,-17.798311,-6.815736,-1.6451967))*buf[1]+mat4(vec4(0.604885,-7.800309,-7.213122,-2.741014),vec4(-3.522382,-0.12359311,-0.5258442,0.43852118),vec4(9.6752825,-22.853785,2.062431,0.099892326),vec4(-4.3196306,-17.730087,2.5184598,5.30267))*buf[2]+mat4(vec4(-6.545563,-15.790176,-6.0438633,-5.415399),vec4(-43.591583,28.551912,-16.00161,18.84728),vec4(4.212382,8.394307,3.0958717,8.657522),vec4(-5.0237565,-4.450633,-4.4768,-5.5010443))*buf[3]+mat4(vec4(1.6985557,-67.05806,6.897715,1.9004834),vec4(1.8680354,2.3915145,2.5231109,4.081538),vec4(11.158006,1.7294737,2.0738268,7.386411),vec4(-4.256034,-306.24686,8.258898,-17.132736))*buf[4]+mat4(vec4(1.6889864,-4.5852966,3.8534803,-6.3482175),vec4(1.3543309,-1.2640043,9.932754,2.9079645),vec4(-5.2770967,0.07150358,-0.13962056,3.3269649),vec4(28.34703,-4.918278,6.1044083,4.085355))*buf[5]+vec4(6.6818056,12.522166,-3.7075126,-4.104386);
  buf[7]=mat4(vec4(-8.265602,-4.7027016,5.098234,0.7509808),vec4(8.6507845,-17.15949,16.51939,-8.884479),vec4(-4.036479,-2.3946867,-2.6055532,-1.9866527),vec4(-2.2167742,-1.8135649,-5.9759874,4.8846445))*buf[0]+mat4(vec4(6.7790847,3.5076547,-2.8191125,-2.7028968),vec4(-5.743024,-0.27844876,1.4958696,-5.0517144),vec4(13.122226,15.735168,-2.9397483,-4.101023),vec4(-14.375265,-5.030483,-6.2599335,2.9848232))*buf[1]+mat4(vec4(4.0950394,-0.94011575,-5.674733,4.755022),vec4(4.3809423,4.8310084,1.7425908,-3.437416),vec4(2.117492,0.16342592,-104.56341,16.949184),vec4(-5.22543,-2.994248,3.8350096,-1.9364246))*buf[2]+mat4(vec4(-5.900337,1.7946124,-13.604192,-3.8060522),vec4(6.6583457,31.911177,25.164474,91.81147),vec4(11.840538,4.1503043,-0.7314397,6.768467),vec4(-6.3967767,4.034772,6.1714606,-0.32874924))*buf[3]+mat4(vec4(3.4992442,-196.91893,-8.923708,2.8142626),vec4(3.4806502,-3.1846354,5.1725626,5.1804223),vec4(-2.4009497,15.585794,1.2863957,2.0252278),vec4(-71.25271,-62.441242,-8.138444,0.50670296))*buf[4]+mat4(vec4(-12.291733,-11.176166,-7.3474145,4.390294),vec4(10.805477,5.6337385,-0.9385842,-4.7348723),vec4(-12.869276,-7.039391,5.3029537,7.5436664),vec4(1.4593618,8.91898,3.5101583,5.840625))*buf[5]+vec4(2.2415268,-6.705987,-0.98861027,-2.117676);
  buf[6]=sigmoid(buf[6]);buf[7]=sigmoid(buf[7]);
  buf[0]=mat4(vec4(1.6794263,1.3817469,2.9625452,0.),vec4(-1.8834411,-1.4806935,-3.5924516,0.),vec4(-1.3279216,-1.0918057,-2.3124623,0.),vec4(0.2662234,0.23235129,0.44178495,0.))*buf[0]+mat4(vec4(-0.6299101,-0.5945583,-0.9125601,0.),vec4(0.17828953,0.18300213,0.18182953,0.),vec4(-2.96544,-2.5819945,-4.9001055,0.),vec4(1.4195864,1.1868085,2.5176322,0.))*buf[1]+mat4(vec4(-1.2584374,-1.0552157,-2.1688404,0.),vec4(-0.7200217,-0.52666044,-1.438251,0.),vec4(0.15345335,0.15196142,0.272854,0.),vec4(0.945728,0.8861938,1.2766753,0.))*buf[2]+mat4(vec4(-2.4218085,-1.968602,-4.35166,0.),vec4(-22.683098,-18.0544,-41.954372,0.),vec4(0.63792,0.5470648,1.1078634,0.),vec4(-1.5489894,-1.3075932,-2.6444845,0.))*buf[3]+mat4(vec4(-0.49252132,-0.39877754,-0.91366625,0.),vec4(0.95609266,0.7923952,1.640221,0.),vec4(0.30616966,0.15693925,0.8639857,0.),vec4(1.1825981,0.94504964,2.176963,0.))*buf[4]+mat4(vec4(0.35446745,0.3293795,0.59547555,0.),vec4(-0.58784515,-0.48177817,-1.0614829,0.),vec4(2.5271258,1.9991658,4.6846647,0.),vec4(0.13042648,0.08864098,0.30187556,0.))*buf[5]+mat4(vec4(-1.7718065,-1.4033192,-3.3355875,0.),vec4(3.1664357,2.638297,5.378702,0.),vec4(-3.1724713,-2.6107926,-5.549295,0.),vec4(-2.851368,-2.249092,-5.3013067,0.))*buf[6]+mat4(vec4(1.5203838,1.2212278,2.8404984,0.),vec4(1.5210563,1.2651345,2.683903,0.),vec4(2.9789467,2.4364579,5.2347264,0.),vec4(2.2270417,1.8825914,3.8028636,0.))*buf[7]+vec4(-1.5468478,-3.6171484,0.24762098,0.);
  buf[0]=sigmoid(buf[0]);
  return vec4(buf[0].x,buf[0].y,buf[0].z,1.);
}
void mainImage(out vec4 fragColor,in vec2 fragCoord){
  vec2 uv=fragCoord/iResolution.xy*2.-1.;
  uv.y*=-1.;
  uv+=uWarp*vec2(sin(uv.y*6.2832+iTime*0.5),cos(uv.x*6.2832+iTime*0.5))*0.05;
  fragColor=cppn_fn(uv,0.1*sin(0.3*iTime),0.1*sin(0.69*iTime),0.1*sin(0.44*iTime));
}
void main(){
  vec4 col;mainImage(col,gl_FragCoord.xy);
  col.rgb=hueShiftRGB(col.rgb,uHueShift);
  float sv=sin(gl_FragCoord.y*uScanFreq)*0.5+0.5;
  col.rgb*=1.-(sv*sv)*uScan;
  col.rgb+=(rand(gl_FragCoord.xy+uTime)-0.5)*uNoise;
  gl_FragColor=vec4(clamp(col.rgb,0.0,1.0),1.0);
}
<\/script>
<script>
(function(){
  var C=document.getElementById('c');
  var gl=C.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false});
  if(!gl){document.body.style.background='#111';return;}
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  var VS='attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
  var FS=document.getElementById('frag').textContent;
  function sh(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(s));return s;}
  var prog=gl.createProgram();
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));
  gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));
  gl.linkProgram(prog);gl.useProgram(prog);
  var buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  var aPos=gl.getAttribLocation(prog,'position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos,2,gl.FLOAT,false,0,0);
  var uRes=gl.getUniformLocation(prog,'uResolution');
  var uTime=gl.getUniformLocation(prog,'uTime');
  gl.uniform1f(gl.getUniformLocation(prog,'uHueShift'),0.0);
  gl.uniform1f(gl.getUniformLocation(prog,'uNoise'),0.015);
  gl.uniform1f(gl.getUniformLocation(prog,'uScan'),0.0);
  gl.uniform1f(gl.getUniformLocation(prog,'uScanFreq'),80.0);
  gl.uniform1f(gl.getUniformLocation(prog,'uWarp'),0.5);
  function resize(){C.width=window.innerWidth;C.height=window.innerHeight;gl.viewport(0,0,C.width,C.height);gl.uniform2f(uRes,C.width,C.height);}
  window.addEventListener('resize',resize);resize();
  var t0=performance.now(),SPEED=0.5;
  function frame(){gl.uniform1f(uTime,(performance.now()-t0)*0.001*SPEED);gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
})();
<\/script>
</body></html>`

// FloatingLines: three-layer undulating coloured wave lines (React Bits).
// Rewritten as pure WebGL: loop bounds are #define constants (GLSL ES 1.0 compatible).
const THEME_FLOATINGLINES = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:#000;overflow:hidden}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style>
</head><body>
<canvas id="c"></canvas>
<script id="frag" type="x-shader/x-fragment">
precision highp float;
uniform vec2  uResolution;
uniform float uTime;
#define BOT_N  8
#define MID_N 14
#define TOP_N  8
mat2 rot(float r){return mat2(cos(r),sin(r),-sin(r),cos(r));}
vec3 grad(float t){
  vec3 a=vec3(0.482,0.184,1.0);
  vec3 b=vec3(1.0,0.431,0.776);
  vec3 c=vec3(0.118,0.937,1.0);
  t=clamp(t,0.0,1.0);
  if(t<0.5)return mix(a,b,t*2.0);
  return mix(b,c,(t-0.5)*2.0);
}
float wave(vec2 uv,float off){
  float amp=sin(off+uTime*0.2)*0.3;
  float y=sin(uv.x+off+uTime*0.1)*amp;
  float m=uv.y-y;
  return 0.0175/max(abs(m)+0.01,1e-3)+0.01;
}
void main(){
  vec2 uv=(2.0*gl_FragCoord.xy-uResolution)/uResolution.y;
  uv.y*=-1.0;
  vec3 col=vec3(0.0);
  for(int i=0;i<BOT_N;i++){
    float fi=float(i),t=fi/float(BOT_N-1);
    vec2 r=uv*rot(-1.0*log(length(uv)+1.0));
    col+=grad(t)*wave(r+vec2(0.045*fi+2.0,-0.7),1.5+0.2*fi)*0.18;
  }
  for(int i=0;i<MID_N;i++){
    float fi=float(i),t=fi/float(MID_N-1);
    vec2 r=uv*rot(0.2*log(length(uv)+1.0));
    col+=grad(t)*wave(r+vec2(0.055*fi+5.0,0.0),2.0+0.15*fi)*0.75;
  }
  for(int i=0;i<TOP_N;i++){
    float fi=float(i),t=fi/float(TOP_N-1);
    vec2 r=uv*rot(-0.4*log(length(uv)+1.0));
    r.x*=-1.0;
    col+=grad(t)*wave(r+vec2(0.07*fi+10.0,0.5),1.0+0.2*fi)*0.09;
  }
  gl_FragColor=vec4(col,1.0);
}
<\/script>
<script>
(function(){
  var C=document.getElementById('c');
  var gl=C.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false});
  if(!gl){document.body.style.background='#111';return;}
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  var VS='attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
  var FS=document.getElementById('frag').textContent;
  function sh(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(s));return s;}
  var prog=gl.createProgram();
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));
  gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));
  gl.linkProgram(prog);gl.useProgram(prog);
  var buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  var aPos=gl.getAttribLocation(prog,'position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos,2,gl.FLOAT,false,0,0);
  var uRes=gl.getUniformLocation(prog,'uResolution');
  var uTime=gl.getUniformLocation(prog,'uTime');
  function resize(){C.width=window.innerWidth;C.height=window.innerHeight;gl.viewport(0,0,C.width,C.height);gl.uniform2f(uRes,C.width,C.height);}
  window.addEventListener('resize',resize);resize();
  var t0=performance.now(),SPEED=0.8;
  function frame(){gl.uniform1f(uTime,(performance.now()-t0)*0.001*SPEED);gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
})();
<\/script>
</body></html>`

// ── Theme catalog ────────────────────────────────────────────────────────────

export interface WallpaperTheme {
  id:     string
  name:   string
  desc:   string
  colors: string[]   // gradient preview colors
}

export const THEMES: WallpaperTheme[] = [
  { id: 'matrix',    name: '数字雨',   desc: '经典黑客风格绿色矩阵',      colors: ['#000','#001a00','#00ff41'] },
  { id: 'particles', name: '粒子网络', desc: '浮动粒子连线构成的星云',      colors: ['#0a0f1e','#1d4ed8','#7dd3fc'] },
  { id: 'aurora',    name: '极光',     desc: '流动的北极光彩带',           colors: ['#000','#064e3b','#7c4dff','#e040fb'] },
  { id: 'stars',     name: '星际穿越', desc: '深空高速穿越星场',           colors: ['#000','#0a0a1a','#6060ff'] },
  { id: 'geometric', name: '几何流',   desc: '漂浮变换的几何形体',         colors: ['#0a0010','#7c3aed','#f59e0b'] },
  { id: 'prism',        name: '棱镜',   desc: '七彩光棱镜 WebGL 折射效果',      colors: ['#000014','#5500ff','#ff0066','#00ffcc'] },
  { id: 'darkveil',     name: '暗纱',   desc: 'CPPN 神经网络生成有机暗色动态纹理', colors: ['#000010','#1a0033','#cc44aa','#0077cc'] },
  { id: 'floatinglines',name: '流光线', desc: '三层紫粉青彩色流动曲线叠加',       colors: ['#000013','#7b2fff','#ff6ec7','#00eeff'] },
]

const THEME_HTML: Record<string, string> = {
  matrix:    THEME_MATRIX,
  particles: THEME_PARTICLES,
  aurora:    THEME_AURORA,
  stars:     THEME_STARS,
  geometric: THEME_GEOMETRIC,
  prism:         THEME_PRISM,
  darkveil:      THEME_DARKVEIL,
  floatinglines: THEME_FLOATINGLINES,
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
    // Always overwrite 'prism' so parameter updates take effect immediately
    if (id === 'prism' || !fs.existsSync(p)) fs.writeFileSync(p, html, 'utf8')
  }
}

function getConfigPath(): string { return path.join(getDataBase(), 'wallpaper-engine-config.json') }

interface EngineConfig {
  enabled: boolean
  source?: { type: 'theme' | 'video' | 'web'; id: string; path?: string }
  volume:  number
}

function loadConfig(): EngineConfig {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) as EngineConfig & {
      source?: { type?: string; id?: string; path?: string }
    }
    // Older builds delegated proprietary Workshop scenes to Wallpaper Engine.
    // This app now stays fully independent, so discard that legacy source.
    if (config.source && !['theme', 'video', 'web'].includes(config.source.type ?? '')) {
      return { enabled: false, volume: Number(config.volume) || 0 }
    }
    return config as EngineConfig
  }
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
<video autoplay loop playsinline>
  <source src="${url}">
</video>
<script>
  const v=document.querySelector('video')
  v.defaultMuted=false
  v.volume=${volume}
  v.muted=${volume === 0}
  v.play().catch(()=>{})
</script>
</body></html>`
}

function getFfmpegPath(): string {
  const bundled = String(ffmpegStatic ?? '')
  const unpacked = bundled.replace('app.asar', 'app.asar.unpacked')
  if (unpacked && fs.existsSync(unpacked)) return unpacked
  if (bundled && fs.existsSync(bundled)) return bundled
  throw new Error('缺少视频兼容组件 FFmpeg')
}

function videoNeedsConversion(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.webm') return false
  if (!['.mp4', '.m4v', '.mov'].includes(ext)) return true
  try {
    const stat = fs.statSync(filePath)
    const size = Math.min(stat.size, 2 * 1024 * 1024)
    const fd = fs.openSync(filePath, 'r')
    const head = Buffer.alloc(size)
    const tail = Buffer.alloc(size)
    fs.readSync(fd, head, 0, size, 0)
    fs.readSync(fd, tail, 0, size, Math.max(0, stat.size - size))
    fs.closeSync(fd)
    const markers = Buffer.concat([head, tail]).toString('latin1')
    return /mp4v|hvc1|hev1|av01/.test(markers)
  } catch { return false }
}

const conversionJobs = new Map<string, Promise<string>>()
let conversionTail: Promise<unknown> = Promise.resolve()
const backgroundConversionQueue: string[] = []
const queuedConversions = new Set<string>()
let backgroundConversionRunning = false

async function convertVideoForChromium(filePath: string): Promise<string> {
  if (!videoNeedsConversion(filePath)) return filePath
  const stat = fs.statSync(filePath)
  const key = createHash('sha1').update(`${filePath}|${stat.size}|${stat.mtimeMs}`).digest('hex')
  let cacheDir = path.join(getDataBase(), 'wallpaper-video-cache')
  try { fs.mkdirSync(cacheDir, { recursive: true }) }
  catch {
    cacheDir = path.join(app.getPath('userData'), 'wallpaper-video-cache')
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  // Version the cache by quality profile so older CRF 20 conversions are never reused.
  const output = path.join(cacheDir, `${key}-hq2.mp4`)
  const legacyOutput = path.join(cacheDir, `${key}.mp4`)
  try { if (fs.existsSync(legacyOutput)) fs.unlinkSync(legacyOutput) } catch {}
  if (fs.existsSync(output) && fs.statSync(output).size > 1024) return output
  const temp = `${output}.tmp.mp4`
  try { if (fs.existsSync(temp)) fs.unlinkSync(temp) } catch {}
  await new Promise<void>((resolve, reject) => {
    const child = spawn(getFfmpegPath(), [
      '-y', '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', filePath,
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-preset', 'slow', '-crf', '12', '-c:a', 'aac', '-b:a', '256k',
      '-movflags', '+faststart', temp,
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''
    child.stderr?.on('data', chunk => { error += chunk.toString().slice(-4000) })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(error || `FFmpeg exited with ${code}`)))
  })
  fs.renameSync(temp, output)
  return output
}

function ensureChromiumPlayable(filePath: string): Promise<string> {
  const active = conversionJobs.get(filePath)
  if (active) return active
  const job = conversionTail
    .catch(() => {})
    .then(() => convertVideoForChromium(filePath))
    .finally(() => conversionJobs.delete(filePath))
  conversionTail = job
  conversionJobs.set(filePath, job)
  return job
}

async function runBackgroundConversions(): Promise<void> {
  if (backgroundConversionRunning) return
  backgroundConversionRunning = true
  try {
    while (backgroundConversionQueue.length) {
      const file = backgroundConversionQueue.shift()!
      queuedConversions.delete(file)
      try {
        console.log('[wallpaperEngine] background converting:', file)
        await ensureChromiumPlayable(file)
        console.log('[wallpaperEngine] background conversion done:', file)
      } catch (error) {
        console.error('[wallpaperEngine] background conversion failed:', file, error)
      }
    }
  } finally {
    backgroundConversionRunning = false
  }
}

function queueBackgroundConversions(files: string[]): void {
  for (const file of files) {
    if (!videoNeedsConversion(file) || queuedConversions.has(file) || conversionJobs.has(file)) continue
    queuedConversions.add(file)
    backgroundConversionQueue.push(file)
  }
  void runBackgroundConversions()
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

  const { source } = cfg

  const needEmbed = !win || win.isDestroyed()
  if (needEmbed) {
    win = await createWindow()
    embedded = false
  }
  const wallpaperWindow = win
  if (!wallpaperWindow) return

  wallpaperWindow.webContents.setAudioMuted(cfg.volume === 0)
  wallpaperWindow.webContents.once('did-finish-load', () => { void applyEngineVolume(cfg.volume) })

  if (source.type === 'theme') {
    const htmlPath = path.join(getThemeDir(), `${source.id}.html`)
    wallpaperWindow.loadFile(htmlPath)
  } else if (source.type === 'web') {
    // Wallpaper Engine web-type: load the HTML file directly from its own directory
    if (!source.path || !fs.existsSync(source.path)) return
    wallpaperWindow.loadFile(source.path)
  } else {
    if (!source.path || !fs.existsSync(source.path)) return
    const tmpHtml = path.join(getDataBase(), '_wallpaper-video.html')
    fs.writeFileSync(tmpHtml, buildVideoPage(source.path, cfg.volume))
    wallpaperWindow.loadFile(tmpHtml)
  }

  if (!embedded) {
    // Remove any stale handler from a previous startEngine call that hasn't fired yet
    if (loadHandler) { wallpaperWindow.webContents.removeListener('did-finish-load', loadHandler); loadHandler = null }
    loadHandler = async () => {
      loadHandler = null
      let target = win
      if (!target || target.isDestroyed()) return
      const hwnd = getHwnd(target)

      // Chromium's GPU swap chain must be initialized BEFORE SetParent.
      // Cross-process reparenting after init preserves the rendering pipeline.
      // Show at opacity 0 to avoid a visible flash before the window is embedded.
      target.setOpacity(0)
      target.showInactive()
      await new Promise(r => setTimeout(r, 500))

      target = win
      if (!target || target.isDestroyed()) return
      console.log('[wallpaperEngine] embedding hwnd=' + hwnd)
      try {
        await embedInDesktop(hwnd)
        embedded = true
        console.log('[wallpaperEngine] embed done')
      } catch (e) {
        console.error('[wallpaperEngine] embed failed:', e)
      }
      target = win
      if (!target || target.isDestroyed()) return
      target.setOpacity(1)
    }
    wallpaperWindow.webContents.once('did-finish-load', loadHandler)
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

async function applyEngineVolume(volume: number): Promise<void> {
  if (!win || win.isDestroyed()) return
  const value = Math.max(0, Math.min(1, Number(volume) || 0))

  // Chromium has both a WebContents mute flag and per-element mute flags.
  // Keep them in sync so a muted autoplay does not remain silent until reload.
  win.webContents.setAudioMuted(value === 0)
  await execInWin(`
    (() => {
      const volume = ${value};
      document.querySelectorAll('video, audio').forEach(media => {
        media.defaultMuted = false;
        media.muted = volume === 0;
        media.volume = volume;
      });
    })()
  `)
}

// ── Steam Workshop scanner ────────────────────────────────────────────────────

export interface WorkshopItem {
  id:          string
  title:       string
  type:        'video' | 'web'
  file:        string   // absolute video or HTML path
  preview:     string   // local-img:// URL (may be empty)
  tags:        string[]
  description: string
}

export interface WorkshopScanResult {
  directory: string
  items: WorkshopItem[]
}

const WE_APP_ID = '431960'

function execFileText(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (err, stdout) => err ? reject(err) : resolve(stdout))
  })
}

async function readRegistryPath(key: string, value: string): Promise<string | null> {
  try {
    const stdout = await execFileText('reg', ['query', key, '/v', value])
    const match = stdout.match(new RegExp(`${value}\\s+REG_SZ\\s+(.+)`, 'i'))
    return match?.[1]?.trim() ?? null
  } catch { return null }
}

// Steam may live in a custom folder and Workshop content may live in another
// library. Read both registry locations and every libraryfolders.vdf we find.
async function getSteamLibraries(): Promise<string[]> {
  const candidates: string[] = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'E:\\Steam',
    'F:\\Steam',
  ]

  const registryPaths = await Promise.all([
    readRegistryPath('HKCU\\Software\\Valve\\Steam', 'SteamPath'),
    readRegistryPath('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'),
  ])
  for (const p of registryPaths) if (p) candidates.unshift(p)

  const libraries = new Set<string>()
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue
    libraries.add(path.resolve(base))
    const vdf = path.join(base, 'steamapps', 'libraryfolders.vdf')
    if (!fs.existsSync(vdf)) continue
    try {
      const content = fs.readFileSync(vdf, 'utf8')
      for (const match of content.matchAll(/"path"\s+"([^"]+)"/g)) {
        libraries.add(path.resolve(match[1].replace(/\\\\/g, '\\')))
      }
    } catch {}
  }
  return [...libraries]
}

async function findWorkshopDir(): Promise<string | null> {
  for (const library of await getSteamLibraries()) {
    const dir = path.join(library, 'steamapps', 'workshop', 'content', WE_APP_ID)
    if (fs.existsSync(dir)) return dir
  }
  return null
}

function safeItemPath(itemDir: string, relativePath: string): string | null {
  const resolved = path.resolve(itemDir, relativePath)
  const prefix = path.resolve(itemDir) + path.sep
  return resolved.startsWith(prefix) && fs.existsSync(resolved) ? resolved : null
}

export async function scanWorkshopItems(): Promise<WorkshopScanResult> {
  const workshopDir = await findWorkshopDir()
  if (!workshopDir) return { directory: '', items: [] }

  if (!fs.existsSync(workshopDir)) return { directory: '', items: [] }

  const items: WorkshopItem[] = []

  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(workshopDir, { withFileTypes: true }) }
  catch { return { directory: workshopDir, items: [] } }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const itemDir = path.join(workshopDir, entry.name)
    const projFile = path.join(itemDir, 'project.json')
    if (!fs.existsSync(projFile)) continue

    try {
      const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'))
      const type = (proj.type ?? '').toLowerCase()
      if (type !== 'video' && type !== 'web') continue

      // Resolve main file
      const fileName = proj.file ?? (type === 'video' ? 'video.mp4' : 'index.html')
      const file = safeItemPath(itemDir, String(fileName))
      if (!file) continue

      // Resolve preview image
      let preview = ''
      const previewNames = [proj.preview, 'preview.gif', 'preview.png', 'preview.jpg', 'preview.jpeg']
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
      for (const name of previewNames) {
        const p = safeItemPath(itemDir, name)
        if (p) {
          preview = `local-img://local?p=${encodeURIComponent(p.replace(/\\/g, '/'))}`
          break
        }
      }

      items.push({
        id:          entry.name,
        title:       proj.title ?? entry.name,
        type:        type as WorkshopItem['type'],
        file,
        preview,
        tags:        Array.isArray(proj.tags) ? proj.tags : [],
        description: proj.description ?? '',
      })
    } catch {}
  }

  const sortedItems = items.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  queueBackgroundConversions(sortedItems.filter(item => item.type === 'video').map(item => item.file))

  return {
    directory: workshopDir,
    items: sortedItems,
  }
}

// ── IPC ──────────────────────────────────────────────────────────────────────

export function setupWallpaperEngineIPC(): void {
  seedThemes()

  const cfg = loadConfig()
  if (cfg.enabled && cfg.source) startEngine(cfg)

  ipcMain.handle('wallpaper:getThemes',  () => THEMES)
  ipcMain.handle('wallpaper:getConfig',  () => loadConfig())

  ipcMain.handle('wallpaper:setSource', async (_e, source: EngineConfig['source']) => {
    if (!source) return null
    const prepared = source.type === 'video' && source.path
      ? { ...source, path: await ensureChromiumPlayable(source.path) }
      : source
    const c = { ...loadConfig(), source: prepared, enabled: true }
    saveConfig(c)
    await startEngine(c)
    return prepared
  })

  ipcMain.handle('wallpaper:setEnabled', async (_e, enabled: boolean) => {
    const c = { ...loadConfig(), enabled }
    saveConfig(c)
    if (enabled && c.source) await startEngine(c)
    else stopEngine()
  })

  ipcMain.handle('wallpaper:setVolume', async (_e, volume: number) => {
    const value = Math.max(0, Math.min(1, Number(volume) || 0))
    const c = { ...loadConfig(), volume: value }
    saveConfig(c)
    await applyEngineVolume(value)
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

  ipcMain.handle('wallpaper:deletePath', async (_e, payload: {
    kind: 'workshop' | 'image' | 'video'; path: string; id?: string; label?: string
  }) => {
    if (!payload?.path) return false
    const sourcePath = path.resolve(payload.path)
    let target = sourcePath
    if (payload.kind === 'workshop') {
      target = path.dirname(sourcePath)
      if (!fs.existsSync(path.join(target, 'project.json'))) throw new Error('不是有效的创意工坊项目')
    } else if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      return false
    }
    const answer = await dialog.showMessageBox({
      type: 'warning', title: '删除壁纸',
      message: `确定删除「${payload.label || path.basename(target)}」吗？`,
      detail: '文件会移入回收站，可以从回收站恢复。',
      buttons: ['取消', '移入回收站'], defaultId: 0, cancelId: 0,
    })
    if (answer.response !== 1) return false

    if (payload.kind === 'workshop') {
      queuedConversions.delete(sourcePath)
      for (let i = backgroundConversionQueue.length - 1; i >= 0; i--) {
        if (backgroundConversionQueue[i] === sourcePath) backgroundConversionQueue.splice(i, 1)
      }
      const converting = conversionJobs.get(sourcePath)
      if (converting) await converting.catch(() => {})
      try {
        const stat = fs.statSync(sourcePath)
        const key = createHash('sha1').update(`${sourcePath}|${stat.size}|${stat.mtimeMs}`).digest('hex')
        for (const base of [getDataBase(), app.getPath('userData')]) {
          for (const name of [`${key}.mp4`, `${key}-hq2.mp4`]) {
            const cached = path.join(base, 'wallpaper-video-cache', name)
            if (fs.existsSync(cached)) fs.unlinkSync(cached)
          }
        }
      } catch {}
    }

    const cfg = loadConfig()
    if (cfg.source && (cfg.source.id === payload.id || cfg.source.id === sourcePath || cfg.source.path === sourcePath)) {
      stopEngine()
      saveConfig({ ...cfg, enabled: false, source: undefined })
    }
    await shell.trashItem(target)
    return true
  })

  ipcMain.handle('wallpaper:stop', () => stopEngine())

  ipcMain.handle('wallpaper:scanWorkshop', () => scanWorkshopItems())

  ipcMain.handle('wallpaper:browseOnline', (_e, { sort = 'trend', page = 1 }: { sort?: string; page?: number } = {}) =>
    browseOnlineWorkshop(sort, page)
  )

  ipcMain.handle('wallpaper:openExternal', (_e, url: string) => shell.openExternal(url))
}

export function shutdownWallpaperEngine(): void { stopEngine() }
