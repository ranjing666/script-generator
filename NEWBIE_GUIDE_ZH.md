# 新手总教程（唯一入口）

这份文档是给零基础用户的唯一教程，按顺序做就能完成从安装到运行。

## 1. 下载与安装（不需要 Node.js）

1. 打开 Releases：`https://github.com/ranjing666/script-generator/releases`
2. 进入最新版本
3. 在 `Assets` 下载最新的 `*Setup-x64.exe`
4. 双击安装包，连续点击“下一步”
5. 安装完成后打开 `风的工具箱`

安装后如果 Windows 有安全提示，点“更多信息 -> 仍要运行”。
首次打开会弹出“这是干什么的”说明，先读完再点“我知道了，开始使用”。

## 2. 首次使用（最短路径）

1. 进入软件后切到 `新手向导`
2. 第 1 步输入项目名，并点击“选择文件”
3. 选择你的抓包文件（`HAR` 优先，也支持 `Postman/cURL`）
4. 点击第 2 步“开始自动分析”
5. 点击第 3 步“一键生成”
6. 生成成功后点击“打开输出目录”

如果你不会抓包：
- 直接点“不会抓包？点这里”
- 软件会弹出 HAR 抓包步骤（Chrome/Edge）
- 如果你看不懂词：点“看不懂词？术语翻译”

### 你应该看到什么（自检）

- 自检 A：页面顶部有 `新手向导 / 手动拼接 / 抓包导入`
- 自检 B：向导状态出现 `分析完成`
- 自检 C：向导状态出现 `生成成功` 和输出目录路径

## 3. 运行生成出来的脚本项目（照抄就行）

1. 在软件里点“打开输出目录”
2. 在该目录空白处按 `Shift + 鼠标右键`，点“在此处打开 PowerShell”
3. 把下面 3 行命令逐行粘贴并回车：

```powershell
npm install
copy .env.example .env
npm start
```

这 3 行分别是什么意思：
- `npm install`：下载运行脚本需要的依赖（首次运行做一次）
- `copy .env.example .env`：复制配置模板，生成正式配置文件
- `npm start`：启动脚本

## 4. 账号文件怎么填

根据生成项目里的 `accounts.source` 填对应文件：

- `privateKeys`：`data/privateKeys.txt`，每行一个私钥
- `tokens`：`data/tokens.txt`，每行一个 token
- `accounts`：`data/accounts.txt`，默认格式 `email|password`

## 5. `.env` 里的值去哪找（看这个）

先打开生成目录下的 `.env.example`，里面每一行都是 `变量名=`。  
你复制成 `.env` 后，按变量名找值：

- `RPC_URL`：去项目方文档找“RPC”地址，或去 [Chainlist](https://chainlist.org/) 搜对应链复制 RPC
- `BASE_URL / API_URL`：通常就是项目网站接口域名；抓包里请求地址前半段就是它
- `*_TOKEN`：登录后得到的凭证，通常来自抓包响应或浏览器存储
- `*_KEY`：项目方后台给的 API Key（没有就先留空）

不会填也可以先空着跑一次，看报错里缺哪个变量，再补哪个。

## 6. 常见报错怎么处理

- 报错 `登录成功了，但没提取到 token`
  - 检查 `project.config.json` 里的 `auth.extractTokenPath`

- 报错 `没有取到可处理列表`
  - 检查 `claimList.itemsPath` 是否指向数组路径

- 报错 `缺少 RPC_URL`
  - 在 `.env` 补 `RPC_URL=...`

- 一直 `429` 或超时
  - 先把并发改小，再增加重试间隔

## 7. 新手安全红线

1. 私钥、token、账号文件不要上传公开仓库
2. 先用小号测试，不要直接用主钱包
3. 并发先从 `1` 开始，稳定后再放大

## 8. 维护者发布安装包（可跳过）

如果你是维护者，需要发布新版安装包：

```bash
git checkout main
git pull
git tag v1.1.2
git push origin v1.1.2
```

推送 tag 后，GitHub Actions 会自动构建并上传到 Releases。
