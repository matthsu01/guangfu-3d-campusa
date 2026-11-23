// 光復國小 115 學年度教室配置 — 地圖座標 (px) 轉成 3D 世界座標
export const SCALE = 40;
export const CX = 1140;
export const CY = 920;
export const px2x = (px: number) => (px - CX) / SCALE;
export const py2z = (py: number) => (py - CY) / SCALE;
export const len = (p: number) => p / SCALE;

export interface Zone {
  id: string;
  name: string;
  emoji: string;
  color: string;
  floors: string;
  desc: string;
  rooms: string[];
  /** 傳送點 (px) */
  spawn: [number, number];
  /** 區域偵測 (px) 圓形 */
  center: [number, number];
  radius: number;
}

export const ZONES: Zone[] = [
  {
    id: "gate",
    name: "正門 / 警衛室",
    emoji: "🚪",
    color: "#ff6b6b",
    floors: "校門口",
    desc: "歡迎來到光復國小!警衛室就在正門旁邊,記得跟警衛伯伯說早安。",
    rooms: ["正門", "警衛室", "B2 地下停車場出入口"],
    spawn: [170, 1050],
    center: [150, 1100],
    radius: 160,
  },
  {
    id: "rainbow",
    name: "彩虹樓",
    emoji: "🌈",
    color: "#ff8fb8",
    floors: "1F ~ 5F · 圓形校舍",
    desc: "圓圓的彩虹樓像一塊彩色蛋糕!裡面有演藝廳、各科專科教室。",
    rooms: ["演藝廳", "音控室", "英語教室 1~2", "英語圖書室", "美術教室", "自然教室 1~6", "健康中心", "多功能教室", "會客室"],
    spawn: [700, 1150],
    center: [710, 1330],
    radius: 260,
  },
  {
    id: "indigo",
    name: "靛海樓",
    emoji: "🌊",
    color: "#4fc3d9",
    floors: "1F ~ 5F · 弧形校舍",
    desc: "弧形的靛海樓,面向海浪般的曲線,是音樂教室的家。",
    rooms: ["音樂教室 1~3", "第三會議室 / 科任教室", "弧形走廊"],
    spawn: [300, 1140],
    center: [330, 930],
    radius: 230,
  },
  {
    id: "purple",
    name: "紫霞樓",
    emoji: "🔮",
    color: "#b388f0",
    floors: "B1 ~ 5F",
    desc: "紫霞樓有舞蹈教室、桌球練習室,中高年級教室也在這裡。",
    rooms: ["舞蹈教室 027", "桌球練習室 020", "開放空間", "二5、二6", "四9、四10", "五7、五8、五11", "多功能教室 520"],
    spawn: [760, 1000],
    center: [620, 910],
    radius: 160,
  },
  {
    id: "blue",
    name: "藍天樓",
    emoji: "☁️",
    color: "#4aa8f0",
    floors: "B1 ~ 5F",
    desc: "藍天樓是行政中心,校長室、總務處、教務處、學務處都在這裡!",
    rooms: ["校長室 230", "總務處 130", "教務處 231", "學務處 131", "男生住宿區", "幼教電腦教室 028", "美術教室 3/4", "攝影棚 529", "三9、三10、六10、六13", "晨光廣場 (網球場 B2)"],
    spawn: [960, 760],
    center: [900, 620],
    radius: 340,
  },
  {
    id: "green",
    name: "綠水樓",
    emoji: "🌿",
    color: "#4cc47a",
    floors: "B1 ~ 5F",
    desc: "綠水樓有圖書館、幼兒園與體操教室,是安靜又充滿書香的地方。",
    rooms: ["圖書館 232", "幼兒園室內遊戲室 132", "第二會議室 / 體操教室 032", "多功能 / 劍道教室 432", "女生住宿區 532", "二1~二4", "光譜班", "幼兒園餐廳 / 廚房"],
    spawn: [1470, 540],
    center: [1470, 390],
    radius: 340,
  },
  {
    id: "yellow",
    name: "黃蝶樓",
    emoji: "🦋",
    color: "#ffc928",
    floors: "B1 ~ 5F",
    desc: "黃蝶樓像蝴蝶展翅,一~五年級的普通教室最多都在這!",
    rooms: ["五2~五6", "三1~三8", "四7、四8", "一1~一8", "二1~二7", "健康中心 110", "體育器材室 010", "幼教攝影室 014", "科任教室 013", "幼教會議室 012"],
    spawn: [1275, 740],
    center: [1275, 877],
    radius: 330,
  },
  {
    id: "orange",
    name: "橙陽樓",
    emoji: "🌞",
    color: "#ff9a3d",
    floors: "B1 ~ 4F",
    desc: "橙陽樓有好多開放空間、電腦教室和辦公室,還面向大操場。",
    rooms: ["電腦教室", "辦公室", "幼兒園", "輔導處 246", "諮商室 245", "資料室 246", "音樂教室 344", "知動教室 345", "檔案室 343", "光譜班"],
    spawn: [1560, 860],
    center: [1712, 857],
    radius: 380,
  },
  {
    id: "red",
    name: "紅楓樓",
    emoji: "🍁",
    color: "#f2475e",
    floors: "B1 ~ 5F",
    desc: "紅楓樓是六年級大哥哥大姊姊的地盤,也有可愛動物班級!",
    rooms: ["六1~六9", "四1~四6", "棕熊班、黃蜂班、紫蝶班、花鹿班", "紅豬班、綠蛙班、白鯨班、飛魚班", "海豚班、企鵝班", "第一會議室", "幼教研習暨資訊中心"],
    spawn: [1370, 1215],
    center: [1370, 1357],
    radius: 440,
  },
  {
    id: "field",
    name: "操場 / 司令台",
    emoji: "🏃",
    color: "#7ccf5a",
    floors: "戶外運動場",
    desc: "橘色跑道圍著草皮,是體育課和運動會的主場!旁邊還有沙坑可以跳遠。",
    rooms: ["操場", "司令台", "日光農場", "沙坑", "汙水處理廠", "爬竿場"],
    spawn: [2007, 880],
    center: [2007, 850],
    radius: 380,
  },
  {
    id: "court",
    name: "光電球場",
    emoji: "🏀",
    color: "#3a78d8",
    floors: "戶外球場",
    desc: "藍黃色的光電球場,最適合打籃球。",
    rooms: ["光電球場", "小型垃圾場"],
    spawn: [2105, 1225],
    center: [2105, 1375],
    radius: 190,
  },
  {
    id: "garden",
    name: "中庭花園 / 遊戲區",
    emoji: "🌻",
    color: "#f3b13e",
    floors: "1F · B1 · B2 體育館",
    desc: "中庭花園地下是體育館 (B2)。遊戲區有彩色積木,可以跳上去玩!",
    rooms: ["中庭花園 (1F)", "體育館 (B2)", "遊戲區 (1F)", "中庭花園 (B1)"],
    spawn: [1260, 1135],
    center: [1320, 920],
    radius: 340,
  },
  {
    id: "eco",
    name: "生態教材園",
    emoji: "🐸",
    color: "#5cc8f0",
    floors: "戶外生態池",
    desc: "池塘裡有荷葉,小青蛙最喜歡這裡!",
    rooms: ["生態池", "教材園"],
    spawn: [160, 700],
    center: [145, 560],
    radius: 170,
  },
];

export interface BlockInfo {
  at: [number, number];
  title: string;
  msg: string;
}

export const BLOCKS: BlockInfo[] = [
  { at: [150, 1000], title: "歡迎光臨!", msg: "光復國小 115 學年度教室配置 — 一起來探索校園吧!" },
  { at: [450, 1190], title: "彩虹樓", msg: "圓形的彩虹樓中間是演藝廳,四周是各種專科教室。" },
  { at: [300, 1130], title: "靛海樓", msg: "靛海樓有三間音樂教室,下課聽得到美妙琴聲♪" },
  { at: [865, 765], title: "藍天樓", msg: "校長室、教務處、學務處與總務處都在藍天樓。" },
  { at: [1470, 530], title: "綠水樓", msg: "綠水樓 2F 是圖書館,借本書回家吧!" },
  { at: [1320, 535], title: "中庭花園", msg: "花園下面是 B2 體育館,下雨天也能運動!" },
  { at: [1712, 857], title: "橙陽樓", msg: "橙陽樓有電腦教室、輔導處、諮商室和辦公室。" },
  { at: [2007, 855], title: "操場", msg: "跑一圈操場吧!旁邊的沙坑可以練跳遠。" },
  { at: [1370, 1217], title: "紅楓樓", msg: "六年級教室在紅楓樓 4~5F,視野超棒!" },
  { at: [1250, 1130], title: "遊戲區", msg: "遊戲區的彩色積木可以跳上去喔!" },
  { at: [2105, 1228], title: "光電球場", msg: "光電球場是大家打球的好地方。" },
  { at: [235, 1420], title: "B2 地下停車場", msg: "沿著斜坡往下,就是 B2 地下停車場。" },
  { at: [145, 650], title: "生態教材園", msg: "池塘裡住著小青蛙,記得保持安靜喔 🐸" },
];

export const GATES = [
  { name: "北一門", p: [1002, 270], axis: "x" },
  { name: "北二門", p: [1892, 270], axis: "x" },
  { name: "南一門", p: [932, 1570], axis: "x" },
  { name: "南二門", p: [1902, 1570], axis: "x" },
  { name: "東門", p: [2212, 878], axis: "z" },
  { name: "正門", p: [70, 1058], axis: "z" },
] as const;
