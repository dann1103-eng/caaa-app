import { useRef, useEffect } from 'react'
import { drawEnvelope } from '../../utils/drawEnvelope'

export default function EnvelopeCanvas({ gw, cg, limitsNormal, limitsUtility, title, showPoint = true }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled && canvasRef.current) {
          drawEnvelope(canvasRef.current, { gw, cg, limitsNormal, limitsUtility, showPoint })
        }
      })
    })
    return () => { cancelled = true }
  }, [gw, cg, limitsNormal, limitsUtility, showPoint])

  // Handle resize
  useEffect(() => {
    const onResize = () => {
      if (canvasRef.current) {
        drawEnvelope(canvasRef.current, { gw, cg, limitsNormal, limitsUtility, showPoint })
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [gw, cg, limitsNormal, limitsUtility, showPoint])

  return (
    <div className="border border-gray-300 rounded-md p-2.5">
      <div className="text-[11px] font-semibold text-gray-500 mb-2 tracking-wide uppercase">{title}</div>
      <canvas ref={canvasRef} style={{ width: '100%', height: '220px' }} />
    </div>
  )
}
