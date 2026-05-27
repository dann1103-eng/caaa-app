import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from "react";
import "./SignaturePad.css";

const SignaturePad = forwardRef(function SignaturePad(
  { width = 400, height = 150, disabled = false, value = null },
  ref
) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setIsEmpty(true);
    },
    toDataURL() {
      const canvas = canvasRef.current;
      if (!canvas || isEmpty) return null;
      return canvas.toDataURL("image/png");
    },
    isEmpty() {
      return isEmpty;
    },
  }), [isEmpty]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if (e.touches) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }

    function onStart(e) {
      e.preventDefault();
      drawing.current = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }

    function onMove(e) {
      e.preventDefault();
      if (!drawing.current) return;
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setIsEmpty(false);
    }

    function onEnd(e) {
      e.preventDefault();
      drawing.current = false;
    }

    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onEnd);
    canvas.addEventListener("mouseleave", onEnd);
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);

    return () => {
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onEnd);
      canvas.removeEventListener("mouseleave", onEnd);
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, [disabled, isEmpty]);

  if (disabled && value) {
    return (
      <div className="sp-readonly" style={{ width, height }}>
        <img src={value} alt="Firma" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  }

  if (disabled && !value) {
    return (
      <div className="sp-readonly sp-empty" style={{ width, height }}>
        <span>Sin firma</span>
      </div>
    );
  }

  return (
    <div className="sp-wrapper" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="sp-canvas"
      />
      {isEmpty && (
        <span className="sp-placeholder">Firme aquí</span>
      )}
    </div>
  );
});

export default SignaturePad;
