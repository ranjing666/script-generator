# 对标调研笔记（2026-03）

本文件记录这版 `风的工具箱` 借鉴过的开源项目，以及已经实际落地到仓库里的改进。

## 相关项目与链接

1. n8n
   - GitHub: https://github.com/n8n-io/n8n
   - 模板文档: https://docs.n8n.io/workflows/templates/
   - 借鉴点: 模板库支持 `search` 和 `category`，适合把模板市场做成“先筛选，再选择”。

2. Bruno
   - GitHub: https://github.com/usebruno/bruno
   - 导入文档: https://docs.usebruno.com/import-export-data/import-collections
   - 借鉴点: 导入入口会明确告诉用户支持哪些来源（Bruno / Postman / Insomnia / Git），非常适合给小白看“这份文件能不能导”。

3. Hoppscotch
   - GitHub: https://github.com/hoppscotch/hoppscotch
   - 借鉴点: 它把自己定位成 `Web, Desktop & CLI` 的 API 开发生态，说明“导入、调试、运行”应该是连续体验，而不是孤立按钮。

4. Requestly
   - GitHub: https://github.com/requestly/requestly
   - 借鉴点: 强调 local-first、环境变量、API collections、1-click imports，适合借鉴“本地优先 + 多来源导入 + 新手入口清晰”。

5. API Dash
   - GitHub: https://github.com/foss42/apidash
   - 借鉴点: 支持“可视化请求 + 响应查看 + 生成 API integration code”，适合借鉴“用户看得见请求，并能一键复制代码”。

6. curlconverter
   - GitHub: https://github.com/curlconverter/curlconverter
   - 借鉴点: 把 cURL 转成多语言代码，并明确写出能力边界和限制，适合借鉴“透明转换 + 不瞎承诺完全自动化”。

## 这版已落地的借鉴

1. 模板市场搜索 + 标签筛选（借鉴 n8n 的 template search/category）
   - 新增模板关键词搜索
   - 新增模板标签筛选
   - 目标是让新手先按“钱包 / token / 接口站 / 先跑通”快速缩小范围

2. 导入支持范围面板（借鉴 Bruno / Requestly 的“支持哪些导入来源/能力”表达方式）
   - 分析后不只给“可信度”，还会明确展示：
     - 抓包上下文是否足够
     - 登录链路是否完整
     - 任务分组是否足够
     - 是否识别出列表领取
     - 当前是否适合直接开跑

3. 候选请求一键复制为代码（借鉴 API Dash / curlconverter）
   - 每个候选请求现在都能复制为：
     - cURL
     - Node Axios
   - 这样新手就算暂时不懂整个生成项目，也能先看懂“某个请求到底长什么样”

4. 继续保持本地优先（借鉴 Bruno / Requestly）
   - 生成结果仍然是纯本地文件
   - 不强依赖云端账户
   - 不把用户锁死在 GUI 里

## 为什么这几项比继续堆功能更重要

1. 新手最容易卡死的不是“功能不够多”，而是“不知道该选哪个入口”
2. 只有告诉用户“这次识别到了什么、没识别到什么”，他们才会知道该补抓包还是该改配置
3. 给用户“请求级别的透明度”，比空泛说“已经自动识别”更有用

## 后续仍值得继续借鉴的方向

1. 模板市场继续扩成真实项目案例库
2. 导入结果增加“可编辑预览”，而不只是只读卡片
3. 对失败请求增加“保存为可复现请求”的入口
4. 给新手增加更明确的“环境变量向导”而不是只给 `.env`
