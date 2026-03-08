# 风的工具箱

面向零基础用户的 `Workflow Studio`。  
它不再让用户在“新手向导 / 手动拼接 / 抓包导入”之间切换，而是统一用一个流程工作台完成：

1. 建一个流程项目
2. 选择来源材料
3. 配账号与登录
4. 排步骤卡片
5. 预览后生成脚本项目

零基础唯一入口：
- [NEWBIE_GUIDE_ZH.md](./NEWBIE_GUIDE_ZH.md)

开发/对标参考：
- [BENCHMARK_NOTES_ZH.md](./BENCHMARK_NOTES_ZH.md)

## 安装包

Windows 用户直接下载：
- Releases: `https://github.com/ranjing666/script-generator/releases`
- 安装版：`FengToolbox-*-Setup-x64.exe`
- 便携版：`FengToolbox-*-Portable-x64.exe`

安装后直接打开 `风的工具箱`。

## 2.0.0 这次重构了什么

- 桌面端改成单一 `Workflow Studio`
- 新的唯一作者模型是 `WorkflowDocument v1`
- 项目库改成应用内持久化存储：`userData/studio-projects/<projectId>/workflow.json`
- 支持导出/导入流程文件：`.fengflow.json`
- CLI 不再做交互问答，只负责读取流程文件并导出项目
- 抓包导入、模板起步、空白流程都统一先生成 workflow，再走同一套校验和导出器
- 生成出来的 Node.js 项目结构和双击运行链路继续保留

## 当前作者流程

现在桌面端固定是五段：

1. `项目基础信息`
2. `来源材料`
3. `账号与登录`
4. `步骤卡片流`
5. `诊断 / 预览 / 生成`

新建流程只保留三种 starter：
- `从抓包开始`
- `从模板开始`
- `空白流程`

还支持：
- `导入流程文件`

## 当前支持的步骤类型

- `request`
- `claimList`
- `requestFromFile`
- `contractWrite`
- `nativeTransfer`
- `deployContract`
- `wait`
- `auth`（由登录配置自动同步）

## 桌面版启动

```bash
npm install
npm run desktop
```

## CLI 导出器

CLI 现在只支持 workflow 导出：

```bash
node index.js export --workflow ./demo.fengflow.json --output ./generated/demo
```

说明：
- `--workflow` 必须是 `.fengflow.json`
- `--output` 必须是导出目录
- 桌面端和 CLI 走的是同一套 validation / normalize / export 逻辑

## 构建安装包

```bash
npm run dist:win
```

如果只想单独构建一种：

```bash
npm run dist:win:installer
npm run dist:win:portable
```

## 健康检查

```bash
npm run check
```

这会覆盖：
- workflow 核心模块语法
- 模板起步
- HAR / Postman / cURL / SIWE 导入
- 项目库存取
- `.fengflow.json` 往返
- CLI 导出
- 生成项目辅助文件链路

## 生成结果

Workflow Studio 最终会在目标目录生成一个独立 Node.js 项目，包含：

- `00-先看这里-零基础说明.md`
- `0-双击-运行前检查.bat`
- `1-双击-安装依赖.bat`
- `2-双击-启动脚本.bat`
- `doctor.js`
- `.env`
- `project.config.json`
- `workflow.fengflow.json`
- `main.js`
- `lib/runner.js`
- `data/` 示例文件
- `README.md`

如果流程里用了 `requestFromFile`，还会自动生成：
- `data/requestRows.txt`

## 当前导入能力

抓包导入当前支持：
- `HAR`
- `Postman Collection v2.1`
- `cURL` 文本

导入阶段会尽量自动识别：
- 账号来源
- 登录模式
- token 提取路径
- 任务组
- 列表 + claim 合并
- 推荐顺序

并在 workflow 元数据里记录：
- 来源文件
- 识别到的请求数
- 任务组数量
- 导入警告
- 导入可信度

## 当前模板起点

默认模板包括：
- 账号密码签到
- Token 保活
- EVM 钱包日常任务
- 列表奖励领取
- 批量任务提交
- 链上综合日常

## 适用边界

适合：
- EVM 测试网日常
- 普通 HTTP 接口任务
- 链上合约交互
- 导入抓包后快速拼骨架

不直接解决：
- 复杂验证码
- 浏览器指纹强依赖
- 前端加密参数
- Solana 签名登录
- 项目方私有风控

## 示例文件

仓库里自带四个示例：

- `examples/sample.har`
- `examples/sample.postman_collection.json`
- `examples/sample-curl.txt`
- `examples/sample-siwe.har`

你可以直接用它们测试 Workflow Studio 的导入能力。
