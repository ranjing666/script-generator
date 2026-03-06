# 桌面版安装与发布指南

这份文档是“安装包模式”专用，目标是让不会命令行的新手也能直接安装使用。

配套截图版文档：`DESKTOP_SCREENSHOT_GUIDE_ZH.md`

## 1. 普通用户安装（不需要 Node.js）

1. 打开 Releases 页面：  
   `https://github.com/ranjing666/script-generator/releases`
2. 点开最新版本（例如 `v1.1.0`）
3. 在 `Assets` 下载：`风的工具箱v<version>-Setup-x64.exe`
4. 双击安装包
5. 安装向导里一直点“下一步”
6. 安装完成后，桌面或开始菜单打开 `风的工具箱v1.1.0`

首次使用建议先用示例文件测试一次，再填真实私钥/token/账号。

## 2. 新手首次使用最短路径

1. 打开软件，切到 `抓包导入`
2. `导入文件路径` 选择一个 `HAR` 文件（优先）
3. 点击 `分析抓包`
4. 保持默认勾选，点击 `生成项目`
5. 点 `打开输出目录`
6. 进入生成目录后按其中 `README.md` 运行脚本

## 3. 维护者发布（自动构建安装包）

仓库已配置工作流：`.github/workflows/desktop-release.yml`

### 3.1 推荐方式：打 Tag 发布

```bash
git checkout main
git pull
git tag v1.1.0
git push origin v1.1.0
```

推送 tag 后，GitHub Actions 会自动：
1. `npm ci`
2. `npm run check`
3. 构建 `*.exe`
4. 上传到对应 Release

### 3.2 手动方式：Actions 触发

1. 打开仓库 `Actions`
2. 选择 `Desktop Build`
3. 点击 `Run workflow`

手动触发会产出 Artifact，可在 Actions 页面下载。

## 4. 本地构建（可选）

```bash
npm install
npm run check
npm run dist:win
```

输出目录：`release/`

如果本地下载 Electron 失败，可先设置镜像再构建：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm run dist:win
```

## 5. 常见问题

- 看不到安装包：先看 Actions 是否成功，再看 Release 的 `Assets`。
- Windows 安全提示：未签名安装包常见现象，点“更多信息 -> 仍要运行”。
- 构建失败：先执行 `npm run check`，再查看工作流 `Build Windows installer` 日志。
