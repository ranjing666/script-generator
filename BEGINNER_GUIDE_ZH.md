# 零基础上手教程（从 0 到跑起来）

这份教程面向没有脚本经验的新手，只做一件事：让你独立跑通一个项目方测试网任务脚本。

## 1. 先准备环境（只做一次）

1. 安装 Node.js（建议 `18` 或 `20`）
2. 打开终端，进入生成器目录：

```bash
cd E:\文档\web3脚本参考\script-generator
```

3. 安装依赖：

```bash
npm install
```

## 2. 启动脚本生成器

```bash
npm start
```

你会看到两个模式：
- 手动拼接模式
- 抓包导入模式

新手优先用 `抓包导入模式`。

## 3. 抓包导入模式（推荐）

### 3.1 先拿接口数据

你可以给生成器三种输入：
- `HAR`（推荐）
- `Postman Collection v2.1`
- `cURL` 文本

如果你不知道怎么选：优先 `HAR`，因为通常带响应体，自动识别更准。

### 3.2 生成器里怎么选

1. 输入项目名
2. 选择抓包来源类型
3. 输入文件路径（例如 `examples/sample.har`）
4. 选择账号来源：
- `privateKeys`：钱包签名/链上任务
- `tokens`：你已经有 token
- `accounts`：邮箱密码登录
5. 选择登录模式
6. 选择要导入的任务组
7. 设置并发、是否循环

完成后会在 `generated/你的项目名/` 生成一个独立项目。

## 4. 生成后先看这 4 个文件

1. `project.config.json`
2. `import.report.json`（导入模式会有）
3. `.env.example`
4. `data/` 下账号文件

重点规则：
- `import.report.json` 先看 `warnings`，有告警先修告警
- `project.config.json` 里 URL、路径、字段一定要二次确认
- `.env.example` 里出现的变量都要在 `.env` 填值

## 5. 账号文件怎么填

按你选择的账号来源填：

- `privateKeys`：
  - 文件：`data/privateKeys.txt`
  - 每行一个私钥（`0x...`）

- `tokens`：
  - 文件：`data/tokens.txt`
  - 每行一个 token（不用 `Bearer ` 前缀也可，按你的接口实际情况调整）

- `accounts`：
  - 文件：`data/accounts.txt`
  - 每行一组账号，默认分隔符是 `|`
  - 例如：`email@example.com|your_password`

## 6. 配置里最重要的字段

### 6.1 登录

- 普通登录：
  - `auth.type = request`
  - `auth.extractTokenPath` 要能拿到 token

- 钱包签名登录：
  - `auth.type = evm_sign`
  - `auth.nonceRequest`：拿 nonce/challenge
  - `auth.noncePath`：nonce 的路径
  - `auth.messageTemplate` 或 `auth.messagePath`
  - `auth.loginRequest`：带签名换 token

### 6.2 任务

- 普通请求任务：`type = request`
- 列表领取任务：`type = claimList`
  - `itemsPath` 必须是数组路径
  - `claimRequest` 中常用 `{{item.id}}`

### 6.3 重试策略

全局在：
- `project.requestPolicy`

常调字段：
- `maxAttempts`
- `baseDelayMs`
- `retryStatusCodes`

## 7. 运行生成出来的项目

```bash
cd generated\你的项目名
npm install
copy .env.example .env
npm start
```

## 8. 常见报错快速处理

- 报错：`登录成功了，但没提取到 token`
  - 处理：改 `auth.extractTokenPath`

- 报错：`没有拿到待签名消息`
  - 处理：检查 `auth.messageTemplate/messagePath/noncePath`

- 报错：`没有取到可处理列表`
  - 处理：检查 `claimList.itemsPath` 是否指向数组

- 报错：`缺少 RPC_URL`
  - 处理：在 `.env` 填 `RPC_URL=...`

- 一直 `429` 或超时
  - 处理：降低并发、加大重试间隔、换代理

## 9. 新手实操顺序（照着做）

1. 用 `examples/sample.har` 跑通一次
2. 换成你自己的 HAR 再生成
3. 先只保留 `checkin` 任务跑通
4. 再加 `claimList`
5. 最后再开并发和循环

## 10. 安全提示

- 私钥、token、账号文件不要上传公开仓库
- 用小号测试，不要用主钱包
- 先小并发验证，再放大

