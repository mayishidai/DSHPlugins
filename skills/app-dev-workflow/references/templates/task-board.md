---
id: 02-task-board
ws: WS-yyyymmdd-slug
status: active
owner: <主控>
created: yyyy-mm-dd
updated: yyyy-mm-dd
---

# 任务板：<功能名>

状态列仅主控更新。任务状态机：backlog → ready → doing → review → done（可 blocked/cancelled）。

## 任务汇总

| 卡 | 名称 | 并行组 | 依赖 | 估时(乐观/现实) | 状态 | 执行者 |
|---|---|---|---|---|---|---|
| T01 | 公共底座：配置表 | G1 | - | 0.5d/1d | done | 开发-agent-1 |
| T02 | 数据层 | G2 | T01 | 1d/1.5d | ready | |
| T03 | 逻辑层 | G2 | T01 | 1d/2d | ready | |
| T04 | UI 绑定（体验） | G3 | T02,T03 | 1d/1.5d | backlog | |

## 依赖图（DAG）

```
T01 ──▶ T02 ──┐
       └──────┴──▶ T04 ──▶ T05(接入准备)
T01 ──▶ T03 ──┘
```

## 派发波次（拓扑就绪层 + touches-files 互斥检查）

- 波次1：T01（公共底座，串行）
- 波次2：T02 ∥ T03（文件无交集，已核对）
- 波次3：T04

## 补卡记录（增量拆单留痕）

| 日期 | 新卡 | 原因 |
|---|---|---|
