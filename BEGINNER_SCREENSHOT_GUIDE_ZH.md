# 截图版流程文档（小白照抄版）

这份文档按“截图位”写。你只要按顺序做，看到和文档接近的画面就继续下一步。

## 0. 目标

本流程目标只有一个：  
从 `script-generator` 生成一个可运行脚本，并成功执行一次。

## 1. 打开终端并进入目录

在 Windows 终端输入：

```bash
cd E:\文档\web3脚本参考\script-generator
```

### 截图位 1（目录确认）
你应该能看到当前路径是：

```text
E:\文档\web3脚本参考\script-generator>
```

如果不是这个路径，后续命令会失败。

## 2. 安装依赖

```bash
npm install
```

### 截图位 2（安装完成）
末尾应出现类似：

```text
added ... packages
found 0 vulnerabilities
```

## 3. 跑健康检查（必须）

```bash
npm run check
```

### 截图位 3（全绿）
应出现类似：

```text
[PASS] syntax-check
[PASS] har
[PASS] postman
[PASS] siwe
[PASS] curl
[PASS] package-name-fallback
health-check: all passed
```

如果不是 `all passed`，先不要继续，回到仓库更新后重试。

## 4. 启动生成器

```bash
npm start
```

### 截图位 4（启动界面）
应看到类似：

```text
测试网脚本生成器
目标：用任务积木或抓包结果拼出一个可运行的 Node.js 自动化脚本。

选择工作模式
1. 手动拼接模式
2. 抓包导入模式
```

## 5. 先用官方示例走通一次（最关键）

按下面输入：

1. 选择 `2`（抓包导入模式）
2. 项目名输入：`demo-first-run`
3. 抓包来源选 `1`（HAR）
4. 文件路径输入：`examples/sample.har`
5. 后续账号来源、登录模式、任务组都用默认推荐（直接回车）
6. 并发建议先填 `1`
7. 循环先选 `n`

### 截图位 5（生成成功）
末尾应看到类似：

```text
已生成：
- E:\文档\web3脚本参考\script-generator\generated\demo-first-run\project.config.json
...
下一步：
1. 进入目录: ...
```

## 6. 进入生成目录并安装依赖

```bash
cd generated\demo-first-run
npm install
copy .env.example .env
```

### 截图位 6（目录确认）
应看到路径类似：

```text
E:\文档\web3脚本参考\script-generator\generated\demo-first-run>
```

## 7. 填账号文件（按你选择的模式）

你必须修改 `data` 目录下对应文件：

- 私钥模式：`data/privateKeys.txt`
- token 模式：`data/tokens.txt`
- 账号密码模式：`data/accounts.txt`

### 截图位 7（文件内容示例）
例如 `accounts` 模式应是这种结构：

```text
# 字段顺序: email|password
your_email|your_password
```

不要带多余空格，不要留中文占位文本。

## 8. 首次运行

```bash
npm start
```

### 截图位 8（运行日志）
应看到类似：

```text
[项目名][account-1][INFO] ...
[项目名][account-1][OK] ...
[SUMMARY] 成功 x/y
```

## 9. 如果失败，看这 5 个点

1. `project.config.json` 的 URL 是否真实可访问
2. `auth.extractTokenPath` 是否能取到 token
3. `claimList.itemsPath` 是否是数组路径
4. `.env` 里是否补齐了变量
5. 账号文件是否是“真实值”，不是示例值

## 10. 你自己的项目怎么落地

成功跑通示例后，按这个顺序迁移：

1. 用你自己的 HAR/Postman/cURL 再生成一个新目录
2. 先只保留一个简单任务（如 checkin）跑通
3. 再加 claimList
4. 最后再开并发和循环

## 11. 安全红线

1. 私钥、token、账号文件不要上传公开仓库
2. 先小号测试，别直接上主钱包
3. 并发先从 `1` 开始，稳定后再加

