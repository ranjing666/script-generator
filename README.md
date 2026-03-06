# script-generator

这是一个面向当前仓库场景做的交互式脚本生成器。

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
- `project.config.json`
- `main.js`
- `lib/runner.js`
- `data/` 示例文件
- `README.md`

## 示例文件

目录里放了两个示例：
- `examples/sample.har`
- `examples/sample-curl.txt`

你可以先用它们测试导入模式，再换成自己的抓包文件。

## 抓包导入建议

- 如果能导出 `HAR`，优先用 `HAR`
- 因为 `HAR` 通常带响应体，更容易自动识别 `token` 路径
- `cURL` 更适合你只复制了一两个接口命令的情况

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

## 推荐顺序规则

当前默认推荐顺序大致是：
1. `checkin`
2. `faucet`
3. `list + claim`
4. 其他普通请求
5. `heartbeat`

生成后的顺序会写进：
- `project.config.json -> meta.recommendedTaskOrder`

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
