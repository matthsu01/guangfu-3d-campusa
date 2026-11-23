import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { GameAudio } from "./audio";
import { BLOCKS, GATES, ZONES, len, px2x, py2z, type Zone } from "./data";

export interface GameCallbacks {
  onCoins(n: number, total: number): void;
  onZone(z: Zone | null): void;
  onBlock(title: string, msg: string, first: boolean): void;
  onFlag(coins: number, total: number): void;
}

interface Solid {
  top: number;
  test: (x: number, z: number, r: number) => boolean;
}

const FLOOR_H = 0.9;
const PLAYER_SCALE = 0.85;
const PLAYER_R = 0.3;

export function createGame(container: HTMLElement, cb: GameCallbacks, audio: GameAudio) {
  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  // 天空漸層背景
  {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#4aa8ff");
    grd.addColorStop(0.6, "#8fd3ff");
    grd.addColorStop(1, "#d9f3ff");
    g.fillStyle = grd;
    g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
  }
  scene.fog = new THREE.Fog(0xcdeeff, 60, 130);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xcfeeff, 0xffe9b0, 1.35));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.set(-18, 40, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // ---------- helpers ----------
  const solids: Solid[] = [];
  const mini: ((g: CanvasRenderingContext2D) => void)[] = [];
  const animated: ((t: number, dt: number) => void)[] = [];

  const lambert = (color: string | number, extra: THREE.MeshLambertMaterialParameters = {}) =>
    new THREE.MeshLambertMaterial({ color, ...extra });

  function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = cast;
        m.receiveShadow = receive;
      }
    });
    return o;
  }

  function label(text: string, pos: THREE.Vector3, bg: string, small = false) {
    const div = document.createElement("div");
    div.className = small ? "lbl lbl-sm" : "lbl";
    div.textContent = text;
    div.style.background = bg;
    const o = new CSS2DObject(div);
    o.position.copy(pos);
    scene.add(o);
    return o;
  }

  const rectSolid = (x0: number, z0: number, x1: number, z1: number, top: number): Solid => ({
    top,
    test: (x, z, r) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r,
  });
  const circleSolid = (cx: number, cz: number, R: number, top: number): Solid => ({
    top,
    test: (x, z, r) => (x - cx) ** 2 + (z - cz) ** 2 < (R + r) ** 2,
  });

  // ---------- textures ----------
  const texCache = new Map<string, THREE.CanvasTexture>();
  function facadeBase(wall: string, trim: string) {
    const key = wall + trim;
    const hit = texCache.get(key);
    if (hit) return hit;
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 90;
    const g = c.getContext("2d")!;
    g.fillStyle = wall;
    g.fillRect(0, 0, 160, 90);
    g.fillStyle = trim;
    g.fillRect(0, 80, 160, 10);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.roundRect(28, 10, 104, 56, 12);
    g.fill();
    g.fillStyle = "#8fdcff";
    g.beginPath();
    g.roundRect(34, 16, 92, 44, 8);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.beginPath();
    g.moveTo(40, 58);
    g.lineTo(62, 18);
    g.lineTo(76, 18);
    g.lineTo(54, 58);
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillRect(78, 16, 4, 44);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
    return t;
  }
  function facadeMat(base: THREE.CanvasTexture, rx: number, ry: number) {
    const t = base.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: t });
  }

  function checkerTexture(a: string, b: string, size = 64) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.fillStyle = a;
    g.fillRect(0, 0, size, size);
    g.fillStyle = b;
    g.fillRect(0, 0, size / 2, size / 2);
    g.fillRect(size / 2, size / 2, size / 2, size / 2);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function brickTexture() {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 32;
    const g = c.getContext("2d")!;
    g.fillStyle = "#e0743f";
    g.fillRect(0, 0, 64, 32);
    g.strokeStyle = "#8c3b1c";
    g.lineWidth = 2;
    g.strokeRect(1, 1, 62, 30);
    g.beginPath();
    g.moveTo(0, 16);
    g.lineTo(64, 16);
    g.moveTo(32, 0);
    g.lineTo(32, 16);
    g.moveTo(16, 16);
    g.lineTo(16, 32);
    g.moveTo(48, 16);
    g.lineTo(48, 32);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(2, 2, 28, 4);
    g.fillRect(34, 2, 28, 4);
    g.fillRect(2, 18, 12, 4);
    g.fillRect(18, 18, 28, 4);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const brickBase = brickTexture();

  function questionTexture(base: string, edge: string, mark = true) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = edge;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = base;
    g.fillRect(8, 8, 112, 112);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (const [x, y] of [[14, 14], [114, 14], [14, 114], [114, 114]]) {
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
    if (mark) {
      g.font = "900 92px 'Fredoka', 'Arial Black', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#7a3b00";
      g.fillText("?", 68, 72);
      g.fillStyle = "#fff4b0";
      g.fillText("?", 64, 66);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------- ground ----------
  {
    const t = checkerTexture("#7fdc5a", "#74d04f");
    t.repeat.set(70, 50);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(140, 100), new THREE.MeshLambertMaterial({ map: t }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.02;
    outside.receiveShadow = true;
    scene.add(outside);

    const yardW = len(2210 - 70);
    const yardD = len(1570 - 270);
    const t2 = checkerTexture("#fff3bf", "#ffeaa0");
    t2.repeat.set(yardW / 2, yardD / 2);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(yardW, yardD), new THREE.MeshLambertMaterial({ map: t2 }));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(px2x(1140), 0, py2z(920));
    yard.receiveShadow = true;
    scene.add(yard);
    mini.push((g) => {
      g.fillStyle = "#fff6c9";
      g.fillRect(70, 270, 2140, 1300);
    });
  }

  function flatRect(x0: number, y0: number, x1: number, y1: number, color: string, y = 0.03, h = 0.04, miniToo = true) {
    const w = len(x1 - x0);
    const d = len(y1 - y0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    m.position.set(px2x((x0 + x1) / 2), y + h / 2, py2z((y0 + y1) / 2));
    m.receiveShadow = true;
    scene.add(m);
    if (miniToo)
      mini.push((g) => {
        g.fillStyle = color;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      });
    return m;
  }

  // ---------- buildings ----------
  interface BoxOpts {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    floors: number;
    wall: string;
    roof: string;
    trim?: string;
    shrink?: number;
    name?: string;
    labelBg?: string;
  }
  function addBuilding(o: BoxOpts) {
    const s = o.shrink ?? 10;
    const x0 = px2x(o.x0 + s);
    const x1 = px2x(o.x1 - s);
    const z0 = py2z(o.y0 + s);
    const z1 = py2z(o.y1 - s);
    const w = x1 - x0;
    const d = z1 - z0;
    const h = o.floors * FLOOR_H;
    const base = facadeBase(o.wall, o.trim ?? o.roof);
    const sideX = facadeMat(base, Math.max(1, Math.round(d / 1.6)), o.floors);
    const sideZ = facadeMat(base, Math.max(1, Math.round(w / 1.6)), o.floors);
    const roofMat = lambert(o.roof);
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideX, sideX, roofMat, roofMat, sideZ, sideZ]);
    body.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    group.add(body);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), roofMat);
    slab.position.set((x0 + x1) / 2, h + 0.15, (z0 + z1) / 2);
    group.add(slab);
    // 屋頂可愛小圓柱
    const nCap = Math.max(2, Math.floor(w / 3));
    for (let i = 0; i < nCap; i++) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), lambert("#ffffff"));
      cap.position.set(x0 + ((i + 0.5) * w) / nCap, h + 0.4, z1 - 0.1);
      cap.scale.y = 0.7;
      group.add(cap);
    }
    scene.add(shadowed(group));
    solids.push(rectSolid(x0, z0, x1, z1, h + 0.3));
    mini.push((g) => {
      g.fillStyle = o.roof;
      g.fillRect(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0);
    });
    if (o.name) label(o.name, new THREE.Vector3((x0 + x1) / 2, h + 1.6, (z0 + z1) / 2), o.labelBg ?? o.roof);
  }

  function addSector(
    cxp: number,
    cyp: number,
    rInP: number,
    rOutP: number,
    a0: number,
    a1: number,
    floors: number,
    wall: string,
    roof: string,
    name?: string,
  ) {
    const cx = px2x(cxp);
    const cz = py2z(cyp);
    const rIn = len(rInP) + 0.12;
    const rOut = len(rOutP) - 0.12;
    const h = floors * FLOOR_H;
    const sh = new THREE.Shape();
    sh.absarc(cx, -cz, rOut, a0, a1, false);
    sh.absarc(cx, -cz, rIn, a1, a0, true);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 48 });
    geo.rotateX(-Math.PI / 2);
    const base = facadeBase(wall, roof);
    const side = facadeMat(base, 1 / 1.6, 1 / FLOOR_H);
    const mesh = new THREE.Mesh(geo, [lambert(roof), side]);
    scene.add(shadowed(mesh));
    solids.push({
      top: h,
      test: (x, z, r) => {
        const dx = x - cx;
        const dz = z - cz;
        const rad = Math.hypot(dx, dz);
        if (rad < rIn - r || rad > rOut + r) return false;
        let a = Math.atan2(-dz, dx);
        if (a < 0) a += Math.PI * 2;
        const m = r / Math.max(rad, 0.5);
        return a >= a0 - m && a <= a1 + m;
      },
    });
    mini.push((g) => {
      g.fillStyle = roof;
      g.beginPath();
      g.arc(cxp, cyp, rOutP, Math.PI, Math.PI * 1.5, false);
      g.arc(cxp, cyp, rInP, Math.PI * 1.5, Math.PI, true);
      g.closePath();
      g.fill();
    });
    if (name) {
      const am = (a0 + a1) / 2;
      const rm = (rIn + rOut) / 2;
      label(name, new THREE.Vector3(cx + Math.cos(am) * rm, h + 1.6, cz - Math.sin(am) * rm), roof);
    }
  }

  // 綠水樓
  addBuilding({ x0: 1160, y0: 285, x1: 1780, y1: 490, floors: 5, wall: "#bff0cf", roof: "#3fb56e", name: "🌿 綠水樓" });
  // 藍天樓
  addBuilding({ x0: 750, y0: 530, x1: 1170, y1: 725, floors: 5, wall: "#bfe6ff", roof: "#3d9be9", name: "☁️ 藍天樓" });
  addBuilding({ x0: 190, y0: 445, x1: 545, y1: 710, floors: 5, wall: "#bfe6ff", roof: "#5aaef0" });
  // 紫霞樓
  addBuilding({ x0: 525, y0: 735, x1: 720, y1: 1090, floors: 5, wall: "#e2d0fa", roof: "#a574e8", name: "🔮 紫霞樓" });
  // 靛海樓 (弧形)
  addSector(525, 730, 205, 360, Math.PI, Math.PI * 1.5, 5, "#c4eef6", "#3cb9d4", "🌊 靛海樓");
  addSector(525, 730, 120, 205, Math.PI, Math.PI * 1.5, 5, "#e2d0fa", "#a574e8");
  // 黃蝶樓
  addBuilding({ x0: 960, y0: 755, x1: 1590, y1: 1000, floors: 5, wall: "#fff0b3", roof: "#f7bf1c", name: "🦋 黃蝶樓" });
  // 橙陽樓
  addBuilding({ x0: 1595, y0: 515, x1: 1830, y1: 840, floors: 4, wall: "#ffd8b3", roof: "#ff8f35", name: "🌞 橙陽樓" });
  addBuilding({ x0: 1595, y0: 875, x1: 1830, y1: 1200, floors: 4, wall: "#ffd8b3", roof: "#ff8f35" });
  // 紅楓樓
  addBuilding({ x0: 970, y0: 1235, x1: 1770, y1: 1480, floors: 5, wall: "#ffcfd8", roof: "#ee3b55", name: "🍁 紅楓樓" });

  // 彩虹樓 (圓形)
  {
    const cx = px2x(710);
    const cz = py2z(1330);
    const R = len(225) - 0.15;
    const h = 5 * FLOOR_H;
    const base = facadeBase("#ffd3e4", "#ff8fb8");
    const side = facadeMat(base, Math.round((2 * Math.PI * R) / 1.6), 5);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, h, 64), [side, lambert("#ff8fb8"), lambert("#ff8fb8")]);
    body.position.set(cx, h / 2, cz);
    scene.add(shadowed(body));
    const rainbow = ["#ff4d4d", "#ff9a3d", "#ffd93d", "#5cd65c", "#3d9bff", "#a96bff"];
    rainbow.forEach((c, i) => {
      const r = R + 0.15 - i * ((R - 0.8) / 6);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 64), lambert(c));
      disc.position.set(cx, h + 0.06 + i * 0.1, cz);
      scene.add(shadowed(disc));
    });
    solids.push(circleSolid(cx, cz, R, h + 0.6));
    mini.push((g) => {
      const cols = ["#ff8fb8", "#ffd93d", "#5cd65c", "#3d9bff"];
      cols.forEach((c, i) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(710, 1330, 225 - i * 45, 0, Math.PI * 2);
        g.fill();
      });
    });
    label("🌈 彩虹樓", new THREE.Vector3(cx, h + 1.8, cz), "#ff7aa8");
  }

  // ---------- flat zones ----------
  // 晨光廣場
  flatRect(560, 450, 800, 730, "#c9e68f");
  label("晨光廣場 · 網球場", new THREE.Vector3(px2x(680), 0.6, py2z(590)), "#8cc43f", true);
  {
    // 網球場線
    const lineMat = lambert("#ffffff");
    const mk = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
      m.position.set(px2x(x), 0.08, py2z(z));
      scene.add(m);
    };
    mk(5, 0.08, 680, 500);
    mk(5, 0.08, 680, 680);
    mk(0.08, 4.5, 560 + 45, 590);
    mk(0.08, 4.5, 800 - 45, 590);
    mk(5, 0.08, 680, 590);
  }
  // 中庭花園 / 體育館
  flatRect(1150, 575, 1495, 740, "#a7a29b");
  flatRect(1260, 595, 1480, 725, "#ffe07a");
  // 遊戲區
  flatRect(990, 1067, 1515, 1200, "#e3b896");
  label("🛝 遊戲區", new THREE.Vector3(px2x(1250), 1.4, py2z(1190)), "#d79a64", true);
  label("🌻 中庭花園 / B2 體育館", new THREE.Vector3(px2x(1320), 1.4, py2z(660)), "#e0a52b", true);
  // 沙坑
  flatRect(1935, 440, 2085, 490, "#d9a05b", 0.03, 0.15);
  label("沙坑", new THREE.Vector3(px2x(2010), 1.2, py2z(465)), "#b57a35", true);
  // 汙水處理廠
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len(130), 1.2, len(33)), lambert("#c9d1d8"));
    b.position.set(px2x(1965), 0.6, py2z(411));
    scene.add(shadowed(b));
    solids.push(rectSolid(px2x(1900), py2z(395), px2x(2030), py2z(428), 1.2));
    mini.push((g) => {
      g.fillStyle = "#c9d1d8";
      g.fillRect(1900, 395, 130, 33);
    });
    label("汙水處理廠", new THREE.Vector3(px2x(1965), 2.2, py2z(411)), "#8895a1", true);
  }
  // 小型垃圾場
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len(127), 0.9, len(73)), lambert("#d8dde2"));
    b.position.set(px2x(1856), 0.45, py2z(1451));
    scene.add(shadowed(b));
    solids.push(rectSolid(px2x(1793), py2z(1415), px2x(1920), py2z(1488), 0.9));
    mini.push((g) => {
      g.fillStyle = "#d8dde2";
      g.fillRect(1793, 1415, 127, 73);
    });
    label("🗑️ 小型垃圾場", new THREE.Vector3(px2x(1856), 1.8, py2z(1451)), "#8895a1", true);
  }
  // 警衛室
  {
    const x0 = px2x(90);
    const x1 = px2x(195);
    const z0 = py2z(1168);
    const z1 = py2z(1220);
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.8, z1 - z0), lambert("#ffffff"));
    b.position.set((x0 + x1) / 2, 0.9, (z0 + z1) / 2);
    const r = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.3, 0.25, z1 - z0 + 0.3), lambert("#ff5a5a"));
    r.position.set((x0 + x1) / 2, 1.9, (z0 + z1) / 2);
    scene.add(shadowed(b), shadowed(r));
    solids.push(rectSolid(x0, z0, x1, z1, 2.0));
    mini.push((g) => {
      g.fillStyle = "#ff5a5a";
      g.fillRect(90, 1168, 105, 52);
    });
    label("警衛室", new THREE.Vector3((x0 + x1) / 2, 3.0, (z0 + z1) / 2), "#ff6b6b", true);
  }
  // 爬竿場
  {
    for (let i = 0; i < 4; i++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 10), lambert("#ffd23d"));
      pole.position.set(px2x(2180), 1.5, py2z(1105 + i * 38));
      scene.add(shadowed(pole));
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, len(130)), lambert("#ff7a3d"));
    top.position.set(px2x(2180), 3.05, py2z(1170));
    scene.add(shadowed(top));
    label("爬竿場", new THREE.Vector3(px2x(2180), 3.8, py2z(1170)), "#7a6bd6", true);
  }
  // B2 停車場斜坡
  {
    const p1 = [140, 1340];
    const p2 = [300, 1530];
    const dx = (p2[0] - p1[0]) / 40;
    const dz = (p2[1] - p1[1]) / 40;
    const L = Math.hypot(dx, dz);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 3), lambert("#5b6270"));
    ramp.position.set(px2x((p1[0] + p2[0]) / 2), 0.04, py2z((p1[1] + p2[1]) / 2));
    ramp.rotation.y = -Math.atan2(dz, dx);
    ramp.receiveShadow = true;
    scene.add(ramp);
    for (let i = 0; i < 6; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.12), lambert("#ffe14d"));
      const f = (i + 0.5) / 6;
      dash.position.set(px2x(p1[0] + (p2[0] - p1[0]) * f), 0.09, py2z(p1[1] + (p2[1] - p1[1]) * f));
      dash.rotation.y = -Math.atan2(dz, dx);
      scene.add(dash);
    }
    mini.push((g) => {
      g.strokeStyle = "#5b6270";
      g.lineWidth = 60;
      g.beginPath();
      g.moveTo(p1[0], p1[1]);
      g.lineTo(p2[0], p2[1]);
      g.stroke();
    });
    label("🅿️ B2 地下停車場", new THREE.Vector3(px2x(220), 1.0, py2z(1435)), "#4b5563", true);
  }

  // 生態教材園
  {
    const cx = px2x(145);
    const cz = py2z(560);
    const shore = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 40), lambert("#f5dfa0"));
    shore.scale.set(2.8, 1, 4.1);
    shore.position.set(cx, 0.06, cz);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 40), lambert("#62d2ff", { transparent: true, opacity: 0.92 }));
    water.scale.set(2.4, 1, 3.7);
    water.position.set(cx, 0.11, cz);
    shore.receiveShadow = true;
    scene.add(shore, water);
    for (let i = 0; i < 5; i++) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), lambert("#4cc45a"));
      pad.position.set(cx + (Math.random() - 0.5) * 3, 0.2, cz + (Math.random() - 0.5) * 5);
      scene.add(pad);
      if (i % 2 === 0) {
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), lambert("#ff8fc2"));
        fl.position.set(pad.position.x, 0.33, pad.position.z);
        scene.add(fl);
      }
    }
    label("🐸 生態教材園", new THREE.Vector3(cx, 1.3, cz), "#32aee0", true);
    mini.push((g) => {
      g.fillStyle = "#62d2ff";
      g.beginPath();
      g.ellipse(145, 560, 95, 150, 0, 0, Math.PI * 2);
      g.fill();
    });
  }

  // 操場 (跑道)
  function stadium(cxp: number, cyp: number, wU: number, hU: number, color: string, y: number, depth: number) {
    const cx = px2x(cxp);
    const cz = py2z(cyp);
    const r = wU / 2;
    const hs = (hU - wU) / 2;
    const sh = new THREE.Shape();
    sh.moveTo(cx - r, -cz - hs);
    sh.lineTo(cx - r, -cz + hs);
    sh.absarc(cx, -cz + hs, r, Math.PI, 0, true);
    sh.lineTo(cx + r, -cz - hs);
    sh.absarc(cx, -cz - hs, r, 0, Math.PI, true);
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 32 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, lambert(color));
    m.position.y = y;
    m.receiveShadow = true;
    scene.add(m);
  }
  stadium(2007, 855, len(325), len(680), "#2e6bc6", 0.0, 0.05);
  stadium(2007, 855, len(325) - 1.7, len(680) - 1.7, "#a6d977", 0.0, 0.08);
  flatRect(1912, 690, 2102, 1100, "#ee5a22", 0.0, 0.1, false);
  for (const [a, b] of [[705, 785], [828, 908], [950, 1030]]) {
    flatRect(1930, a, 2084, b, "#58b85a", 0.0, 0.14, false);
    flatRect(1930, a, 2084, a + 4, "#ffffff", 0.0, 0.16, false);
    flatRect(1930, b - 4, 2084, b, "#ffffff", 0.0, 0.16, false);
  }
  mini.push((g) => {
    g.fillStyle = "#2e6bc6";
    g.beginPath();
    g.roundRect(1845, 515, 325, 680, 160);
    g.fill();
    g.fillStyle = "#ee5a22";
    g.fillRect(1912, 690, 190, 410);
    g.fillStyle = "#58b85a";
    g.fillRect(1930, 705, 154, 80);
    g.fillRect(1930, 828, 154, 80);
    g.fillRect(1930, 950, 154, 80);
  });
  label("🏃 操場", new THREE.Vector3(px2x(2007), 1.2, py2z(630)), "#2e6bc6");

  // 光電球場
  flatRect(2030, 1262, 2185, 1490, "#3b73d1", 0, 0.1);
  flatRect(2068, 1262, 2148, 1490, "#ffcf33", 0, 0.12, false);
  flatRect(2088, 1360, 2128, 1400, "#3b73d1", 0, 0.14, false);
  for (const zz of [1285, 1470]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), lambert("#e8e8e8"));
    post.position.set(px2x(2108), 1.3, py2z(zz));
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.06), lambert("#ffffff"));
    board.position.set(px2x(2108), 2.6, py2z(zz) + (zz < 1380 ? 0.2 : -0.2));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 16), lambert("#ff5a2a"));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(px2x(2108), 2.35, py2z(zz) + (zz < 1380 ? 0.45 : -0.45));
    scene.add(shadowed(post), shadowed(board), ring);
  }
  label("🏀 光電球場", new THREE.Vector3(px2x(2108), 1.3, py2z(1375)), "#2f64c0", true);

  // 彩色積木 (遊戲區, 可以跳上去)
  {
    const cols = ["#ff5a5a", "#ffb02e", "#4cc45a", "#3d9bff"];
    const steps = [
      { x: 1085, h: 0.8 },
      { x: 1140, h: 1.6 },
      { x: 1195, h: 2.4 },
      { x: 1250, h: 1.6 },
      { x: 1305, h: 0.8 },
    ];
    steps.forEach((s, i) => {
      const x = px2x(s.x);
      const z = py2z(1130);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, s.h, 1.3), lambert(cols[i % cols.length]));
      m.position.set(x, s.h / 2, z);
      scene.add(shadowed(m));
      solids.push(rectSolid(x - 0.65, z - 0.65, x + 0.65, z + 0.65, s.h));
    });
  }

  // ---------- walls & gates ----------
  const WALL_H = 1.1;
  function wallBox(a: number, b: number, fixed: number, axis: "x" | "z") {
    // a,b in px along axis; fixed = px on the other axis
    const t = 0.5;
    let x0: number, x1: number, z0: number, z1: number;
    if (axis === "x") {
      x0 = px2x(a);
      x1 = px2x(b);
      z0 = py2z(fixed) - t / 2;
      z1 = py2z(fixed) + t / 2;
    } else {
      z0 = py2z(a);
      z1 = py2z(b);
      x0 = px2x(fixed) - t / 2;
      x1 = px2x(fixed) + t / 2;
    }
    const w = x1 - x0;
    const d = z1 - z0;
    const longLen = axis === "x" ? w : d;
    const brick = brickBase.clone();
    brick.repeat.set(Math.max(1, longLen / 1.6), 1);
    brick.needsUpdate = true;
    const longMat = new THREE.MeshLambertMaterial({ map: brick });
    const plain = lambert("#c4582d");
    const topMat = lambert("#ffb36b");
    const mats = axis === "x" ? [plain, plain, topMat, topMat, longMat, longMat] : [longMat, longMat, topMat, topMat, plain, plain];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), mats);
    m.position.set((x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2);
    scene.add(shadowed(m));
    solids.push(rectSolid(x0, z0, x1, z1, WALL_H));
  }
  function wallLine(from: number, to: number, fixed: number, axis: "x" | "z", gaps: [number, number][]) {
    let cur = from;
    for (const [g0, g1] of gaps) {
      wallBox(cur, g0, fixed, axis);
      cur = g1;
    }
    wallBox(cur, to, fixed, axis);
  }
  const L = 70, R = 2210, T = 270, B = 1570;
  wallLine(L - 12, R + 12, T, "x", [[942, 1062], [1832, 1952]]);
  wallLine(L - 12, R + 12, B, "x", [[872, 992], [1842, 1962]]);
  wallLine(T, B, L, "z", [[960, 1155]]);
  wallLine(T, B, R, "z", [[818, 938]]);
  mini.push((g) => {
    g.strokeStyle = "#8c3b1c";
    g.lineWidth = 8;
    g.strokeRect(L, T, R - L, B - T);
  });

  function pipe(x: number, z: number, hgt = 1.5) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, hgt, 20), lambert("#2fb84a"));
    body.position.y = hgt / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.32, 20), lambert("#3fd45c"));
    rim.position.y = hgt;
    g.add(body, rim);
    g.position.set(x, 0, z);
    scene.add(shadowed(g));
    solids.push(circleSolid(x, z, 0.62, hgt + 0.16));
  }
  const gateOpenings: Record<string, [number, number]> = {
    北一門: [942, 1062],
    北二門: [1832, 1952],
    南一門: [872, 992],
    南二門: [1842, 1962],
    東門: [818, 938],
    正門: [960, 1155],
  };
  for (const g of GATES) {
    const [a, b] = gateOpenings[g.name];
    const lbl = (px: number, pz: number) => label(g.name, new THREE.Vector3(px, 3.1, pz), "#e8344e");
    if (g.axis === "x") {
      pipe(px2x(a) - 0.1, py2z(g.p[1]));
      pipe(px2x(b) + 0.1, py2z(g.p[1]));
      lbl(px2x((a + b) / 2), py2z(g.p[1]));
    } else {
      pipe(px2x(g.p[0]), py2z(a) - 0.1);
      pipe(px2x(g.p[0]), py2z(b) + 0.1);
      lbl(px2x(g.p[0]), py2z((a + b) / 2));
    }
  }

  // ---------- decoration: trees, flowers, hills, clouds ----------
  function tree(x: number, z: number, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.2 * s, 8), lambert("#a8683a"));
    trunk.position.y = 0.6 * s;
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.9 * s, 14, 12), lambert("#47c35a"));
    c1.position.y = 1.8 * s;
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.6 * s, 12, 10), lambert("#5bd56c"));
    c2.position.set(0.5 * s, 2.3 * s, 0.1 * s);
    g.add(trunk, c1, c2);
    g.position.set(x, 0, z);
    scene.add(shadowed(g));
    solids.push(circleSolid(x, z, 0.3 * s, 8));
  }
  const treeSpots: [number, number, number][] = [
    [130, 330, 1.2], [200, 380, 1], [100, 460, 1.1], [60, 660, 1], [230, 690, 1.1],
    [100, 800, 1], [90, 900, 1.2], [1100, 330, 1], [1100, 450, 1],
    [1180, 600, 0.9], [1470, 600, 0.9], [1230, 700, 0.9], [1400, 700, 0.9],
    [1190, 1100, 0.9], [1470, 1170, 0.9], [1020, 1170, 0.9], [1050, 1100, 0.9],
    [1850, 330, 1], [2150, 330, 1.2], [2180, 420, 1], [2180, 600, 1], [2190, 760, 1.1],
    [2200, 960, 1], [1860, 1130, 0.9], [1860, 1330, 1], [1990, 1330, 1],
    [800, 1530, 1], [1300, 1530, 1], [1600, 1530, 1], [2100, 1535, 1.2], [600, 1530, 1],
    [90, 1280, 1], [120, 1500, 1.2], [400, 1530, 1], [880, 640, 1],
    [820, 810, 0.9], [790, 900, 0.9], [790, 1010, 0.9],
  ];
  for (const [px, py, s] of treeSpots) {
    const x = px2x(px);
    const z = py2z(py);
    if (solids.some((so) => so.top > 0.5 && so.test(x, z, 0.6))) continue;
    tree(x, z, s);
  }
  // 花朵
  for (let i = 0; i < 70; i++) {
    const px = 1160 + Math.random() * 330;
    const py = 590 + Math.random() * 140;
    const cols = ["#ff6fa3", "#ffffff", "#ff9a3d", "#b07cff"];
    const f = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), lambert("#3da84a"));
    stem.position.y = 0.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), lambert(cols[i % cols.length]));
    head.position.y = 0.34;
    f.add(stem, head);
    f.position.set(px2x(px), 0.04, py2z(py));
    scene.add(f);
  }

  // 超級瑪利風格有眼睛的小山
  function hill(x: number, z: number, r: number, hh: number, color: string) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), lambert(color));
    body.scale.set(r, hh, r);
    g.add(body);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), lambert("#1f2a1f"));
      eye.scale.set(0.09 * r, 0.18 * hh, 0.05 * r);
      eye.position.set(sx * 0.13 * r, hh * 0.55, r * 0.78);
      g.add(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), lambert("#ffffff"));
      shine.scale.set(0.03 * r, 0.05 * hh, 0.02 * r);
      shine.position.set(sx * 0.13 * r, hh * 0.65, r * 0.83);
      g.add(shine);
    }
    g.position.set(x, -0.05, z);
    g.lookAt(0, -0.05, 0);
    g.rotation.x = 0;
    g.rotation.z = 0;
    scene.add(shadowed(g, false, true));
  }
  const hillCols = ["#58c95a", "#4fbf6a", "#6bd45a"];
  const hillPts: [number, number, number, number][] = [
    [-36, -26, 7, 5], [-18, -30, 9, 6], [2, -33, 8, 5], [22, -29, 10, 6.5], [40, -24, 7, 5],
    [-42, -8, 7, 5], [-44, 12, 9, 6], [-34, 28, 8, 5], [-14, 32, 7, 4.5], [8, 34, 10, 6],
    [28, 31, 8, 5], [44, 18, 8, 5.5], [46, -2, 9, 6],
  ];
  hillPts.forEach(([x, z, r, h], i) => hill(x, z, r, h, hillCols[i % 3]));

  // 雲朵
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const m = lambert("#ffffff", { emissive: new THREE.Color("#dff3ff"), emissiveIntensity: 0.4 });
    for (const [x, y, r] of [[0, 0, 1.3], [1.4, -0.2, 1], [-1.4, -0.2, 1], [0.7, 0.6, 0.9], [-0.7, 0.5, 0.8]]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m);
      s.position.set(x, y, 0);
      s.scale.y = 0.75;
      g.add(s);
    }
    for (const sx of [-0.35, 0.35]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), lambert("#222"));
      e.position.set(sx, 0.15, 1.28);
      g.add(e);
    }
    const sc = 0.9 + Math.random() * 1.1;
    g.scale.setScalar(sc);
    g.position.set((Math.random() - 0.5) * 100, 12 + Math.random() * 8, (Math.random() - 0.5) * 70);
    g.userData.base = g.position.y;
    g.userData.ph = Math.random() * 6;
    scene.add(g);
    clouds.push(g);
  }
  animated.push((t) => {
    clouds.forEach((c) => {
      c.position.y = c.userData.base + Math.sin(t * 0.6 + c.userData.ph) * 0.6;
      c.position.x += 0.004;
      if (c.position.x > 55) c.position.x = -55;
      c.lookAt(camera.position.x, c.position.y, camera.position.z);
    });
  });

  // ---------- question blocks ----------
  const qTex = questionTexture("#ffc42e", "#c97a00");
  const usedTex = questionTexture("#b58a5a", "#6e4a28", false);
  interface Block {
    mesh: THREE.Mesh;
    x: number;
    z: number;
    baseY: number;
    hit: boolean;
    bounce: number;
    cool: number;
    info: (typeof BLOCKS)[number];
  }
  const blocks: Block[] = BLOCKS.map((info) => {
    const mat = new THREE.MeshLambertMaterial({ map: qTex, emissive: new THREE.Color("#442200"), emissiveIntensity: 0.25 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const x = px2x(info.at[0]);
    const z = py2z(info.at[1]);
    mesh.position.set(x, 3.1, z);
    scene.add(shadowed(mesh));
    return { mesh, x, z, baseY: 3.1, hit: false, bounce: 0, cool: 0, info };
  });

  // ---------- coins ----------
  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 20);
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshLambertMaterial({ color: "#ffd21f", emissive: new THREE.Color("#ff9d00"), emissiveIntensity: 0.55 });
  const coinInner = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16);
  coinInner.rotateX(Math.PI / 2);
  const coinInnerMat = new THREE.MeshLambertMaterial({ color: "#ffed7a", emissive: new THREE.Color("#ffb800"), emissiveIntensity: 0.4 });
  interface Coin {
    g: THREE.Group;
    got: boolean;
    ph: number;
    value: number;
  }
  const coins: Coin[] = [];
  function makeCoin(x: number, z: number, y = 0.95, value = 1) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(coinGeo, coinMat), new THREE.Mesh(coinInner, coinInnerMat));
    g.position.set(x, y, z);
    g.castShadow = true;
    scene.add(g);
    coins.push({ g, got: false, ph: Math.random() * 6, value });
  }
  const coinLines: [number, number][][] = [
    [[100, 1050], [480, 1160], [850, 1090], [930, 1000], [930, 770]],
    [[930, 740], [1560, 740], [1560, 520], [1190, 520], [1190, 700]],
    [[1560, 520], [1880, 500]],
    [[1000, 1217], [1780, 1217], [1830, 1230], [2105, 1235]],
    [[1810, 1250], [1810, 1500], [1100, 1530]],
    [[100, 300], [600, 300], [1000, 300], [1140, 360], [1140, 520]],
    [[100, 300], [100, 900]],
    [[1800, 300], [2150, 300], [2150, 500]],
    [[100, 1250], [100, 1530]],
    [[1960, 560], [2055, 560], [2135, 640], [2135, 1070], [2055, 1150], [1960, 1150], [1880, 1070], [1880, 640], [1960, 560]],
    [[1050, 1090], [1500, 1090]],
    [[1240, 620], [1400, 700]],
    [[2105, 1300], [2105, 1450]],
    [[300, 1130], [190, 1010], [180, 700]],
  ];
  for (const line of coinLines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const dist = Math.hypot(bx - ax, by - ay) / 40;
      const n = Math.max(1, Math.floor(dist / 2));
      for (let k = 0; k < n; k++) {
        const f = k / n;
        const x = px2x(ax + (bx - ax) * f);
        const z = py2z(ay + (by - ay) * f);
        if (solids.some((s) => s.top > 0.5 && s.test(x, z, 0.35))) continue;
        if (coins.some((c) => Math.hypot(c.g.position.x - x, c.g.position.z - z) < 1.2)) continue;
        makeCoin(x, z);
      }
    }
  }
  // 屋頂/積木上的獎勵硬幣
  makeCoin(px2x(1140), py2z(1130), 2.6);
  makeCoin(px2x(1250), py2z(1130), 2.6);
  const totalCoins = coins.reduce((a, c) => a + c.value, 0) + 5;

  // 超級星星
  const star = new THREE.Group();
  {
    const sh = new THREE.Shape();
    const spikes = 5;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? 0.55 : 0.25;
      const a = (i / (spikes * 2)) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) sh.moveTo(x, y);
      else sh.lineTo(x, y);
    }
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    geo.translate(0, 0, -0.11);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: "#fff23d", emissive: new THREE.Color("#ffc400"), emissiveIntensity: 0.7 }));
    star.add(m);
    for (const sx of [-0.14, 0.14]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lambert("#222"));
      e.position.set(sx, 0.05, 0.22);
      star.add(e);
    }
    star.position.set(px2x(1195), 3.5, py2z(1130));
    scene.add(star);
  }
  let starGot = false;

  // ---------- flag ----------
  const flagPos = new THREE.Vector3(px2x(1960), 0, py2z(1250));
  {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 10), lambert("#e8f5e8"));
    pole.position.y = 3;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), lambert("#ffd21f", { emissive: new THREE.Color("#ffa800"), emissiveIntensity: 0.5 }));
    ball.position.y = 6.15;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1), lambert("#6b7280"));
    base.position.y = 0.2;
    const fs = new THREE.Shape();
    fs.moveTo(0, 0);
    fs.lineTo(1.7, -0.5);
    fs.lineTo(0, -1.0);
    fs.closePath();
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(fs), new THREE.MeshLambertMaterial({ color: "#ff4d6d", side: THREE.DoubleSide }));
    flag.position.set(0.07, 5.8, 0);
    g.add(pole, ball, base, flag);
    g.position.copy(flagPos);
    scene.add(shadowed(g));
    label("🏁 終點旗", new THREE.Vector3(flagPos.x, 7.2, flagPos.z), "#ff4d6d");
    animated.push((t) => {
      flag.rotation.y = Math.sin(t * 3) * 0.25;
    });
    mini.push((gg) => {
      gg.fillStyle = "#ff4d6d";
      gg.beginPath();
      gg.arc(1960, 1250, 22, 0, Math.PI * 2);
      gg.fill();
    });
  }

  // ---------- hero ----------
  const hero = new THREE.Group();
  const heroInner = new THREE.Group();
  hero.add(heroInner);
  const parts: Record<string, THREE.Object3D> = {};
  {
    const skin = lambert("#ffd0a3");
    const red = lambert("#ee2f3b");
    const blue = lambert("#2f6fe0");
    const brown = lambert("#6a3a1c");
    const white = lambert("#ffffff");
    const sph = (r: number, m: THREE.Material, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), m);
      mesh.scale.set(sx, sy, sz);
      return mesh;
    };
    // body
    const belly = sph(0.4, blue, 1, 0.95, 0.95);
    belly.position.y = 0.62;
    const chest = sph(0.32, red, 1.05, 0.85, 0.9);
    chest.position.y = 0.95;
    const bib = sph(0.28, blue, 0.95, 0.75, 0.7);
    bib.position.set(0, 0.88, 0.14);
    for (const sx of [-0.14, 0.14]) {
      const btn = sph(0.05, lambert("#ffd21f"));
      btn.position.set(sx, 0.9, 0.4);
      heroInner.add(btn);
    }
    heroInner.add(belly, chest, bib);
    // legs
    for (const [name, sx] of [["legL", -0.16], ["legR", 0.16]] as const) {
      const leg = new THREE.Group();
      leg.position.set(sx, 0.4, 0);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.34, 10), blue);
      l.position.y = -0.1;
      const shoe = sph(0.2, brown, 1, 0.7, 1.35);
      shoe.position.set(0, -0.3, 0.07);
      leg.add(l, shoe);
      heroInner.add(leg);
      parts[name] = leg;
    }
    // arms
    for (const [name, sx] of [["armL", -0.42], ["armR", 0.42]] as const) {
      const arm = new THREE.Group();
      arm.position.set(sx, 1.0, 0);
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.34, 10), red);
      a.position.y = -0.17;
      const glove = sph(0.14, white);
      glove.position.y = -0.38;
      arm.add(a, glove);
      heroInner.add(arm);
      parts[name] = arm;
    }
    // head
    const head = new THREE.Group();
    head.position.y = 1.5;
    const face = sph(0.4, skin, 1.05, 0.95, 1);
    const hair = sph(0.36, brown, 1.05, 0.8, 0.9);
    hair.position.set(0, -0.05, -0.12);
    const nose = sph(0.12, lambert("#ffb48a"));
    nose.position.set(0, -0.05, 0.4);
    head.add(face, hair, nose);
    for (const sx of [-1, 1]) {
      const eye = sph(0.065, lambert("#1a1a1a"), 1, 1.6, 0.6);
      eye.position.set(sx * 0.14, 0.08, 0.35);
      const shine = sph(0.02, white);
      shine.position.set(sx * 0.14 + 0.012, 0.13, 0.385);
      const ear = sph(0.1, skin, 0.6, 1, 1);
      ear.position.set(sx * 0.42, -0.02, 0);
      const mus = sph(0.1, brown, 1.3, 0.7, 0.8);
      mus.position.set(sx * 0.1, -0.2, 0.36);
      const cheek = sph(0.07, lambert("#ff9a9a"), 1.2, 0.7, 0.4);
      cheek.position.set(sx * 0.27, -0.08, 0.3);
      head.add(eye, shine, ear, mus, cheek);
    }
    // cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), red);
    cap.scale.set(1.05, 1.0, 1.05);
    cap.position.set(0, 0.1, -0.02);
    cap.rotation.x = -0.15;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.06, 20, 1, false, -Math.PI / 2 + 0.0, Math.PI), red);
    brim.position.set(0, 0.16, 0.18);
    brim.scale.set(1.2, 1, 1.1);
    brim.rotation.y = Math.PI / 2 - Math.PI / 2;
    brim.rotation.x = 0.1;
    // emblem
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ee2f3b";
    g.font = "900 84px 'Noto Sans TC','Microsoft JhengHei',sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("光", 64, 68);
    const et = new THREE.CanvasTexture(c);
    et.colorSpace = THREE.SRGBColorSpace;
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), new THREE.MeshBasicMaterial({ map: et, transparent: true }));
    emblem.position.set(0, 0.36, 0.34);
    emblem.rotation.x = -0.45;
    head.add(cap, brim, emblem);
    heroInner.add(head);
    parts.head = head;
  }
  hero.scale.setScalar(PLAYER_SCALE);
  scene.add(shadowed(hero));
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // ---------- students (小學生 NPC) ----------
  const studentMats = new Map<string, THREE.Material>();
  const smat = (c: string) => {
    let m = studentMats.get(c);
    if (!m) {
      m = lambert(c);
      studentMats.set(c, m);
    }
    return m;
  };
  const pickOne = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const sSphere = new THREE.SphereGeometry(1, 16, 12);
  const sCyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  const sBox = new THREE.BoxGeometry(1, 1, 1);
  const sSkirt = new THREE.CylinderGeometry(0.17, 0.31, 0.26, 14);
  function sp(mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(sSphere, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    return m;
  }
  interface StudentParts {
    legL: THREE.Group;
    legR: THREE.Group;
    armL: THREE.Group;
    armR: THREE.Group;
    head: THREE.Group;
    inner: THREE.Group;
  }
  const ginghamBlue = checkerTexture("#8fa9c4", "#e9f1f7", 32);
  ginghamBlue.repeat.set(3, 2);
  const ginghamGrey = checkerTexture("#7d8590", "#d8dce1", 32);
  ginghamGrey.repeat.set(3, 2);
  const ginghamBlueMat = new THREE.MeshLambertMaterial({ map: ginghamBlue });
  const ginghamGreyMat = new THREE.MeshLambertMaterial({ map: ginghamGrey });
  const sBandGeo = new THREE.CylinderGeometry(0.295, 0.308, 0.05, 18);
  const sLineGeo = new THREE.CylinderGeometry(0.3, 0.303, 0.022, 18);
  const sFlapGeo = new THREE.CylinderGeometry(0.24, 0.37, 0.09, 4);
  const sCollarGeo = new THREE.TorusGeometry(0.185, 0.04, 8, 18);
  const sGlassGeo = new THREE.TorusGeometry(0.058, 0.011, 8, 20);
  function buildStudent() {
    const skin = smat(pickOne(["#ffd0a3", "#ffcf9e", "#f2b98a", "#ffe0bd"]));
    const hairM = smat(pickOne(["#3a2a1a", "#5a3a1a", "#20242a", "#7a4a21", "#8c5a2b"]));
    const packM = smat(pickOne(["#ff5964", "#ffb02e", "#35a7ff", "#6bf178", "#b388ff", "#ff8fc2", "#ffd21f"]));
    const girl = Math.random() < 0.5;
    const formal = Math.random() < 0.5;
    // 光復國小夏季運動服:女生粉紅、男生藍色;制服:薄荷綠上衣 + 格子下著
    const accent = smat(girl ? "#f4538f" : "#45a8e8");
    const white = smat("#ffffff");
    const mint = smat("#63cdbc");
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);
    const mkLeg = (sx: number) => {
      const leg = new THREE.Group();
      leg.position.set(sx, 0.44, 0);
      const l = new THREE.Mesh(sCyl, skin);
      l.scale.set(0.085, 0.3, 0.085);
      l.position.y = -0.15;
      const shoe = sp(smat(pickOne(["#ffffff", "#ff5964", "#35a7ff", "#ffd21f"])), 0.09, 0.065, 0.15, 0, -0.32, 0.035);
      leg.add(l, shoe);
      inner.add(leg);
      return leg;
    };
    const legL = mkLeg(-0.11);
    const legR = mkLeg(0.11);
    // 下身:運動短褲(側邊白條紋) / 女生制服格子裙 / 男生制服格子短褲
    if (!formal) {
      const shorts = new THREE.Mesh(sCyl, accent);
      shorts.scale.set(0.21, 0.2, 0.21);
      shorts.position.y = 0.5;
      inner.add(shorts);
      for (const sx of [-1, 1]) {
        const stripe = new THREE.Mesh(sBox, white);
        stripe.scale.set(0.03, 0.16, 0.1);
        stripe.position.set(sx * 0.2, 0.5, 0);
        inner.add(stripe);
      }
    } else if (girl) {
      const skirt = new THREE.Mesh(sSkirt, ginghamBlueMat);
      skirt.position.y = 0.52;
      inner.add(skirt);
    } else {
      const shorts = new THREE.Mesh(sCyl, ginghamGreyMat);
      shorts.scale.set(0.21, 0.2, 0.21);
      shorts.position.y = 0.5;
      inner.add(shorts);
    }
    // 上身
    if (!formal) {
      // 夏季運動服:白色胸前 + 彩色下擺 + 灰條紋帶(男生多一條紅線)+ 胸前小校徽
      inner.add(sp(accent, 0.3, 0.27, 0.27, 0, 0.64, 0));
      inner.add(sp(white, 0.29, 0.21, 0.26, 0, 0.85, 0));
      const band = new THREE.Mesh(sBandGeo, smat("#c7ccd1"));
      band.scale.set(1, 1, 0.9);
      band.position.y = 0.765;
      inner.add(band);
      if (!girl) {
        const line = new THREE.Mesh(sLineGeo, smat("#d06055"));
        line.scale.set(1, 1, 0.9);
        line.position.y = 0.8;
        inner.add(line);
      }
      inner.add(sp(smat("#3fae6a"), 0.045, 0.045, 0.02, 0.13, 0.86, 0.245));
    } else {
      // 制服:薄荷綠上衣 + 格子領(女:水手領)+ 藍色掛繩識別證 + 校徽
      inner.add(sp(mint, 0.3, 0.32, 0.27, 0, 0.74, 0));
      if (girl) {
        const flap = new THREE.Mesh(sFlapGeo, ginghamBlueMat);
        flap.rotation.y = Math.PI / 4;
        flap.scale.set(1.1, 1, 0.95);
        flap.position.y = 0.95;
        inner.add(flap);
      } else {
        const col = new THREE.Mesh(sCollarGeo, ginghamGreyMat);
        col.rotation.x = Math.PI / 2;
        col.position.y = 0.94;
        inner.add(col);
      }
      const lanyard = new THREE.Mesh(sBox, smat("#2f4bd7"));
      lanyard.scale.set(0.035, 0.24, 0.012);
      lanyard.position.set(0, 0.8, 0.275);
      lanyard.rotation.x = 0.08;
      const card = new THREE.Mesh(sBox, white);
      card.scale.set(0.12, 0.15, 0.02);
      card.position.set(0, 0.63, 0.285);
      inner.add(lanyard, card);
      inner.add(sp(white, 0.05, 0.05, 0.02, -0.13, 0.86, 0.245));
    }
    const pack = new THREE.Mesh(sBox, packM);
    pack.scale.set(0.36, 0.42, 0.17);
    pack.position.set(0, 0.78, -0.27);
    const pocket = new THREE.Mesh(sBox, smat("#ffffff"));
    pocket.scale.set(0.2, 0.18, 0.04);
    pocket.position.set(0, 0.72, -0.37);
    inner.add(pack, pocket);
    const sleeveM = formal ? mint : white;
    const mkArm = (sx: number) => {
      const arm = new THREE.Group();
      arm.position.set(sx, 0.88, 0);
      const sleeve = new THREE.Mesh(sCyl, sleeveM);
      sleeve.scale.set(0.078, 0.13, 0.078);
      sleeve.position.y = -0.06;
      arm.add(sleeve);
      if (!formal) {
        const cuff = new THREE.Mesh(sCyl, accent);
        cuff.scale.set(0.082, 0.045, 0.082);
        cuff.position.y = -0.13;
        arm.add(cuff);
      }
      const fore = new THREE.Mesh(sCyl, skin);
      fore.scale.set(0.058, 0.17, 0.058);
      fore.position.y = -0.21;
      arm.add(fore, sp(skin, 0.07, 0.07, 0.07, 0, -0.32, 0));
      inner.add(arm);
      return arm;
    };
    const armL = mkArm(-0.31);
    const armR = mkArm(0.31);
    const head = new THREE.Group();
    head.position.y = 1.08;
    head.add(sp(skin, 0.26, 0.27, 0.25, 0, 0, 0));
    const hairStyle = girl ? pickOne(["ponytail", "twin", "bob"]) : pickOne(["short", "cap", "short"]);
    if (hairStyle === "cap") {
      const capM = smat(pickOne(["#ff5964", "#35a7ff", "#ffd21f", "#6bf178"]));
      head.add(sp(hairM, 0.265, 0.17, 0.265, 0, 0.05, -0.04));
      head.add(sp(capM, 0.275, 0.15, 0.275, 0, 0.14, -0.01));
      head.add(sp(capM, 0.19, 0.035, 0.15, 0, 0.1, 0.24));
    } else {
      head.add(sp(hairM, 0.27, 0.23, 0.27, 0, 0.07, -0.03));
      if (hairStyle === "ponytail") {
        head.add(sp(hairM, 0.11, 0.17, 0.11, 0, 0.06, -0.28));
        head.add(sp(smat("#ff8fc2"), 0.05, 0.05, 0.05, 0, 0.19, -0.21));
      } else if (hairStyle === "twin") {
        head.add(sp(hairM, 0.1, 0.16, 0.1, -0.27, 0, -0.02));
        head.add(sp(hairM, 0.1, 0.16, 0.1, 0.27, 0, -0.02));
      }
    }
    for (const sx of [-1, 1]) {
      head.add(sp(smat("#26221f"), 0.032, 0.05, 0.02, sx * 0.095, 0.02, 0.235));
      head.add(sp(smat("#ff9db0"), 0.055, 0.035, 0.02, sx * 0.165, -0.06, 0.2));
    }
    head.add(sp(smat("#c65b4e"), 0.035, 0.018, 0.012, 0, -0.085, 0.24));
    inner.add(head);
    group.scale.setScalar(0.85 + Math.random() * 0.25);
    const parts: StudentParts = { legL, legR, armL, armR, head, inner };
    return { group, parts };
  }

  // 校長:灰色西裝 + 白襯衫 + 紫色條紋領帶 + 眼鏡
  function buildPrincipal() {
    const skin = smat("#f2c094");
    const suit = smat("#6d6a73");
    const dark = smat("#23252b");
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);
    const mkLeg = (sx: number) => {
      const leg = new THREE.Group();
      leg.position.set(sx, 0.44, 0);
      const l = new THREE.Mesh(sCyl, dark);
      l.scale.set(0.09, 0.34, 0.09);
      l.position.y = -0.17;
      const shoe = sp(smat("#1c1c22"), 0.095, 0.06, 0.16, 0, -0.36, 0.04);
      leg.add(l, shoe);
      inner.add(leg);
      return leg;
    };
    const legL = mkLeg(-0.11);
    const legR = mkLeg(0.11);
    inner.add(sp(suit, 0.32, 0.35, 0.28, 0, 0.76, 0));
    inner.add(sp(smat("#ffffff"), 0.15, 0.25, 0.12, 0, 0.84, 0.19));
    const tie = new THREE.Mesh(sBox, smat("#7b5ea7"));
    tie.scale.set(0.075, 0.32, 0.025);
    tie.position.set(0, 0.78, 0.305);
    tie.rotation.x = 0.05;
    inner.add(tie);
    const mkArm = (sx: number) => {
      const arm = new THREE.Group();
      arm.position.set(sx, 0.9, 0);
      const a = new THREE.Mesh(sCyl, suit);
      a.scale.set(0.075, 0.32, 0.075);
      a.position.y = -0.16;
      arm.add(a, sp(skin, 0.07, 0.07, 0.07, 0, -0.35, 0));
      inner.add(arm);
      return arm;
    };
    const armL = mkArm(-0.32);
    const armR = mkArm(0.32);
    const head = new THREE.Group();
    head.position.y = 1.08;
    head.add(sp(skin, 0.25, 0.27, 0.24, 0, 0, 0));
    head.add(sp(smat("#2e2a26"), 0.26, 0.18, 0.26, 0, 0.1, -0.03));
    for (const sx of [-1, 1]) {
      head.add(sp(smat("#c9c9c9"), 0.06, 0.09, 0.1, sx * 0.235, -0.02, -0.02));
      head.add(sp(smat("#26221f"), 0.028, 0.04, 0.015, sx * 0.095, 0.03, 0.225));
      const glass = new THREE.Mesh(sGlassGeo, smat("#26221f"));
      glass.position.set(sx * 0.095, 0.03, 0.24);
      head.add(glass);
    }
    const bridge = new THREE.Mesh(sBox, smat("#26221f"));
    bridge.scale.set(0.07, 0.014, 0.01);
    bridge.position.set(0, 0.035, 0.24);
    head.add(bridge);
    head.add(sp(smat("#a0685a"), 0.04, 0.015, 0.01, 0, -0.09, 0.225));
    inner.add(head);
    const parts: StudentParts = { legL, legR, armL, armR, head, inner };
    return { group, parts };
  }

  // 校園步道路線圖 (px 座標,節點之間相連)
  const PATHS_PX: [number, number][][] = [
    [[100, 300], [100, 700], [100, 1050], [480, 1160], [850, 1090], [930, 1000], [930, 770]],
    [[930, 770], [930, 745], [1100, 738], [1215, 720], [1215, 520], [1190, 520]],
    [[1190, 520], [1400, 520], [1560, 520], [1880, 500]],
    [[1560, 520], [1560, 740]],
    [[100, 300], [600, 300], [1000, 300], [1140, 380], [1140, 520], [1190, 520]],
    [[1880, 500], [1960, 560], [2135, 640], [2135, 1070], [1960, 1150], [1880, 1070]],
    [[1880, 500], [1880, 1070]],
    [[1880, 500], [2150, 470]],
    [[480, 1160], [300, 1130], [190, 1010], [180, 700]],
    [[930, 1000], [1050, 1090], [1250, 1090], [1500, 1090]],
    [[100, 1050], [100, 1250], [100, 1530]],
    [[1100, 1530], [1810, 1500], [1810, 1250], [1780, 1217], [1000, 1217], [850, 1090]],
    [[1215, 720], [1240, 620], [1320, 660], [1400, 700]],
    [[1810, 1250], [1960, 1250], [2105, 1235], [2105, 1375], [2105, 1450]],
  ];
  interface WNode {
    x: number;
    z: number;
    adj: number[];
  }
  const wnodes: WNode[] = [];
  const wmap = new Map<string, number>();
  const wid = (px: number, py: number) => {
    const k = px + "," + py;
    let i = wmap.get(k);
    if (i === undefined) {
      i = wnodes.length;
      wmap.set(k, i);
      wnodes.push({ x: px2x(px), z: py2z(py), adj: [] });
    }
    return i;
  };
  for (const line of PATHS_PX) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = wid(line[i][0], line[i][1]);
      const b = wid(line[i + 1][0], line[i + 1][1]);
      if (!wnodes[a].adj.includes(b)) wnodes[a].adj.push(b);
      if (!wnodes[b].adj.includes(a)) wnodes[b].adj.push(a);
    }
  }

  const WALK_PHRASES = [
    "下課去操場玩!", "我喜歡彩虹樓 🌈", "圖書館有新書喔!", "小心慢慢走~",
    "一起去打球!", "今天體育課好好玩", "我功課寫完了!", "生態池有青蛙 🐸",
    "午餐吃什麼呢?", "跑操場一圈!", "光復國小最棒!", "去遊戲區玩積木!",
    "我要去借書~", "等我一下!", "今天天氣好好 ☀️", "嘿嘿嘿~",
  ];
  const GREET_PHRASES = ["嗨!👋", "早安!", "你好呀!", "一起玩!", "哈囉!", "你也來逛校園嗎?"];
  const PRINCIPAL_PHRASES = ["同學們早安!", "慢慢走,不要跑喔~", "歡迎來光復國小!", "記得多喝水喔", "下課要注意安全", "今天也要開心上學!"];
  const PRINCIPAL_GREET = ["同學好!", "早安,小朋友!", "慢慢走喔~", "你好你好!👋"];

  interface Student {
    group: THREE.Group;
    parts: StudentParts;
    x: number;
    z: number;
    y: number;
    face: number;
    cur: number;
    target: number;
    ox: number;
    oz: number;
    speed: number;
    pauseT: number;
    phase: number;
    bubbleEl: HTMLDivElement;
    bubbleT: number;
    nextBubble: number;
    greetCool: number;
    stationary: boolean;
    principal: boolean;
    hopT: number;
    hopPhase: number;
    seed: number;
  }
  const students: Student[] = [];
  function showBubble(s: Student, text: string, dur = 2.8) {
    s.bubbleEl.textContent = text;
    s.bubbleEl.style.opacity = "1";
    s.bubbleT = dur;
  }
  function chooseNext(s: Student, from: number) {
    const adj = wnodes[s.cur].adj;
    if (adj.length === 0) return;
    const opts = adj.filter((i) => i !== from);
    const pool = opts.length > 0 ? opts : adj;
    s.target = pool[Math.floor(Math.random() * pool.length)];
  }
  function turnToward(s: Student, target: number, dt: number, rate = 10) {
    let diff = target - s.face;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    s.face += diff * (1 - Math.exp(-dt * rate));
  }
  function spawnStudent(stationaryAt?: [number, number], principal = false): Student {
    const { group, parts } = principal ? buildPrincipal() : buildStudent();
    if (principal) group.scale.setScalar(1.42);
    let x = 0;
    let z = 0;
    let cur = -1;
    if (stationaryAt) {
      x = px2x(stationaryAt[0]);
      z = py2z(stationaryAt[1]);
    } else {
      cur = Math.floor(Math.random() * wnodes.length);
      x = wnodes[cur].x;
      z = wnodes[cur].z;
    }
    group.position.set(x, 0, z);
    scene.add(shadowed(group));
    const el = document.createElement("div");
    el.className = "bubble";
    el.style.opacity = "0";
    const bo = new CSS2DObject(el);
    bo.position.set(0, 1.9, 0);
    group.add(bo);
    const s: Student = {
      group,
      parts,
      x,
      z,
      y: 0,
      face: Math.random() * Math.PI * 2,
      cur,
      target: -1,
      ox: (Math.random() - 0.5) * 0.36,
      oz: (Math.random() - 0.5) * 0.36,
      speed: principal ? 0.85 : Math.random() < 0.15 ? 3.1 : 1.5 + Math.random() * 1.2,
      pauseT: Math.random() * 1.5,
      phase: Math.random() * 6,
      bubbleEl: el,
      bubbleT: 0,
      nextBubble: 2 + Math.random() * 12,
      greetCool: 0,
      stationary: !!stationaryAt,
      principal,
      hopT: 1.5 + Math.random() * 4,
      hopPhase: -1,
      seed: Math.random() * 10,
    };
    if (cur >= 0) chooseNext(s, -1);
    students.push(s);
    return s;
  }
  let principalRef: Student | null = null;
  for (let i = 0; i < 15; i++) spawnStudent();
  const chatA = spawnStudent([1300, 640]);
  const chatB = spawnStudent([1358, 668]);
  chatA.face = Math.atan2(chatB.x - chatA.x, chatB.z - chatA.z);
  chatB.face = Math.atan2(chatA.x - chatB.x, chatA.z - chatB.z);
  spawnStudent([1400, 1140]);
  spawnStudent([2007, 855]);
  spawnStudent([205, 648]);
  // 校長從藍天樓(校長室)前出發,慢慢巡視校園
  principalRef = spawnStudent(undefined, true);
  {
    let best = 0;
    let bd = Infinity;
    wnodes.forEach((n, i) => {
      const d = (n.x - px2x(1005)) ** 2 + (n.z - py2z(742)) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    principalRef.cur = best;
    principalRef.x = wnodes[best].x;
    principalRef.z = wnodes[best].z;
    principalRef.group.position.set(principalRef.x, 0, principalRef.z);
    chooseNext(principalRef, -1);
  }

  function updateStudents(t: number, dt: number) {
    for (const s of students) {
      const p = s.parts;
      if (s.bubbleT > 0) {
        s.bubbleT -= dt;
        if (s.bubbleT <= 0) s.bubbleEl.style.opacity = "0";
      }
      s.nextBubble -= dt;
      s.greetCool -= dt;
      if (s.nextBubble <= 0) {
        s.nextBubble = s.stationary ? 5 + Math.random() * 8 : 9 + Math.random() * 14;
        if (s.bubbleT <= 0 && Math.random() < 0.75) {
          const phrases = s.principal ? PRINCIPAL_PHRASES : WALK_PHRASES;
          showBubble(s, phrases[Math.floor(Math.random() * phrases.length)]);
        }
      }
      const dxp = player.x - s.x;
      const dzp = player.z - s.z;
      const nearPlayer = dxp * dxp + dzp * dzp < 2.4 * 2.4;
      let moving = 0;
      if (nearPlayer) {
        turnToward(s, Math.atan2(dxp, dzp), dt, 8);
        if (s.greetCool <= 0) {
          s.greetCool = 10;
          const greet = s.principal ? PRINCIPAL_GREET : GREET_PHRASES;
          showBubble(s, greet[Math.floor(Math.random() * greet.length)], 2.2);
        }
      }
      // 學生遇到校長會打招呼
      if (!nearPlayer && !s.principal && principalRef && s.greetCool <= 0) {
        const dxr = principalRef.x - s.x;
        const dzr = principalRef.z - s.z;
        if (dxr * dxr + dzr * dzr < 2.2 * 2.2) {
          s.greetCool = 12;
          showBubble(s, "校長好!", 2);
          turnToward(s, Math.atan2(dxr, dzr), dt, 8);
        }
      }
      if (s.stationary) {
        if (s.hopPhase < 0) {
          s.hopT -= dt;
          if (s.hopT <= 0) {
            s.hopPhase = 0;
            s.hopT = 2.5 + Math.random() * 4.5;
          }
        }
      } else if (nearPlayer) {
        // 停下來揮手打招呼
      } else if (s.pauseT > 0) {
        s.pauseT -= dt;
      } else if (s.target >= 0) {
        const n = wnodes[s.target];
        const tx = n.x + s.ox;
        const tz = n.z + s.oz;
        const dx = tx - s.x;
        const dz = tz - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.35) {
          const from = s.cur;
          s.cur = s.target;
          chooseNext(s, from);
          if (Math.random() < 0.22) s.pauseT = 0.8 + Math.random() * 2.2;
        } else {
          const vx = (dx / d) * s.speed;
          const vz = (dz / d) * s.speed;
          const nx = s.x + vx * dt;
          const nz = s.z + vz * dt;
          let ok = true;
          if (!blocked(nx, s.z, s.y)) s.x = nx;
          else ok = false;
          if (!blocked(s.x, nz, s.y)) s.z = nz;
          else ok = false;
          if (!ok) {
            s.pauseT = 0.4;
            chooseNext(s, s.target);
          }
          moving = 1;
          turnToward(s, Math.atan2(vx, vz), dt, 10);
        }
      }
      // 動畫:走路擺手擺腳 / 站著聊天 / 揮手
      s.phase += dt * (moving ? 5 + s.speed * 2.4 : 1.6);
      const sw = moving;
      p.legL.rotation.x = Math.sin(s.phase) * 0.8 * sw;
      p.legR.rotation.x = -Math.sin(s.phase) * 0.8 * sw;
      p.armL.rotation.x = -Math.sin(s.phase) * 0.7 * sw + (sw ? 0 : Math.sin(t * 1.7 + s.seed) * 0.07);
      let bob = Math.abs(Math.sin(s.phase)) * 0.055 * sw;
      if (s.hopPhase >= 0) {
        s.hopPhase += dt / 0.45;
        if (s.hopPhase >= 1) s.hopPhase = -1;
        else bob += Math.sin(s.hopPhase * Math.PI) * 0.28;
      }
      if (nearPlayer) {
        p.armR.rotation.x = -2.7 + Math.sin(t * 9 + s.seed) * 0.25;
        p.armR.rotation.z = -0.25 + Math.sin(t * 9 + s.seed) * 0.35;
      } else {
        p.armR.rotation.x = Math.sin(s.phase) * 0.7 * sw + (sw ? 0 : Math.sin(t * 1.7 + s.seed + 2) * 0.07);
        p.armR.rotation.z = 0;
      }
      p.head.rotation.y = moving ? Math.sin(s.phase * 0.5) * 0.08 : Math.sin(t * 0.8 + s.seed) * 0.35;
      p.head.rotation.z = Math.sin(t * 1.3 + s.seed) * 0.04;
      p.inner.rotation.z = Math.sin(t * 1.4 + s.seed) * 0.02;
      s.y = groundAt(s.x, s.z, s.y);
      s.group.position.set(s.x, s.y, s.z);
      s.group.rotation.y = s.face;
      p.inner.position.y = bob;
    }
  }
  animated.push((t, dt) => updateStudents(t, dt));

  // ---------- state ----------
  const player = { x: px2x(170), z: py2z(1050), y: 0, vy: 0, vx: 0, vz: 0, face: Math.PI / 2, onGround: true, stepT: 0 };
  let active = false;
  let camYaw = -Math.PI / 2;
  let camPitch = 0.72;
  let camDist = 13;
  const camTarget = new THREE.Vector3(player.x, 1, player.z);
  const keys: Record<string, boolean> = {};
  const stick = { x: 0, y: 0 };
  let jumpQueued = false;
  let coinCount = 0;
  let currentZone: string | null = null;
  let flagCool = 0;
  let time = 0;
  let coyote = 0;
  const effects: { el: HTMLElement; obj: CSS2DObject; life: number }[] = [];

  function popText(text: string, x: number, y: number, z: number) {
    const div = document.createElement("div");
    const span = document.createElement("span");
    span.className = "pop";
    span.style.display = "inline-block";
    span.textContent = text;
    div.appendChild(span);
    const obj = new CSS2DObject(div);
    obj.position.set(x, y, z);
    scene.add(obj);
    effects.push({ el: div, obj, life: 1.0 });
  }

  function blocked(x: number, z: number, y: number) {
    for (const s of solids) if (s.top > y + 0.35 && s.test(x, z, PLAYER_R)) return true;
    return false;
  }
  function groundAt(x: number, z: number, y: number) {
    let g = 0;
    for (const s of solids) if (s.top <= y + 0.35 && s.top > g && s.test(x, z, 0.12)) g = s.top;
    return g;
  }

  function addCoins(n: number) {
    coinCount += n;
    cb.onCoins(coinCount, totalCoins);
  }

  function updateZone() {
    const ppx = player.x * 40 + 1140;
    const ppy = player.z * 40 + 920;
    let best: Zone | null = null;
    let bestR = 1;
    for (const z of ZONES) {
      const r = Math.hypot(ppx - z.center[0], ppy - z.center[1]) / z.radius;
      if (r < bestR) {
        bestR = r;
        best = z;
      }
    }
    const id = best ? best.id : null;
    if (id !== currentZone) {
      currentZone = id;
      if (best) audio.zone();
      cb.onZone(best);
    }
  }

  function update(dt: number) {
    time += dt;
    // input
    let fx = 0;
    let fz = 0;
    if (active) {
      if (keys["KeyW"] || keys["ArrowUp"]) fz += 1;
      if (keys["KeyS"] || keys["ArrowDown"]) fz -= 1;
      if (keys["KeyD"] || keys["ArrowRight"]) fx += 1;
      if (keys["KeyA"] || keys["ArrowLeft"]) fx -= 1;
      fx += stick.x;
      fz += stick.y;
      if (keys["KeyQ"]) camYaw += dt * 1.8;
      if (keys["KeyE"]) camYaw -= dt * 1.8;
    }
    const mag = Math.min(1, Math.hypot(fx, fz));
    let tx = 0;
    let tz = 0;
    if (mag > 0.05) {
      const n = Math.hypot(fx, fz);
      fx /= n;
      fz /= n;
      const fwdX = -Math.sin(camYaw);
      const fwdZ = -Math.cos(camYaw);
      const rX = Math.cos(camYaw);
      const rZ = -Math.sin(camYaw);
      const run = keys["ShiftLeft"] || keys["ShiftRight"] ? 1.55 : 1;
      const sp = 7.2 * mag * run;
      tx = (fwdX * fz + rX * fx) * sp;
      tz = (fwdZ * fz + rZ * fx) * sp;
    }
    const k = 1 - Math.exp(-dt * (player.onGround ? 14 : 6));
    player.vx += (tx - player.vx) * k;
    player.vz += (tz - player.vz) * k;

    // jump
    if (player.onGround) coyote = 0.1;
    else coyote -= dt;
    if (active && (jumpQueued || keys["Space"]) && coyote > 0 && player.vy <= 0.01) {
      player.vy = 10.8;
      player.onGround = false;
      coyote = 0;
      audio.jump();
      keys["Space"] = false;
    }
    jumpQueued = false;

    // horizontal
    const nx = player.x + player.vx * dt;
    if (!blocked(nx, player.z, player.y)) player.x = nx;
    else player.vx = 0;
    const nz = player.z + player.vz * dt;
    if (!blocked(player.x, nz, player.y)) player.z = nz;
    else player.vz = 0;
    player.x = Math.max(-32, Math.min(32, player.x));
    player.z = Math.max(-22, Math.min(22, player.z));

    // vertical
    const prevY = player.y;
    player.vy -= 27 * dt;
    player.y += player.vy * dt;
    const g = groundAt(player.x, player.z, prevY);
    if (player.y <= g) {
      if (!player.onGround && player.vy < -4) audio.land();
      player.y = g;
      player.vy = 0;
      player.onGround = true;
    } else if (player.y > g + 0.02) {
      player.onGround = false;
    }

    // footsteps
    const speed = Math.hypot(player.vx, player.vz);
    if (player.onGround && speed > 1) {
      player.stepT += dt * speed;
      if (player.stepT > 2.4) {
        player.stepT = 0;
        audio.step_();
      }
    }

    // facing
    if (speed > 0.6) {
      const target = Math.atan2(player.vx, player.vz);
      let diff = target - player.face;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.face += diff * (1 - Math.exp(-dt * 14));
    }

    // hero pose
    hero.position.set(player.x, player.y, player.z);
    hero.rotation.y = player.face;
    const sw = Math.min(1, speed / 6);
    const ph = time * (10 + speed);
    if (player.onGround) {
      parts.legL.rotation.x = Math.sin(ph) * 0.9 * sw;
      parts.legR.rotation.x = -Math.sin(ph) * 0.9 * sw;
      parts.armL.rotation.x = -Math.sin(ph) * 0.9 * sw;
      parts.armR.rotation.x = Math.sin(ph) * 0.9 * sw;
      parts.armL.rotation.z = 0.15;
      parts.armR.rotation.z = -0.15;
      heroInner.position.y = Math.abs(Math.sin(ph)) * 0.08 * sw + Math.sin(time * 3) * 0.01;
      heroInner.scale.set(1, 1, 1);
    } else {
      parts.legL.rotation.x = -0.6;
      parts.legR.rotation.x = 0.5;
      parts.armL.rotation.x = Math.PI - 0.5;
      parts.armR.rotation.x = Math.PI - 0.5;
      parts.armL.rotation.z = -0.3;
      parts.armR.rotation.z = 0.3;
      const st = 1 + Math.max(-0.12, Math.min(0.15, player.vy * 0.012));
      heroInner.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
    }
    parts.head.rotation.z = Math.sin(ph * 0.5) * 0.06 * sw;
    blob.position.set(player.x, groundAt(player.x, player.z, player.y + 0.4) + 0.06, player.z);
    const hh = Math.max(0, player.y - blob.position.y + 0.06);
    blob.scale.setScalar(Math.max(0.4, 1 - hh * 0.15));

    // coins
    for (const c of coins) {
      if (c.got) continue;
      c.g.rotation.y = time * 3 + c.ph;
      c.g.position.y += (Math.sin(time * 3 + c.ph) * 0.002);
      const dx = c.g.position.x - player.x;
      const dz = c.g.position.z - player.z;
      const dy = c.g.position.y - (player.y + 0.6);
      if (dx * dx + dz * dz < 0.7 && Math.abs(dy) < 1.5) {
        c.got = true;
        c.g.visible = false;
        audio.coin();
        popText("+1", c.g.position.x, c.g.position.y + 0.6, c.g.position.z);
        addCoins(c.value);
      }
    }
    // star
    if (!starGot) {
      star.rotation.y = time * 2.5;
      star.position.y = 3.5 + Math.sin(time * 3) * 0.15;
      const dx = star.position.x - player.x;
      const dz = star.position.z - player.z;
      if (dx * dx + dz * dz < 0.9 && Math.abs(star.position.y - (player.y + 0.6)) < 1.6) {
        starGot = true;
        star.visible = false;
        audio.oneUp();
        popText("★ 超級星星 +5", star.position.x, star.position.y + 0.8, star.position.z);
        addCoins(5);
      }
    }
    // blocks
    for (const b of blocks) {
      b.cool -= dt;
      if (b.bounce > 0) {
        b.bounce -= dt * 4;
        b.mesh.position.y = b.baseY + Math.sin(Math.max(0, b.bounce) * Math.PI) * 0.45;
      } else {
        b.mesh.position.y = b.baseY;
      }
      if (!b.hit) b.mesh.rotation.y = Math.sin(time * 2 + b.x) * 0.08;
      const dx = b.x - player.x;
      const dz = b.z - player.z;
      if (dx * dx + dz * dz < 0.85 && player.vy > 0 && player.y + 1.05 >= b.baseY - 0.5 && player.y + 1.05 <= b.baseY + 0.9 && b.cool <= 0) {
        b.cool = 0.6;
        b.bounce = 1;
        player.vy = -2;
        const first = !b.hit;
        if (first) {
          b.hit = true;
          (b.mesh.material as THREE.MeshLambertMaterial).map = usedTex;
          (b.mesh.material as THREE.MeshLambertMaterial).emissiveIntensity = 0;
          (b.mesh.material as THREE.MeshLambertMaterial).needsUpdate = true;
          audio.blockHit();
          popText("+1", b.x, b.baseY + 1.2, b.z);
          addCoins(1);
        } else {
          audio.bump();
        }
        cb.onBlock(b.info.title, b.info.msg, first);
      }
    }
    // flag
    flagCool -= dt;
    if (flagCool <= 0 && Math.hypot(player.x - flagPos.x, player.z - flagPos.z) < 1.4) {
      flagCool = 8;
      audio.flag();
      cb.onFlag(coinCount, totalCoins);
    }
    // effects
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.life -= dt;
      e.obj.position.y += dt * 1.6;
      if (e.life <= 0) {
        scene.remove(e.obj);
        e.el.remove();
        effects.splice(i, 1);
      }
    }

    updateZone();
  }

  // ---------- camera ----------
  function updateCamera(dt: number) {
    if (!active) {
      camYaw += dt * 0.12;
    }
    const target = new THREE.Vector3(player.x, player.y + 1.1, player.z);
    camTarget.lerp(target, 1 - Math.exp(-dt * 7));
    const cp = Math.cos(camPitch);
    const sp = Math.sin(camPitch);
    camera.position.set(
      camTarget.x + Math.sin(camYaw) * cp * camDist,
      Math.max(0.8, camTarget.y + sp * camDist),
      camTarget.z + Math.cos(camYaw) * cp * camDist,
    );
    camera.lookAt(camTarget);
  }

  // ---------- minimap ----------
  const miniCanvas = document.createElement("canvas");
  miniCanvas.width = 220;
  miniCanvas.height = 136;
  miniCanvas.className = "minimap";
  container.appendChild(miniCanvas);
  const mg = miniCanvas.getContext("2d")!;
  const miniBg = document.createElement("canvas");
  miniBg.width = 220;
  miniBg.height = 136;
  {
    const g = miniBg.getContext("2d")!;
    g.fillStyle = "#7fdc5a";
    g.fillRect(0, 0, 220, 136);
    g.setTransform(0.1, 0, 0, 0.1, -3, -25);
    mini.forEach((f) => {
      g.save();
      f(g);
      g.restore();
    });
  }
  function drawMini() {
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.drawImage(miniBg, 0, 0);
    mg.setTransform(0.1, 0, 0, 0.1, -3, -25);
    mg.fillStyle = "#ffd21f";
    for (const c of coins) {
      if (c.got) continue;
      mg.beginPath();
      mg.arc(c.g.position.x * 40 + 1140, c.g.position.z * 40 + 920, 14, 0, Math.PI * 2);
      mg.fill();
    }
    mg.strokeStyle = "#ffffff";
    mg.lineWidth = 6;
    for (const s of students) {
      mg.fillStyle = s.principal ? "#7b5ea7" : "#ff8fb8";
      mg.beginPath();
      mg.arc(s.x * 40 + 1140, s.z * 40 + 920, 10, 0, Math.PI * 2);
      mg.fill();
      mg.stroke();
    }
    const ppx = player.x * 40 + 1140;
    const ppy = player.z * 40 + 920;
    mg.save();
    mg.translate(ppx, ppy);
    mg.rotate(-player.face + Math.PI);
    mg.fillStyle = "#ee2f3b";
    mg.strokeStyle = "#fff";
    mg.lineWidth = 12;
    mg.beginPath();
    mg.moveTo(0, 50);
    mg.lineTo(-34, -30);
    mg.lineTo(34, -30);
    mg.closePath();
    mg.stroke();
    mg.fill();
    mg.restore();
  }

  // ---------- input ----------
  const onKeyDown = (e: KeyboardEvent) => {
    if (!active) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onPD = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  };
  const onPM = (e: PointerEvent) => {
    if (!dragging) return;
    camYaw -= (e.clientX - lastX) * 0.007;
    camPitch = Math.max(0.25, Math.min(1.3, camPitch + (e.clientY - lastY) * 0.005));
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPU = () => {
    dragging = false;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    camDist = Math.max(6, Math.min(30, camDist + e.deltaY * 0.01));
  };
  renderer.domElement.addEventListener("pointerdown", onPD);
  renderer.domElement.addEventListener("pointermove", onPM);
  renderer.domElement.addEventListener("pointerup", onPU);
  renderer.domElement.addEventListener("pointercancel", onPU);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 62 : 50;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- loop ----------
  const clock = new THREE.Clock();
  let raf = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    update(dt);
    animated.forEach((f) => f(time, dt));
    updateCamera(dt);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    drawMini();
  }
  loop();

  return {
    setActive(a: boolean) {
      active = a;
      if (a) {
        camYaw = -Math.PI / 2;
        updateZone();
      }
    },
    setStick(x: number, y: number) {
      stick.x = x;
      stick.y = y;
    },
    jump() {
      jumpQueued = true;
    },
    rotateCam(d: number) {
      camYaw += d;
    },
    teleport(id: string) {
      const z = ZONES.find((q) => q.id === id);
      if (!z) return;
      audio.pipe();
      player.x = px2x(z.spawn[0]);
      player.z = py2z(z.spawn[1]);
      player.y = 3;
      player.vy = 0;
      player.vx = player.vz = 0;
      camTarget.set(player.x, 1, player.z);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      miniCanvas.remove();
    },
  };
}

export type Game = ReturnType<typeof createGame>;
