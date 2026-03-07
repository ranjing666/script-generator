# 对标调研笔记（GitHub）

本文件记录了本次升级参考的开源项目与落地项，避免“只抄外观，不落地”。

## 参考项目

1. n8n  
   https://github.com/n8n-io/n8n
2. Node-RED  
   https://github.com/node-red/node-red
3. Bruno  
   https://github.com/usebruno/bruno
4. Hoppscotch  
   https://github.com/hoppscotch/hoppscotch
5. Insomnia  
   https://github.com/Kong/insomnia

## 借鉴点 -> 已落地改动

1. 模板优先（来自 n8n/Node-RED 的“先跑通再细化”）  
   - 已新增手动模式模板库，支持一键套用

2. 小白/高级分层（来自主流自动化工具的 Progressive Disclosure）  
   - 已新增小白模式，隐藏高级项，减少误操作

3. 本地文件清晰可改（来自 Bruno 的本地优先理念）  
   - 继续保持生成项目为纯文件结构，不锁死在 GUI

4. 导入即用（来自 Hoppscotch/Insomnia 的导入体验）  
   - 已新增抓包类型自动识别（HAR/Postman/cURL）
   - 已新增“自动识别 + 一键生成”

5. 运行引导闭环  
   - 生成成功后自动输出下一步命令清单，降低新手卡点
