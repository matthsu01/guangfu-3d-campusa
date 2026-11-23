import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, type Game } from "./game/engine";
import { GameAudio } from "./game/audio";
import { ZONES, type Zone } from "./game/data";
import DeployGuide from "./components/DeployGuide";
import TouchControls from "./components/TouchControls";

const audio = new GameAudio();

type Panel = "none" | "places" | "deploy" | "help";

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [started, setStarted] = useState(false);
  const [coins, setCoins] = useState(0);
  const [total, setTotal] = useState(0);
  const [zone, setZone] = useState<Zone | null>(null);
  const [toast, setToast] = useState<{ id: number; title: string; msg: string; first: boolean } | null>(null);
  const [clear, setClear] = useState<{ coins: number; total: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [seconds, setSeconds] = useState(0);
  const [zoneOpen, setZoneOpen] = useState(true);

  useEffect(() => {
    if (!hostRef.current) return;
    const game = createGame(
      hostRef.current,
      {
        onCoins: (n, t) => {
          setCoins(n);
          setTotal(t);
        },
        onZone: (z) => {
          setZone(z);
          setZoneOpen(true);
        },
        onBlock: (title, msg, first) => setToast({ id: Date.now(), title, msg, first }),
        onFlag: (c, t) => setClear({ coins: c, total: t }),
      },
      audio,
    );
    gameRef.current = game;
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!started || clear) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [started, clear]);

  const start = useCallback(() => {
    audio.init();
    audio.oneUp();
    audio.startMusic();
    gameRef.current?.setActive(true);
    setStarted(true);
  }, []);

  const toggleMute = () => {
    audio.init();
    const m = !muted;
    audio.setMuted(m);
    setMuted(m);
  };

  const openPanel = (p: Panel) => {
    audio.click();
    setPanel((cur) => (cur === p ? "none" : p));
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />

      {/* HUD */}
      {started && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-start gap-x-5 gap-y-1 sm:gap-x-8">
            <div>
              <div className="hud-text text-[11px] sm:text-xs">小光</div>
              <div className="hud-text text-lg leading-none sm:text-2xl">
                <span className="text-[#ffd21f]">●</span> ×{String(coins).padStart(3, "0")}
                <span className="text-xs opacity-80">/{total + 0}</span>
              </div>
            </div>
            <div>
              <div className="hud-text text-[11px] sm:text-xs">WORLD</div>
              <div className="hud-text text-lg leading-none sm:text-2xl">光復 1-1</div>
            </div>
            <div>
              <div className="hud-text text-[11px] sm:text-xs">TIME</div>
              <div className="hud-text text-lg leading-none sm:text-2xl">{mmss}</div>
            </div>
          </div>

          <div className="absolute right-3 top-3 z-10 flex gap-2">
            <button className="btn-mario" style={{ background: "#2f6fe0" }} onClick={() => openPanel("places")} title="地點傳送">
              🟩 <span className="hidden sm:inline">傳送水管</span>
            </button>
            <button className="btn-mario" style={{ background: "#f38020" }} onClick={() => openPanel("deploy")} title="部署教學">
              🚀 <span className="hidden sm:inline">部署</span>
            </button>
            <button className="btn-mario" style={{ background: "#a574e8" }} onClick={() => openPanel("help")} title="操作說明">
              ❓
            </button>
            <button className="btn-mario" style={{ background: muted ? "#888" : "#2ea44f" }} onClick={toggleMute} title="音效開關">
              {muted ? "🔇" : "🔊"}
            </button>
          </div>

          {/* 區域資訊卡 */}
          {zone && (
            <div className="absolute bottom-3 left-3 z-10 w-[min(340px,calc(100vw-24px))] sm:bottom-4 max-sm:bottom-48">
              <div className="card anim-slideup overflow-hidden" key={zone.id}>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  style={{ background: zone.color }}
                  onClick={() => setZoneOpen((v) => !v)}
                >
                  <span className="text-2xl">{zone.emoji}</span>
                  <span className="hud-text flex-1 text-lg leading-tight">{zone.name}</span>
                  <span className="hud-text text-sm">{zoneOpen ? "▾" : "▸"}</span>
                </button>
                {zoneOpen && (
                  <div className="space-y-2 p-3 text-[13px]">
                    <div className="inline-block rounded-full bg-[#4a2c0a] px-2 py-0.5 text-[11px] font-bold text-white">{zone.floors}</div>
                    <p className="font-medium leading-relaxed">{zone.desc}</p>
                    <div className="flex flex-wrap gap-1">
                      {zone.rooms.map((r) => (
                        <span key={r} className="rounded-lg border-2 px-1.5 py-0.5 text-[11px] font-bold" style={{ borderColor: zone.color, background: "#fff" }}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 問號磚訊息 */}
          {toast && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-20 w-[min(420px,calc(100vw-24px))] -translate-x-1/2 sm:top-20">
              <div className="card anim-slideup flex items-center gap-3 p-3" key={toast.id}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-[3px] border-[#c97a00] bg-[#ffc42e] text-3xl font-black text-[#7a3b00] shadow-[0_4px_0_rgba(0,0,0,0.25)]">
                  ?
                </div>
                <div>
                  <div className="font-black">
                    {toast.title} {toast.first && <span className="text-[#c97a00]">+1 ●</span>}
                  </div>
                  <div className="text-[13px] font-medium leading-snug">{toast.msg}</div>
                </div>
              </div>
            </div>
          )}

          {/* 過關 */}
          {clear && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
              <div className="card anim-slideup max-w-sm p-6 text-center">
                <div className="anim-floaty text-6xl">🏁</div>
                <div className="hud-text mt-2 text-3xl" style={{ color: "#ee2f3b", textShadow: "2px 2px 0 #fff, 0 4px 0 rgba(0,0,0,.2)" }}>
                  COURSE CLEAR!
                </div>
                <p className="mt-2 font-bold">
                  你在 {mmss} 內收集了 <span className="text-[#c97a00]">{clear.coins}</span> / {clear.total} 枚金幣!
                </p>
                <p className="mt-1 text-sm">{clear.coins >= clear.total ? "🌟 全收集!你是光復小英雄!" : "還有金幣沒收集完喔,再去校園逛逛吧~"}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    className="btn-mario"
                    style={{ background: "#2ea44f" }}
                    onClick={() => {
                      audio.click();
                      setClear(null);
                    }}
                  >
                    繼續探索
                  </button>
                  <button
                    className="btn-mario"
                    style={{ background: "#f38020" }}
                    onClick={() => {
                      setClear(null);
                      setPanel("deploy");
                    }}
                  >
                    🚀 部署教學
                  </button>
                </div>
              </div>
            </div>
          )}

          <TouchControls
            onStick={(x, y) => gameRef.current?.setStick(x, y)}
            onJump={() => gameRef.current?.jump()}
            onRotate={(d) => gameRef.current?.rotateCam(d)}
          />
        </>
      )}

      {/* 傳送水管 */}
      {panel === "places" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-3" onClick={() => setPanel("none")}>
          <div className="card anim-slideup flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="brick-title flex items-center justify-between px-4 py-3">
              <div className="hud-text text-lg">🟩 選一條水管,瞬間移動!</div>
              <button className="btn-mario !px-3 !py-0 text-lg" style={{ background: "#ee2f3b" }} onClick={() => setPanel("none")}>
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3">
              {ZONES.map((z) => (
                <button
                  key={z.id}
                  className="btn-mario flex flex-col items-center gap-0.5 !px-2 !py-2 text-center"
                  style={{ background: z.color }}
                  onClick={() => {
                    gameRef.current?.teleport(z.id);
                    setPanel("none");
                  }}
                >
                  <span className="text-2xl">{z.emoji}</span>
                  <span className="text-[13px] leading-tight">{z.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {panel === "deploy" && <DeployGuide onClose={() => setPanel("none")} />}

      {panel === "help" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-3" onClick={() => setPanel("none")}>
          <div className="card anim-slideup w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="brick-title px-4 py-3">
              <div className="hud-text text-lg">❓ 操作說明</div>
            </div>
            <ul className="space-y-1.5 p-4 text-sm font-bold">
              <li><span className="kbd-only">⌨️ WASD / 方向鍵:移動 · Shift:跑步</span><span className="touch-only">🕹️ 左下搖桿移動</span></li>
              <li><span className="kbd-only">␣ 空白鍵:跳躍</span><span className="touch-only">🅰️ 右下按鈕跳躍</span></li>
              <li>🖱️ 拖曳畫面 / Q E:旋轉視角 · 滾輪:縮放</li>
              <li>❓ 從下面跳起來頂問號磚,會顯示校園小知識</li>
              <li>● 收集金幣、⭐ 超級星星(遊戲區彩色積木最高處)</li>
              <li>👧👦 20 位小學生穿著光復夏季運動服(女粉/男藍)與制服在校園散步,校長(西裝+紫領帶)也會巡視校園,靠近他們會揮手打招呼,學生遇到校長還會說「校長好!」</li>
              <li>🏁 跑到終點旗過關(光電球場旁)</li>
              <li>🟩「傳送水管」可以直接跳到各棟大樓</li>
            </ul>
            <div className="px-4 pb-4">
              <button className="btn-mario w-full" style={{ background: "#2ea44f" }} onClick={() => setPanel("none")}>
                知道了!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 開始畫面 */}
      {!started && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-[#4aa8ff]/70 via-[#8fd3ff]/40 to-[#7fdc5a]/70 p-4 text-center backdrop-blur-[2px]">
          <div className="anim-floaty">
            <div className="hud-text text-sm tracking-[0.3em] sm:text-base">新北市中和區 · 115 學年度教室配置</div>
            <h1
              className="mt-1 text-5xl font-black leading-tight sm:text-7xl"
              style={{
                color: "#ee2f3b",
                WebkitTextStroke: "3px #fff",
                textShadow: "0 6px 0 #9f1520, 0 10px 0 rgba(0,0,0,.25)",
                fontFamily: "var(--font-game)",
                paintOrder: "stroke fill",
              }}
            >
              光復國小
            </h1>
            <div
              className="text-3xl font-black sm:text-5xl"
              style={{
                color: "#ffd21f",
                WebkitTextStroke: "2px #7a3b00",
                textShadow: "0 5px 0 #b45f00",
                paintOrder: "stroke fill",
              }}
            >
              3D 校園大冒險
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 text-4xl sm:text-5xl">
            <span className="anim-floaty">🍄</span>
            <span className="anim-floaty" style={{ animationDelay: "0.2s" }}>⭐</span>
            <span className="anim-floaty" style={{ animationDelay: "0.4s" }}>🪙</span>
            <span className="anim-floaty" style={{ animationDelay: "0.6s" }}>🏁</span>
          </div>
          <button className="btn-mario mt-8 !rounded-2xl !px-10 !py-3 text-2xl sm:text-3xl" style={{ background: "#ee2f3b" }} onClick={start}>
            <span className="anim-blink">▶</span> START
          </button>
          <p className="hud-text mt-5 max-w-md text-xs leading-relaxed sm:text-sm">
            <span className="kbd-only">WASD 移動 · 空白鍵跳躍 · 拖曳旋轉視角</span>
            <span className="touch-only">搖桿移動 · A 跳躍 · 拖曳旋轉視角</span>
            <br />
            🔊 內含 8-bit 音效與背景音樂
            <br />
            👧👦 穿著光復運動服與制服的小學生、還有校長在校園裡散步中!
          </p>
        </div>
      )}
    </div>
  );
}
