---
id: BUG-###
ws: WS-yyyymmdd-slug
severity: P2            # P0/P1/P2/P3（定义见 pipeline.md S5）
status: open            # open/locating/fixing/verified/closed/cannot-reproduce/deferred
owner: <登记:QA>
created: yyyy-mm-dd
updated: yyyy-mm-dd
fix_task: T##           # 修复挂靠的任务卡
---

# BUG-###：<一句话标题>

## 复现步骤（可照做级别）

1. <步骤>

## 期望 vs 实际

- 期望（引 DS-n 或设计节）：
- 实际：

## 环境

<版本/设备/账号/网络/时间>

## 根因分析（定位后回填）

- 直接原因：
- 根因：
- 影响面（还有哪里可能同病）：
- 根因分类：`代码 / 设计 / 流程`（分不清往上游归）

## 修复（走修复卡，提交 [WS][T##][BUG-###]）

- 修复卡：<T##>
- 方案与 commit：

## 验证（原步骤 + 影响面 + 回归）

- 结果与证据：

## 回流判定（根因=流程 时必填，产出 lesson 或检查项修订）

- <L-xxx / 修订了哪个检查项 / 理由>

## 状态日志（追加）

| 日期 | 状态流转 | 操作者 |
|---|---|---|
