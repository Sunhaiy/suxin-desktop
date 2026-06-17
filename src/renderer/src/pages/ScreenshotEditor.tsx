/**
 * ScreenshotEditor
 *
 * Phase 1 — SELECT  : 全屏黑幕，拖拽/吸附选区
 * Phase 2 — ANNOTATE: 窗口收缩到选区大小，顶部是截图 Canvas，底部是工具栏
 */
import { useEffect, useRef, useState } from 'react'
import {
  Square, Circle, ArrowUpRight, Pen, Type, Grid3X3,
  Undo2, Redo2, Download, X, Check, Pin, Languages, ScanText, RefreshCw,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────
type Phase = 'select' | 'loading' | 'annotate'
type Tool  = 'rect' | 'circle' | 'arrow' | 'pen' | 'text' | 'mosaic'
interface Pt  { x: number; y: number }
interface Sel { x: number; y: number; w: number; h: number }

// ── Constants ──────────────────────────────────────────────────────
const COLORS       = ['#f44336','#ff9800','#ffeb3b','#4caf50','#2196f3','#9c27b0','#ffffff','#000000']
const STROKES      = [2, 4, 8]
const MOSAIC_BLOCK = 12
const MIN_SEL      = 10

function normSel(x1: number, y1: number, x2: number, y2: number): Sel {
  return { x: Math.min(x1,x2), y: Math.min(y1,y2), w: Math.abs(x2-x1), h: Math.abs(y2-y1) }
}
function toCanvas(e: React.MouseEvent, el: HTMLElement): Pt {
  const r = el.getBoundingClientRect()
  // In select phase the canvas = full display resolution ÷ CSS size
  const canvas = el as HTMLCanvasElement
  const scaleX = canvas.width  ? canvas.width  / r.width  : 1
  const scaleY = canvas.height ? canvas.height / r.height : 1
  return {
    x: Math.round((e.clientX - r.left) * scaleX),
    y: Math.round((e.clientY - r.top)  * scaleY),
  }
}

// ── Component ──────────────────────────────────────────────────────
export default function ScreenshotEditor() {
  // ── Phase state ────────────────────────────────────────────────
  const phaseRef = useRef<Phase>('select')
  const [phase, setPhase_] = useState<Phase>('select')
  function setPhase(p: Phase) { phaseRef.current = p; setPhase_(p) }

  // ── Select-phase canvases ──────────────────────────────────────
  const selBgRef  = useRef<HTMLCanvasElement>(null) // full-screen screenshot
  const selDimRef = useRef<HTMLCanvasElement>(null) // dim overlay + selection cutout

  // ── Annotate-phase canvases ────────────────────────────────────
  const annBgRef   = useRef<HTMLCanvasElement>(null) // cropped screenshot
  const annDrawRef = useRef<HTMLCanvasElement>(null) // annotations

  // ── Selection drag ─────────────────────────────────────────────
  const draggingRef  = useRef(false)
  const dragStartRef = useRef<Pt>({ x:0, y:0 })
  const liveSel      = useRef<Sel | null>(null)
  const [sizeLabel, setSizeLabel] = useState<{ x:number; y:number; text:string } | null>(null)

  // ── Window snap ────────────────────────────────────────────────
  const winRectsRef = useRef<{ x:number; y:number; w:number; h:number }[]>([])
  const snapRef     = useRef<Sel | null>(null)

  // ── Pending crop (stored until annotate canvases are mounted) ──
  const pendingCropRef = useRef<string>('')

  // ── Annotate state ─────────────────────────────────────────────
  const cropSize    = useRef<{ w:number; h:number }>({ w:0, h:0 })
  const toolRef     = useRef<Tool>('rect')
  const colorRef    = useRef(COLORS[0])
  const strokeRef   = useRef(1)
  const historyRef  = useRef<ImageData[]>([])
  const histIdxRef  = useRef(-1)
  const drawingRef  = useRef(false)
  const annStart    = useRef<Pt>({ x:0, y:0 })
  const annEnd      = useRef<Pt>({ x:0, y:0 })
  const savedImg    = useRef<ImageData | null>(null)
  const penPath     = useRef<Pt[]>([])

  const [tool,    setTool_]    = useState<Tool>('rect')
  const [color,   setColor_]   = useState(COLORS[0])
  const [stroke,  setStroke_]  = useState(1)
  const [histIdx, setHistIdx_] = useState(-1)
  const [histLen, setHistLen]  = useState(0)
  const [textPos, setTextPos]  = useState<Pt | null>(null)

  function setTool(t: Tool)    { toolRef.current = t;   setTool_(t) }
  function setColor(c: string) { colorRef.current = c;  setColor_(c) }
  function setStroke(s: number){ strokeRef.current = s; setStroke_(s) }

  // ── OCR / Translate ────────────────────────────────────────────
  const [ocrText,      setOcrText]      = useState<string | null>(null)
  const [transText,    setTransText]    = useState<string | null>(null)
  const [ocrLoading,   setOcrLoading]   = useState(false)
  const [transLoading, setTransLoading] = useState(false)
  const [panel, setPanel] = useState<'ocr' | 'trans' | null>(null)

  // ── Init + reset handler ───────────────────────────────────────
  useEffect(() => {
    function initFromDataURL(dataURL: string) {
      const img = new Image()
      img.onload = () => {
        const W = img.width, H = img.height
        if (selBgRef.current)  { selBgRef.current.width  = W; selBgRef.current.height  = H }
        if (selDimRef.current) { selDimRef.current.width = W; selDimRef.current.height = H }
        selBgRef.current?.getContext('2d')?.drawImage(img, 0, 0)
        drawSelDim(null)
      }
      img.src = dataURL
    }

    const c1 = window.electron?.on('se:init',  (d: unknown) => initFromDataURL(d as string))
    const c2 = window.electron?.on('se:reset', (d: unknown) => {
      // 重新选区：重置到 select phase
      setPhase('select')
      liveSel.current = null; snapRef.current = null
      setSizeLabel(null); setTextPos(null)
      setOcrText(null); setTransText(null); setPanel(null)
      historyRef.current = []; histIdxRef.current = -1; setHistIdx_(-1); setHistLen(0)
      annDrawRef.current?.getContext('2d')?.clearRect(0,0,9999,9999)
      initFromDataURL(d as string)
    })

    // 预加载窗口矩形用于吸附
    window.electron?.invoke<typeof winRectsRef.current>('automation:getWindowRects')
      .then(r => { winRectsRef.current = r ?? [] }).catch(() => {})

    return () => { c1?.(); c2?.() }
  }, [])

  // ── Select-phase dim canvas ────────────────────────────────────
  function drawSelDim(live: Sel | null) {
    const dim = selDimRef.current; if (!dim) return
    const ctx = dim.getContext('2d')!
    ctx.clearRect(0, 0, dim.width, dim.height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, dim.width, dim.height)

    const r = live ?? snapRef.current
    if (r && r.w > 2 && r.h > 2) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.globalCompositeOperation = 'source-over'

      // Blue border
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)

      // Handles
      ctx.fillStyle = '#3b82f6'
      const pts: Pt[] = [
        {x:r.x,     y:r.y},       {x:r.x+r.w, y:r.y},
        {x:r.x,     y:r.y+r.h},   {x:r.x+r.w, y:r.y+r.h},
        {x:r.x+r.w/2, y:r.y},     {x:r.x+r.w, y:r.y+r.h/2},
        {x:r.x+r.w/2, y:r.y+r.h}, {x:r.x,     y:r.y+r.h/2},
      ]
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill() })
    }
  }

  // ── Commit selection → crop + resize window ────────────────────
  async function commitSelection(r: Sel) {
    setPhase('loading')
    try {
      const croppedURL = await window.electron!.invoke<string>('se:regionCommitted', r)
      if (!croppedURL) { setPhase('select'); return }
      // Store URL and switch phase — annotate canvases mount on next render
      pendingCropRef.current = croppedURL
      setPhase('annotate')
    } catch { setPhase('select') }
  }

  // ── Draw to annotate canvases after they are mounted ───────────
  useEffect(() => {
    if (phase !== 'annotate' || !pendingCropRef.current) return
    const url = pendingCropRef.current
    pendingCropRef.current = ''
    const img = new Image()
    img.onload = () => {
      const W = img.width, H = img.height
      cropSize.current = { w: W, h: H }
      if (annBgRef.current)   { annBgRef.current.width   = W; annBgRef.current.height   = H }
      if (annDrawRef.current) { annDrawRef.current.width = W; annDrawRef.current.height = H }
      annBgRef.current?.getContext('2d')?.drawImage(img, 0, 0)
      if (annDrawRef.current) {
        const blank = annDrawRef.current.getContext('2d')!.getImageData(0, 0, W, H)
        historyRef.current = [blank]; histIdxRef.current = 0
        setHistIdx_(0); setHistLen(1)
      }
    }
    img.src = url
  }, [phase])

  // ── Snap detection ─────────────────────────────────────────────
  function findSnap(pt: Pt): Sel | null {
    for (const r of winRectsRef.current) {
      if (pt.x >= r.x && pt.x <= r.x+r.w && pt.y >= r.y && pt.y <= r.y+r.h)
        return { x:r.x, y:r.y, w:r.w, h:r.h }
    }
    return null
  }

  // ── Annotation history ─────────────────────────────────────────
  function pushHistory() {
    const d = annDrawRef.current; if (!d) return
    const data = d.getContext('2d')!.getImageData(0,0,d.width,d.height)
    const idx  = histIdxRef.current + 1
    historyRef.current = [...historyRef.current.slice(0,idx), data]
    histIdxRef.current = idx; setHistIdx_(idx); setHistLen(historyRef.current.length)
  }
  function undo() {
    if (histIdxRef.current <= 0) return
    const idx = histIdxRef.current - 1
    annDrawRef.current?.getContext('2d')?.putImageData(historyRef.current[idx],0,0)
    histIdxRef.current = idx; setHistIdx_(idx)
  }
  function redo() {
    if (histIdxRef.current >= historyRef.current.length-1) return
    const idx = histIdxRef.current + 1
    annDrawRef.current?.getContext('2d')?.putImageData(historyRef.current[idx],0,0)
    histIdxRef.current = idx; setHistIdx_(idx)
  }

  // ── Draw helpers ───────────────────────────────────────────────
  function styleCtx(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = colorRef.current; ctx.fillStyle = colorRef.current
    ctx.lineWidth   = STROKES[strokeRef.current]; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  }
  function drawArrow(ctx: CanvasRenderingContext2D, p1: Pt, p2: Pt) {
    const hl = Math.max(16, STROKES[strokeRef.current] * 4)
    const a  = Math.atan2(p2.y-p1.y, p2.x-p1.x)
    ctx.beginPath()
    ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y)
    ctx.lineTo(p2.x-hl*Math.cos(a-Math.PI/6), p2.y-hl*Math.sin(a-Math.PI/6))
    ctx.moveTo(p2.x,p2.y)
    ctx.lineTo(p2.x-hl*Math.cos(a+Math.PI/6), p2.y-hl*Math.sin(a+Math.PI/6))
    ctx.stroke()
  }
  function applyMosaic(p1: Pt, p2: Pt) {
    const dCtx = annDrawRef.current?.getContext('2d'); if (!dCtx||!savedImg.current) return
    const bCtx = annBgRef.current?.getContext('2d');  if (!bCtx) return
    dCtx.putImageData(savedImg.current,0,0)
    const x1=Math.round(Math.min(p1.x,p2.x)), y1=Math.round(Math.min(p1.y,p2.y))
    const x2=Math.round(Math.max(p1.x,p2.x)), y2=Math.round(Math.max(p1.y,p2.y))
    for (let x=x1; x<x2; x+=MOSAIC_BLOCK) for (let y=y1; y<y2; y+=MOSAIC_BLOCK) {
      const bw=Math.min(MOSAIC_BLOCK,x2-x), bh=Math.min(MOSAIC_BLOCK,y2-y)
      const d=bCtx.getImageData(x+Math.floor(bw/2),y+Math.floor(bh/2),1,1).data
      dCtx.fillStyle=`rgb(${d[0]},${d[1]},${d[2]})`; dCtx.fillRect(x,y,bw,bh)
    }
  }

  // ── Merge canvases → final PNG ─────────────────────────────────
  function getMerged(): string {
    const bg=annBgRef.current; const dr=annDrawRef.current
    if (!bg||!dr) return ''
    const tmp=document.createElement('canvas')
    tmp.width=bg.width; tmp.height=bg.height
    const ctx=tmp.getContext('2d')!
    ctx.drawImage(bg,0,0); ctx.drawImage(dr,0,0)
    return tmp.toDataURL('image/png')
  }

  // ── IPC actions ────────────────────────────────────────────────
  function confirm() { window.electron?.invoke('se:confirm', getMerged()) }
  function save()    { window.electron?.invoke('automation:saveScreenshot', getMerged()) }
  function pin()     { const d=getMerged(); if(d) window.electron?.invoke('automation:pinToDesktop', d) }
  function reselect(){ window.electron?.invoke('se:reselect') }

  async function doOCR() {
    const d=getMerged(); if(!d) return
    setPanel('ocr'); setOcrLoading(true); setOcrText(null)
    try {
      const t = await window.electron?.invoke<string>('automation:ocr', d)
      setOcrText(t?.trim() || '未识别到文字（可能需要安装中文语言包）')
    } catch { setOcrText('OCR 调用失败') }
    finally { setOcrLoading(false) }
  }

  async function doTranslate() {
    const d=getMerged(); if(!d) return
    setPanel('trans'); setTransLoading(true); setTransText(null)
    try {
      let src = ocrText
      if (!src?.trim()) {
        setOcrLoading(true)
        src = await window.electron?.invoke<string>('automation:ocr', d) || ''
        setOcrText(src); setOcrLoading(false)
      }
      if (!src.trim()) { setTransText('未识别到文字，无法翻译'); return }
      const t = await window.electron?.invoke<string>('automation:translate', src)
      setTransText(t?.trim() || '翻译返回空结果')
    } catch (e) {
      setTransText(`翻译失败: ${e instanceof Error ? e.message : '网络错误'}`)
    } finally { setTransLoading(false); setOcrLoading(false) }
  }

  // ── Keyboard ───────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phaseRef.current === 'annotate') reselect()
        else window.electron?.invoke('se:cancel')
      }
      if (e.key === 'Enter' && !textPos && phaseRef.current === 'annotate') confirm()
      if ((e.ctrlKey||e.metaKey) && e.key === 'z') undo()
      if ((e.ctrlKey||e.metaKey) && e.key === 'y') redo()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [textPos])

  // ── Select-phase mouse ─────────────────────────────────────────
  function onSelectMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const dim = selDimRef.current; if (!dim) return
    const pos = toCanvas(e, dim)
    // If snap target under cursor, use it as anchor
    draggingRef.current = true
    dragStartRef.current = pos
    liveSel.current = { x:pos.x, y:pos.y, w:0, h:0 }
  }
  function onSelectMouseMove(e: React.MouseEvent) {
    const dim = selDimRef.current; if (!dim) return
    const pos = toCanvas(e, dim)
    if (draggingRef.current) {
      const r = normSel(dragStartRef.current.x, dragStartRef.current.y, pos.x, pos.y)
      liveSel.current = r; drawSelDim(r)
      const scX = window.innerWidth/dim.width, scY = window.innerHeight/dim.height
      setSizeLabel({
        x: Math.min(dragStartRef.current.x,pos.x)*scX,
        y: Math.min(dragStartRef.current.y,pos.y)*scY - 26,
        text: `${r.w} × ${r.h}`,
      })
    } else {
      const snap = findSnap(pos)
      const p = snapRef.current
      if (snap?.x!==p?.x||snap?.y!==p?.y||snap?.w!==p?.w) {
        snapRef.current = snap; drawSelDim(null)
      }
    }
  }
  function onSelectMouseUp(e: React.MouseEvent) {
    if (e.button !== 0) return
    draggingRef.current = false; setSizeLabel(null)
    const r = liveSel.current ?? snapRef.current
    if (r && r.w > MIN_SEL && r.h > MIN_SEL) {
      commitSelection(r)
    } else {
      liveSel.current = null; drawSelDim(null)
    }
  }

  // ── Annotate-phase mouse ───────────────────────────────────────
  function onAnnMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const canvas = annDrawRef.current; if (!canvas) return
    const pos = toCanvas(e, canvas)
    if (toolRef.current === 'text') { setTextPos(pos); return }
    const ctx = canvas.getContext('2d')!
    drawingRef.current = true; annStart.current = pos; annEnd.current = pos
    savedImg.current = ctx.getImageData(0,0,canvas.width,canvas.height)
    if (toolRef.current === 'pen') penPath.current = [pos]
    styleCtx(ctx)
  }
  function onAnnMouseMove(e: React.MouseEvent) {
    if (!drawingRef.current) return
    const canvas = annDrawRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const pos = toCanvas(e, canvas)
    const s = annStart.current; annEnd.current = pos; styleCtx(ctx)
    switch (toolRef.current) {
      case 'rect':
        ctx.putImageData(savedImg.current!,0,0)
        ctx.strokeRect(s.x,s.y,pos.x-s.x,pos.y-s.y); break
      case 'circle':
        ctx.putImageData(savedImg.current!,0,0); ctx.beginPath()
        ctx.ellipse((s.x+pos.x)/2,(s.y+pos.y)/2,Math.abs(pos.x-s.x)/2,Math.abs(pos.y-s.y)/2,0,0,Math.PI*2)
        ctx.stroke(); break
      case 'arrow':
        ctx.putImageData(savedImg.current!,0,0); drawArrow(ctx,s,pos); break
      case 'pen':
        penPath.current.push(pos); ctx.beginPath()
        ctx.moveTo(penPath.current[0].x,penPath.current[0].y)
        penPath.current.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); break
      case 'mosaic': {
        ctx.putImageData(savedImg.current!,0,0)
        const pa=ctx.globalAlpha; ctx.globalAlpha=0.4; ctx.fillStyle='#555'
        ctx.fillRect(Math.min(s.x,pos.x),Math.min(s.y,pos.y),Math.abs(pos.x-s.x),Math.abs(pos.y-s.y))
        ctx.globalAlpha=pa; break
      }
    }
  }
  function onAnnMouseUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (toolRef.current === 'mosaic') applyMosaic(annStart.current, annEnd.current)
    penPath.current = []; pushHistory()
  }

  // Text commit
  function commitText(value: string) {
    const tp=textPos; setTextPos(null)
    if (!tp||!value.trim()) return
    const ctx=annDrawRef.current?.getContext('2d'); if(!ctx) return
    styleCtx(ctx)
    ctx.font=`bold ${[16,22,30][strokeRef.current]}px Inter,"PingFang SC",sans-serif`
    ctx.fillText(value,tp.x,tp.y+[16,22,30][strokeRef.current]); pushHistory()
  }

  // ── Render ─────────────────────────────────────────────────────

  // ── Phase: SELECT ──────────────────────────────────────────────
  if (phase === 'select' || phase === 'loading') {
    return (
      <div
        className="relative w-screen h-screen overflow-hidden bg-black select-none"
        style={{ cursor: phase === 'loading' ? 'wait' : 'crosshair' }}
        onMouseDown={phase === 'select' ? onSelectMouseDown : undefined}
        onMouseMove={phase === 'select' ? onSelectMouseMove : undefined}
        onMouseUp={phase === 'select' ? onSelectMouseUp : undefined}
        onContextMenu={e => { e.preventDefault(); window.electron?.invoke('se:cancel') }}
      >
        {/* Screenshot background */}
        <canvas ref={selBgRef}  className="absolute inset-0 w-full h-full pointer-events-none" />
        {/* Dim overlay */}
        <canvas ref={selDimRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Size label */}
        {sizeLabel && (
          <div
            className="pointer-events-none absolute z-50 rounded-md bg-black/80 px-2 py-0.5
                       text-[11px] font-mono text-white shadow"
            style={{ left: sizeLabel.x, top: Math.max(4, sizeLabel.y) }}
          >
            {sizeLabel.text}
          </div>
        )}

        {/* Loading overlay */}
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          </div>
        )}

        {/* Bottom hint */}
        {phase === 'select' && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 z-50
                          rounded-lg bg-black/65 px-4 py-2 text-[12px] text-gray-300 shadow-lg">
            <span className="text-blue-400 font-medium">拖动</span>选择区域 &nbsp;·&nbsp;
            <span className="text-blue-400 font-medium">悬停</span>吸附应用窗口 &nbsp;·&nbsp;
            右键 / Esc 取消
          </div>
        )}
      </div>
    )
  }

  // ── Phase: ANNOTATE ────────────────────────────────────────────
  const { w: CW, h: CH } = cropSize.current
  const annCanvas = annDrawRef.current
  const scaleX = annCanvas ? window.innerWidth  / CW : 1
  const scaleY = annCanvas ? (window.innerHeight - 56) / CH : 1  // 56 = toolbar

  return (
    <div
      className="flex w-screen h-screen flex-col overflow-hidden select-none"
      style={{ boxShadow: 'inset 0 0 0 2px #3b82f6' }}
    >
      {/* ── Canvas area ── */}
      <div
        className="relative flex-1 overflow-hidden bg-black"
        style={{ cursor: tool === 'text' ? 'text' : 'crosshair' }}
        onMouseDown={onAnnMouseDown}
        onMouseMove={onAnnMouseMove}
        onMouseUp={onAnnMouseUp}
        onMouseLeave={onAnnMouseUp}
        onContextMenu={e => e.preventDefault()}
      >
        <canvas ref={annBgRef}   className="absolute inset-0 w-full h-full pointer-events-none" />
        <canvas ref={annDrawRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Text input */}
        {textPos && (
          <input
            autoFocus
            className="absolute border-none bg-transparent p-0 outline-none font-bold leading-none"
            style={{
              left:       textPos.x * scaleX,
              top:        textPos.y * scaleY,
              color:      colorRef.current,
              fontSize:   [16, 22, 30][stroke] * Math.min(scaleX, scaleY),
              fontFamily: 'Inter,"PingFang SC",sans-serif',
              minWidth:   60,
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') commitText(e.currentTarget.value)
              if (e.key === 'Escape') setTextPos(null)
              e.stopPropagation()
            }}
            onBlur={e => commitText(e.currentTarget.value)}
          />
        )}
      </div>

      {/* ── Toolbar ── */}
      <div
        className="flex h-14 flex-shrink-0 items-center gap-0.5 bg-[#141414] border-t border-white/10 px-2"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Drawing tools */}
        {([
          ['rect',   Square,       '矩形 R'],
          ['circle', Circle,       '椭圆 E'],
          ['arrow',  ArrowUpRight, '箭头 A'],
          ['pen',    Pen,          '画笔 P'],
          ['text',   Type,         '文字 T'],
          ['mosaic', Grid3X3,      '马赛克'],
        ] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTool(id)} title={label}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
              tool === id
                ? 'bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
            }`}>
            <Icon size={14} />
          </button>
        ))}

        <div className="mx-1.5 h-5 w-px bg-white/15 flex-shrink-0" />

        {/* Colors */}
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} title={c}
            className="flex-shrink-0 transition-transform hover:scale-110"
            style={{ padding: 2 }}>
            <div
              className="rounded-full transition-all"
              style={{
                width:  color === c ? 18 : 16,
                height: color === c ? 18 : 16,
                background: c,
                boxShadow: color === c
                  ? `0 0 0 2px #141414, 0 0 0 4px ${c}`
                  : '0 0 0 1px rgba(255,255,255,0.15)',
              }}
            />
          </button>
        ))}

        <div className="mx-1.5 h-5 w-px bg-white/15 flex-shrink-0" />

        {/* Stroke sizes */}
        {STROKES.map((s, i) => (
          <button key={s} onClick={() => setStroke(i)} title={`粗细 ${s}px`}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all ${
              stroke === i ? 'bg-white/15' : 'hover:bg-white/8'
            }`}>
            <div className="rounded-full bg-gray-300" style={{ width: s * 3, height: s * 3 }} />
          </button>
        ))}

        <div className="mx-1.5 h-5 w-px bg-white/15 flex-shrink-0" />

        {/* Undo / Redo */}
        <button onClick={undo} disabled={histIdx <= 0} title="撤销 Ctrl+Z"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all
                     hover:bg-white/10 hover:text-gray-200 disabled:opacity-25 disabled:cursor-not-allowed">
          <Undo2 size={14} />
        </button>
        <button onClick={redo} disabled={histIdx >= histLen - 1} title="重做 Ctrl+Y"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all
                     hover:bg-white/10 hover:text-gray-200 disabled:opacity-25 disabled:cursor-not-allowed">
          <Redo2 size={14} />
        </button>

        <div className="mx-1.5 h-5 w-px bg-white/15 flex-shrink-0" />

        {/* OCR */}
        <button onClick={doOCR} disabled={ocrLoading} title="提取文字 (OCR)"
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-all
                      ${panel==='ocr' ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}
                      disabled:opacity-40`}>
          {ocrLoading
            ? <div className="h-3 w-3 animate-spin rounded-full border border-purple-400 border-t-transparent" />
            : <ScanText size={14} />}
        </button>

        {/* Translate */}
        <button onClick={doTranslate} disabled={transLoading} title="翻译"
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-all
                      ${panel==='trans' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}
                      disabled:opacity-40`}>
          {transLoading
            ? <div className="h-3 w-3 animate-spin rounded-full border border-blue-400 border-t-transparent" />
            : <Languages size={14} />}
        </button>

        {/* Pin to desktop */}
        <button onClick={pin} title="钉在桌面"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all hover:bg-white/10 hover:text-amber-400">
          <Pin size={14} />
        </button>

        {/* Save */}
        <button onClick={save} title="保存为文件"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all hover:bg-white/10 hover:text-gray-200">
          <Download size={14} />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Reselect */}
        <button onClick={reselect} title="重新选择 (Esc)"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-all hover:bg-white/10 hover:text-gray-300">
          <RefreshCw size={13} />
        </button>

        {/* Cancel (close) */}
        <button onClick={() => window.electron?.invoke('se:cancel')} title="取消并关闭"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-all
                     hover:bg-red-500/15 hover:text-red-400">
          <X size={14} />
        </button>

        {/* Confirm */}
        <button onClick={confirm} title="完成并复制到剪贴板 (Enter)"
          className="ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-blue-500 px-3 text-[12px]
                     font-semibold text-white shadow-[0_0_12px_rgba(59,130,246,0.4)]
                     transition-all hover:bg-blue-400 hover:shadow-[0_0_16px_rgba(59,130,246,0.6)]">
          <Check size={13} strokeWidth={2.5} /> 完成
        </button>
      </div>

      {/* ── OCR / Translate panel (floats above toolbar) ── */}
      {panel && (ocrText || transText || ocrLoading || transLoading) && (
        <div
          className="absolute bottom-16 right-3 z-50 w-72 rounded-xl border border-white/10
                     bg-[#1a1a1a]/95 p-3 shadow-2xl backdrop-blur-md"
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {panel === 'ocr' ? '📝  识别文字' : '🌐  翻译结果'}
            </span>
            <button onClick={() => setPanel(null)}
              className="rounded p-0.5 text-gray-600 hover:text-gray-300 transition-colors">
              <X size={12} />
            </button>
          </div>

          {(ocrLoading || transLoading)
            ? <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <div className="h-3 w-3 animate-spin rounded-full border border-gray-500 border-t-transparent" />
                处理中…
              </div>
            : <div className="max-h-44 overflow-y-auto text-[12px] leading-relaxed text-gray-300
                              whitespace-pre-wrap break-words">
                {panel === 'ocr' ? ocrText : transText}
              </div>
          }

          {!ocrLoading && !transLoading && (
            <div className="mt-2 flex gap-2">
              {panel === 'ocr' && ocrText && (
                <button
                  onClick={() => navigator.clipboard.writeText(ocrText ?? '')}
                  className="rounded bg-white/8 px-2 py-1 text-[11px] text-blue-400
                             hover:bg-white/12 transition-colors">
                  复制文字
                </button>
              )}
              {panel === 'ocr' && ocrText && !transText && (
                <button
                  onClick={doTranslate}
                  className="rounded bg-white/8 px-2 py-1 text-[11px] text-gray-400
                             hover:bg-white/12 transition-colors">
                  翻译
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
