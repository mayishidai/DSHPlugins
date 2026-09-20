---
id: T##
ws: WS-yyyymmdd-slug
name: <任务名>
depends: [T01]         # 依赖的卡；无依赖写 []
parallel_group: G2     # 所属并行组
status: backlog        # backlog/ready/doing/review/done/blocked/cancelled
owner: <执行者>
created: yyyy-mm-dd
updated: yyyy-mm-dd
---

# T##：<任务名>

## 目标（做什么、做到什么程度）

<一两句话。>

## 验收标准（逐条自测并留证据）

- [ ] <可执行验证步骤（引用 DS-n 或具体操作）> ｜证据:
- [ ] ｜证据:

## touches-files（预计修改的文件——并行互斥检查依据）

- <path/to/file.cs>

## 实现要点（执行者自由记录）

<读到的关键现状、方案选择、接口设计。>

## 变更文件与提交（完成后回填）

| commit | 文件 | 说明 |
|---|---|---|
| | | |

## 自测证据

<命令输出 / 截图路径 / 日志摘要。>

## 实际耗时与估时对比

- 估时（乐观/现实）：< > ；实际：< >（复盘用）

## 发现与建议（卡外问题登记处，不顺手修）

-

## 状态日志（追加）

| 日期 | 状态流转 | 备注 |
|---|---|---|
