import { checkCGInEnvelope } from './wbCalc'

export function renderEnvelopeToDataUrl(opts, width = 400, height = 220) {
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  drawEnvelope(canvas, { ...opts, explicitWidth: width, explicitHeight: height })
  return canvas.toDataURL('image/png')
}

export function drawEnvelope(canvas, { gw, cg, limitsNormal, limitsUtility, showPoint, explicitWidth, explicitHeight }) {
  if (!canvas || !limitsNormal || limitsNormal.length < 2) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1

  const rect = canvas.getBoundingClientRect()
  const W = explicitWidth || rect.width
  const H = explicitHeight || 220
  if (!W || W <= 0) return

  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.height = H + 'px'
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  // Padding
  const pad = { top: 18, right: 16, bottom: 36, left: 46 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom

  // Determine axis ranges from limits
  const sorted = [...limitsNormal].sort((a, b) => a.w - b.w)
  let minCG = Infinity, maxCG = -Infinity, minW = Infinity, maxW = -Infinity
  sorted.forEach(p => {
    if (p.fwd < minCG) minCG = p.fwd
    if (p.aft > maxCG) maxCG = p.aft
    if (p.w < minW) minW = p.w
    if (p.w > maxW) maxW = p.w
  })
  // Add margin
  const cgRange = maxCG - minCG
  const wRange = maxW - minW
  minCG -= cgRange * 0.1
  maxCG += cgRange * 0.1
  minW -= wRange * 0.1
  maxW += wRange * 0.1

  const toX = (a) => pad.left + ((a - minCG) / (maxCG - minCG)) * plotW
  const toY = (w) => pad.top + plotH - ((w - minW) / (maxW - minW)) * plotH

  // Grid
  ctx.strokeStyle = '#e5e5e5'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 5; i++) {
    const x = pad.left + (plotW * i) / 5
    const y = pad.top + (plotH * i) / 5
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke()
  }

  // Axis labels
  ctx.fillStyle = '#1a3a5c'
  ctx.font = '9px Arial'
  ctx.textAlign = 'center'
  for (let i = 0; i <= 4; i++) {
    const val = minCG + ((maxCG - minCG) * i) / 4
    ctx.fillText(val.toFixed(1), toX(val), H - 4)
  }
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const val = minW + ((maxW - minW) * i) / 4
    ctx.fillText(Math.round(val), pad.left - 4, toY(val) + 3)
  }

  // Axis titles
  ctx.fillStyle = '#666'
  ctx.font = '8px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('CG (inches)', pad.left + plotW / 2, H - 16)
  ctx.save()
  ctx.translate(10, pad.top + plotH / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('Weight (lbs)', 0, 0)
  ctx.restore()

  // Draw normal envelope (filled)
  ctx.beginPath()
  sorted.forEach((p, i) => {
    const x = toX(p.fwd), y = toY(p.w)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  for (let i = sorted.length - 1; i >= 0; i--) {
    ctx.lineTo(toX(sorted[i].aft), toY(sorted[i].w))
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(26, 92, 46, 0.1)'
  ctx.fill()
  ctx.strokeStyle = '#1a5c2e'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Draw utility envelope (dashed) if exists
  if (limitsUtility && limitsUtility.length >= 2) {
    const uSorted = [...limitsUtility].sort((a, b) => a.w - b.w)
    ctx.beginPath()
    uSorted.forEach((p, i) => {
      const x = toX(p.fwd), y = toY(p.w)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    for (let i = uSorted.length - 1; i >= 0; i--) {
      ctx.lineTo(toX(uSorted[i].aft), toY(uSorted[i].w))
    }
    ctx.closePath()
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = '#1a5c2e'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Plot current point
  if (showPoint && gw > 0 && cg > 0) {
    const px = toX(cg)
    const py = toY(gw)
    const check = checkCGInEnvelope(gw, cg, limitsNormal)
    const color = check.inside ? '#15803d' : '#b91c1c'

    // Dashed crosshairs
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = color
    ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, pad.top + plotH); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(pad.left, py); ctx.stroke()
    ctx.setLineDash([])

    // Point circle
    ctx.beginPath()
    ctx.arc(px, py, 6, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Labels
    ctx.fillStyle = color
    ctx.font = 'bold 9px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.round(gw)} lb`, px, py - 10)
    ctx.fillText(`CG ${cg.toFixed(2)}`, px, py + 18)
  }
}
