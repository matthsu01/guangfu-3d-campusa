# 🚀 部署流程:GitHub → Cloudflare Pages

專案:光復國小 3D 校園冒險 (React + Vite + Three.js)
建置指令:`npm run build` · 輸出目錄:`dist`

## 0. 本機測試

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 產生 dist/
npm run preview
```

## 1. 推到 GitHub

```bash
git init
git add .
git commit -m "feat: 光復國小 3D 校園冒險"
git branch -M main
git remote add origin https://github.com/<你的帳號>/guangfu-3d-campus.git
git push -u origin main
```

> 也可以用 GitHub CLI:`gh repo create guangfu-3d-campus --public --source=. --push`

## 2A. 方案 A(最簡單):Cloudflare Pages 直接連 GitHub

1. 登入 <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授權 GitHub,選擇 `guangfu-3d-campus` repo
3. Build settings:

   | 欄位 | 值 |
   | --- | --- |
   | Framework preset | `Vite` (或 None) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | 環境變數 | `NODE_VERSION` = `20` |

4. **Save and Deploy**,完成後會得到 `https://guangfu-3d-campus.pages.dev`
5. 之後每次 `git push` 到 `main` 會自動 Production 部署;其他分支 / PR 會產生 Preview 網址。

## 2B. 方案 B:GitHub Actions + Wrangler(本專案已附 workflow)

檔案:`.github/workflows/deploy.yml`

1. 先建立 Pages 專案(只需做一次):

   ```bash
   npx wrangler login
   npx wrangler pages project create guangfu-3d-campus --production-branch=main
   ```

2. 取得憑證
   - **Account ID**:Cloudflare Dashboard 右側欄 / Workers & Pages 概觀頁
   - **API Token**:My Profile → API Tokens → Create Token → 使用 **Edit Cloudflare Workers** 範本,或自訂權限 `Account · Cloudflare Pages · Edit`

3. 到 GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

   | Secret | 值 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | 上一步建立的 Token |
   | `CLOUDFLARE_ACCOUNT_ID` | 你的 Account ID |

4. `git push` 到 `main` → Actions 自動 `npm ci → npm run build → wrangler pages deploy dist`

> 若你的 Pages 專案名稱不是 `guangfu-3d-campus`,請同步修改 `deploy.yml` 與 `wrangler.toml` 的名稱。

## 3. 自訂網域(選用)

Pages 專案 → **Custom domains** → **Set up a custom domain** → 輸入網域,依指示新增 CNAME,SSL 會自動簽發。

## 4. 疑難排解

- **畫面沒有聲音**:瀏覽器需要使用者互動才能播放音效,請先按「START」。
- **Build 失敗**:確認 Node 版本 ≥ 18(建議 20)。
- **Actions 授權失敗**:檢查 Token 是否具有 *Cloudflare Pages: Edit* 權限,以及 Account ID 是否正確。
