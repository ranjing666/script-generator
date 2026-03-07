# 风的工具箱

这是一个面向当前仓库场景做的交互式脚本生成器。

零基础唯一入口：
- [NEWBIE_GUIDE_ZH.md](./NEWBIE_GUIDE_ZH.md)

开发/对标参考：
- [BENCHMARK_NOTES_ZH.md](./BENCHMARK_NOTES_ZH.md)

## 小白直接安装（推荐）

不想配 Node.js，直接下载 Windows 安装包：
- Releases: `https://github.com/ranjing666/script-generator/releases`
- 资产文件：`*Setup-x64.exe`

下载安装后，直接打开 `风的工具箱` 图形界面使用。

## 这次升级重点（更简单）

- 新增 `首次打开引导弹窗`：先解释软件用途、输入和输出
- 新增 `新手向导（1-2-3）`：项目名 + 选抓包 + 一键生成
- 新增 `不会抓包？点这里`：内置 HAR 抓包教程弹窗
- 新增 `术语翻译`：HAR / Token / 私钥 / RPC_URL 等一键看人话解释
- 新增 `小白模式`：默认隐藏高级选项，只保留必须输入项
- 新增 `模板库`：预置“账号密码签到 / Token 保活 / EVM 日常任务”
- 新增 `模板画廊`：像工作流模板库一样，一眼看懂每种模板适合什么场景
- 新增 `一键导入`：自动识别抓包类型 + 自动分析 + 自动生成
- 新增 `导入可信度`：用分数和红黄绿提示告诉你这份抓包适不适合直接生成
- 新增 `导入预览与系统建议`：分析后直接看到识别出的请求和下一步建议
- 新增 `诊断助手`：分析失败、生成失败、警告过多时，直接给出修复方向
- 新增 `最近导入记录`：常用抓包文件可一键回填继续做
- 生成成功后自动附带 `.env`、`00-先看这里-零基础说明.md` 和双击脚本
- 桌面版新增正式应用图标，安装包和窗口图标统一

## 目标
- 把常见测试网任务拆成可拼接的积木
- 先生成能跑的工程骨架
- 再让用户只改 `project.config.json`、`.env` 和 `data/` 文件

## 当前支持的积木
- API 签到
- API 心跳
- API 水龙头
- 列表奖励领取
- 通用合约写入
- 原生币转账
- ERC20 代币转账
- 部署合约
- 等待步骤

## 启动
```bash
npm start
```

## 桌面版
```bash
npm install
npm run desktop
```

## 构建安装包（Windows）
```bash
npm run dist:win
```

## 健康检查
```bash
npm run check
```

## 两种模式

### 1. 手动拼接模式

适合你已经知道：
- 用私钥还是 token
- 要做签到、心跳、faucet、mint 还是 deploy

这时生成器会直接问你要哪些积木，然后输出一个标准项目。

### 2. 抓包导入模式

适合你已经从浏览器抓到接口，但不会自己写脚本。

当前支持：
- `HAR` 文件
- `Postman Collection v2.1` 文件
- `cURL` 文本文件

导入后生成器会尽量自动识别：
- 账号来源
- 登录请求
- token 提取路径
- 后续任务请求

然后把这些内容转换成 `project.config.json`。

现在还会额外做两件事：
- 自动把原始请求分组成“任务组”
- 自动给出推荐执行顺序

## 输出结果
生成器会在 `generated/项目名/` 下创建一个独立 Node.js 项目，包含：
- `00-先看这里-零基础说明.md`
- `1-双击-安装依赖.bat`
- `2-双击-启动脚本.bat`
- `.env`
- `project.config.json`
- `import.report.json`（导入模式下）
- `main.js`
- `lib/runner.js`
- `data/` 示例文件
- `README.md`

其中对小白最重要的是：
- 先看 `00-先看这里-零基础说明.md`
- 首次运行双击 `1-双击-安装依赖.bat`
- 填完 `.env` 和 `data/` 后，再双击 `2-双击-启动脚本.bat`

## 示例文件

目录里放了四个示例：
- `examples/sample.har`
- `examples/sample.postman_collection.json`
- `examples/sample-curl.txt`
- `examples/sample-siwe.har`

你可以先用它们测试导入模式，再换成自己的抓包文件。

## 抓包导入建议

- 如果能导出 `HAR`，优先用 `HAR`
- 因为 `HAR` 通常带响应体，更容易自动识别 `token` 路径
- `HAR` 的 `response.content.encoding=base64` 现在也会自动解码再识别
- `cURL` 更适合你只复制了一两个接口命令的情况
- Postman Collection 适合你已经把接口整理成 folder/request 的情况

## 导入模式当前能自动处理什么

- 账号密码登录请求
- Bearer Token 复用
- 常规 API 请求转任务
- 自动把 `list + claim` 合并成 `claimList`
- 自动把任务按推荐顺序排序
- 自动把前一个响应里的动态字段保存到 `state`
- 自动把后续请求中的相同字面量替换成 `{{state.xxx}}`
- 把请求里的 token 替换成 `{{state.token}}`
- 把登录体里的 email/password 替换成 `{{account.xxx}}`
- 自动把 Postman 变量 `{{xxx}}` 映射到 `{{state.xxx}} / {{account.xxx}} / {{env.xxx}}`
- EVM 签名登录会识别 `nonce/challenge` 请求，并优先识别 SIWE 风格消息
- 路径表达式支持数组下标（如 `data.items[0].id`）
- 默认请求重试策略（网络抖动、429、5xx）

## 推荐顺序规则

当前默认推荐顺序大致是：
1. `checkin`
2. `faucet`
3. `list + claim`
4. 其他普通请求
5. `heartbeat`

生成后的顺序会写进：
- `project.config.json -> meta.recommendedTaskOrder`

## 请求重试策略

生成出的 `project.config.json` 在 `project.requestPolicy` 下有默认策略：
- `maxAttempts`: 最大尝试次数（含首次）
- `baseDelayMs`: 首次重试等待毫秒
- `maxDelayMs`: 指数退避最大等待毫秒
- `retryStatusCodes`: 默认包含 `429` 和常见 `5xx`
- `respectRetryAfter`: 如果服务端返回 `Retry-After`，优先按服务端节奏重试

你可以全局改，也可以在单个 `request/claimList` 任务里单独覆盖 `requestPolicy`。
另外，配置里出现的 `{{env.XYZ}}` 变量会自动写入 `.env.example`，减少手工遗漏。

## EVM 签名登录（v7增强）

- 导入器会把 `challenge/message-to-sign/siwe` 一类请求识别为 `auth_nonce`
- 对 SIWE 文本会自动生成 `auth.messageTemplate`
- 自动抽取 `auth.siwe.domain / uri / version / chainId`
- 支持 `auth.noncePath`，签名前先取 nonce，再渲染模板
- 模板可用 `{{auth.siwe.*}}` 和 `{{now.iso}}` / `{{now.unix}}` / `{{now.isoPlus10m}}`
- 导入产物 `import.report.json` 会给出登录链路预警（例如缺少 `noncePath`）

## 动态字段自动绑定

如果抓包里出现这种模式：
- 登录响应返回 `user.id`
- 后续请求体里又写了同一个 `user.id`

生成器现在会自动改成：
- 在 `auth.saveToState` 或任务的 `saveToState` 里保存这个字段
- 在后续请求里用 `{{state.imported.xxx}}` 引用

这样新手不用再手动找哪些字段要从上一个响应里抄过来。

## 导入模式当前还不够自动的地方

- 复杂验证码
- Cookie 依赖很重的网站
- EVM 签名登录里非常规 message 字段
- Solana 签名登录
- 前端加密参数
- 复杂列表任务自动识别成 `claimList`

这些场景生成器会先帮你产出骨架，但你仍然要人工检查 `project.config.json`。

## 适用边界
- 适合 EVM 测试网、普通 HTTP 接口任务、链上合约交互
- 不直接解决复杂验证码、浏览器指纹、前端加密、Solana 签名登录
- 这些复杂场景仍然建议从当前仓库现有项目中抽模板二次扩展

## 资料来源（用于这版能力完善）

- HAR 1.2 结构（包含 `response.content.encoding` 字段）：https://w3c.github.io/web-performance/specs/HAR/Overview.html
- Postman Collection v2.1 结构：https://schema.postman.com/json/collection/v2.1.0/docs/index.html
- HTTP `429 Too Many Requests` 与 `Retry-After`：https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429
- SIWE（EIP-4361）签名登录格式：https://eips.ethereum.org/EIPS/eip-4361
- SIWE 官方站点（实现与流程参考）：https://docs.login.xyz/

## 借鉴项目（本次简化方向）

- n8n（可视化工作流 + 模板思路）：https://github.com/n8n-io/n8n
- Node-RED（流式节点/低门槛编排思路）：https://github.com/node-red/node-red
- Bruno（本地优先、文件可读可改思路）：https://github.com/usebruno/bruno
- Hoppscotch（API 导入与集合管理思路）：https://github.com/hoppscotch/hoppscotch
