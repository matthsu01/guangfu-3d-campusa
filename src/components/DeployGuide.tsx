import { useState } from "react";

interface Step {
  n: string;
  title: string;
  color: string;
  body?: string[];
  code?: string;
}

const STEPS: Step[] = [
  {
    n: "1",
    title: "推到 GitHub",
    color: "#2f6fe0",
    body: ["在專案資料夾執行下面指令,建立 repo 並推上 main 分支。"],
    code: `git init
git add .
git commit -m "feat: 光復國小 3D 校園冒險"
git branch -M main
git remote add origin https://github.com/<你的帳號>/guangfu-3d-campus.git
git push -u origin main`,
  },
  {
    n: "2A",
    title: "Cloudflare Pages 直接連 GitHub(最簡單)",
    color: "#f38020",
    body: [
      "Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → 選擇 repo。",
      "Framework preset:Vite ・ Build command:npm run build ・ Output directory:dist ・ 環境變數 NODE_VERSION=20",
      "之後每次 push main 自動上線,PR 會產生 Preview 網址。",
    ],
  },
  {
    n: "2B",
    title: "GitHub Actions + Wrangler(已附 workflow)",
    color: "#2ea44f",
    body: [
      "先建立 Pages 專案(只做一次):",
    ],
    code: `npx wrangler login
npx wrangler pages project create guangfu-3d-campus --production-branch=main`,
  },
  {
    n: "3",
    title: "設定 GitHub Secrets",
    color: "#a574e8",
    body: [
      "GitHub repo → Settings → Secrets and variables → Actions → New repository secret",
      "CLOUDFLARE_API_TOKEN:權限 Account · Cloudflare Pages · Edit",
      "CLOUDFLARE_ACCOUNT_ID:Cloudflare 右側欄的 Account ID",
    ],
  },
  {
    n: "4",
    title: "Push 即部署 🎉",
    color: "#ee2f3b",
    body: ["Actions 會自動執行 npm ci → npm run build → wrangler pages deploy dist,完成後網址:"],
    code: `https://guangfu-3d-campus.pages.dev`,
  },
];

const WORKFLOW = `# .github/workflows/deploy.yml
name: Deploy to Cloudflare Pages
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { contents: read, deployments: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=guangfu-3d-campus`;

function Code({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="relative mt-2">
      <pre className="code overflow-x-auto rounded-xl bg-[#1f2937] p-3 pr-16 text-[12px] leading-relaxed text-[#a7f3d0]">{text}</pre>
      <button
        className="btn-mario absolute right-2 top-2 !rounded-lg !border-2 !px-2 !py-0.5 text-xs"
        style={{ background: ok ? "#2ea44f" : "#2f6fe0" }}
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        }}
      >
        {ok ? "✔ 已複製" : "複製"}
      </button>
    </div>
  );
}

export default function DeployGuide({ onClose }: { onClose: () => void }) {
  const [showWf, setShowWf] = useState(false);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 p-3" onClick={onClose}>
      <div className="card anim-slideup flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="brick-title flex items-center justify-between px-4 py-3">
          <div className="hud-text text-lg sm:text-xl">🚀 部署教學 · GitHub → Cloudflare Pages</div>
          <button className="btn-mario !px-3 !py-0 text-lg" style={{ background: "#ee2f3b" }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4" style={{ userSelect: "text", WebkitUserSelect: "text" }}>
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#e8f7ff] p-3 text-sm font-bold">
            <span className="text-xl">🍄</span>
            <span>
              流程:<b>本機 → GitHub → Cloudflare Pages</b>。方案 2A 與 2B 擇一即可。專案已附 <code className="code">.github/workflows/deploy.yml</code>、
              <code className="code">wrangler.toml</code>、<code className="code">DEPLOY.md</code>。
            </span>
          </div>
          <ol className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3">
                <div
                  className="hud-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-white text-sm shadow-[0_4px_0_rgba(0,0,0,0.25)]"
                  style={{ background: s.color }}
                >
                  {s.n}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black">{s.title}</div>
                  {s.body?.map((b, i) => (
                    <p key={i} className="mt-0.5 text-[13px] leading-relaxed text-[#6b4a1f]">
                      {b}
                    </p>
                  ))}
                  {s.code && <Code text={s.code} />}
                </div>
              </li>
            ))}
          </ol>
          <button
            className="btn-mario mt-4 w-full"
            style={{ background: "#2f6fe0" }}
            onClick={() => setShowWf((v) => !v)}
          >
            {showWf ? "▲ 收合 workflow" : "▼ 查看 GitHub Actions workflow"}
          </button>
          {showWf && <Code text={WORKFLOW} />}
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#fff3c4] p-3 text-[13px] font-bold">
            <span className="text-xl">⭐</span>
            <span>想綁自己的網域?Pages 專案 → Custom domains → 新增 CNAME,SSL 會自動簽發。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
