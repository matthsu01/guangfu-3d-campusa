import { useRef, useState } from "react";

interface Props {
  onStick: (x: number, y: number) => void;
  onJump: () => void;
  onRotate: (d: number) => void;
}

export default function TouchControls({ onStick, onJump, onRotate }: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);

  const handle = (e: React.PointerEvent) => {
    const el = padRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    setKnob({ x: dx, y: dy });
    onStick(dx, -dy);
  };
  const end = () => {
    activeId.current = null;
    setKnob({ x: 0, y: 0 });
    onStick(0, 0);
  };

  return (
    <div className="touch-only pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44">
      <div
        ref={padRef}
        className="pointer-events-auto absolute bottom-5 left-5 h-32 w-32 rounded-full border-4 border-white/90 bg-white/30 backdrop-blur-sm"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          activeId.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          handle(e);
        }}
        onPointerMove={(e) => activeId.current === e.pointerId && handle(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-4 border-white bg-[#ee2f3b] shadow-[0_4px_0_rgba(0,0,0,0.3)]"
          style={{ transform: `translate(calc(-50% + ${knob.x * 36}px), calc(-50% + ${knob.y * 36}px))` }}
        />
      </div>
      <button
        className="btn-mario pointer-events-auto absolute bottom-6 right-5 flex h-20 w-20 items-center justify-center !rounded-full text-3xl"
        style={{ background: "#2ea44f", touchAction: "none" }}
        onPointerDown={(e) => {
          e.preventDefault();
          onJump();
        }}
      >
        A
      </button>
      <div className="pointer-events-auto absolute bottom-28 right-6 flex gap-2">
        <button className="btn-mario !px-3" style={{ background: "#2f6fe0" }} onClick={() => onRotate(0.6)}>
          ⟲
        </button>
        <button className="btn-mario !px-3" style={{ background: "#2f6fe0" }} onClick={() => onRotate(-0.6)}>
          ⟳
        </button>
      </div>
    </div>
  );
}
