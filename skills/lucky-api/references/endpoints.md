# Lucky 接口清单（完整版）

- **跳板地址（配置里用的）**：`https://lucky.abcc.qzz.io`
- **本次解析出的直连地址**：`https://lucky.stun.abcc.qzz.io:1197`
- **实例版本**：`3.0.2`，构建于 `2026-09-10 07:33:20`
- **接口总数**：`370` 个 `/api/` 接口 + 4 个非 `/api/` 公开接口
- **判定分布**：🔒 259 · ✅ 2 · 🟡 2 · ⚙️ 79 · 🆔 27 · ❌ 1
- **来源**：主包 `static/js/lucky_index-DtdxE2ea.js` **及 92 个懒加载分片**
- **生成时间**：2026-09-18
- **由 `scripts/scrape_endpoints.py` 自动生成**，Lucky 升级后重跑即可刷新

> ⚠️ 只抓主包会漏掉约 **84%** 的接口——绝大多数模块接口都在懒加载分片里。

## 标记含义

| 标记 | 含义 | 数量 |
|---|---|---|
| 🔒 | GET 实测返回 `login invalid` —— **路由确实存在**，需有效 token | 259 |
| ✅ | GET 实测返回 `ret == 0`（免鉴权的公开接口） | 2 |
| 🟡 | 未带 token 却**直达业务层**（返回业务错误码），路由确认存在 | 2 |
| ⚙️ | 只有非 GET 方法（方法由前端 JS 静态解析），**未做写探测** | 79 |
| 🆔 | 以 `/` 结尾的「按 ID 操作」路径，不带 ID 探测必然 404，属预期 | 27 |
| ❌ | 有静态引用、但 GET 实测 404 且未解析出方法 —— **多半是非 GET 路由**，要用就按 POST/PUT 手工确认 | 1 |

**本次 GET 探测统计**：🔒 259 · ✅ 2 · 404 111 · ⚠️ 0

> Lucky 的鉴权发生在路由之前，所以**不带 token 也能验证路由是否存在**：
> 存在的路径返回 `200 + {"msg":"login invalid","ret":-1}`，
> 不存在的路径返回 `404 + 纯文本 Are you ok? ... not found`。
> 只要拿到**带 `ret` 的 JSON**，就说明路由存在（HTTP 码可能是 400）。

> **为什么写入类接口不做实测**：Lucky 按「方法 + 路径」路由，`/api/ddns` 是 POST/PUT、`/api/docker/compose/up` 是 POST，用 GET 探测必然 404。
> 而试探性发 POST/PUT 会真的发出写请求，本仓库约定写接口不得擅自动线上服务，
> 因此这些接口的方法**只做静态解析**（抽样实测与静态结果完全吻合）。

> ⚠️ 有 1 条既有静态引用又实测 404，已标 ❌：
> `/api/temp-access-tickets`

## HTTP 方法分布（静态解析自前端 JS）

| 方法组合 | 数量 |
|---|---|
| `GET` | 165 |
| `POST` | 67 |
| `PUT` | 34 |
| `GET·PUT` | 21 |
| `(未解析出方法)` | 16 |
| `GET·POST·PUT·DELETE` | 13 |
| `DELETE` | 10 |
| `GET·POST` | 9 |
| `GET·DELETE` | 8 |
| `GET·POST·PUT` | 7 |
| `GET·POST·DELETE` | 6 |
| `POST·PUT·DELETE` | 5 |
| `PUT·DELETE` | 5 |
| `GET·PUT·DELETE` | 4 |

## 页面 → 接口模块对照

| 前端页面 | 接口模块 |
|---|---|
| `/ddns` | `/api/ddns/` |
| `/portforward` | `/api/portforward/` |
| `/cron` | `/api/cron/` |
| `/docker` | `/api/docker/` |
| `/ssl` | `/api/ssl/` |
| `/stun` | `/api/stun/ + stunrule/` |
| `/wol` | `/api/wol/` |
| `/webdav` | `/api/webdav/` |
| `/ftpserver` | `/api/ftpserver/` |
| `/filebrowser` | `/api/third/filebrowser/` |
| `/rclone` | `/api/rclone/` |
| `/storagemanagement` | `/api/storagemanagement/` |
| `/cloudflared` | `/api/cloudflared/` |
| `/coraza` | `/api/coraza/` |
| `/ipfilter` | `/api/ipfliter/ ⚠️ 拼写不同` |
| `/ipdb` | `/api/ipdb/` |
| `/frp` | `/api/frp/` |
| `/dlnaservice` | `/api/dlnaservice/` |
| `/thirdPartyAuthManager` | `/api/thirdPartyAuthManager/` |
| `/webterminal` | `/api/webterminal/` |
| `/web` | `/api/webservice/` |
| `/status` | `/api/status + info + logs` |
| `/set` | `/api/baseconfigure` |
| `/security` | `/api/security-groups/` |
| `/login` | `/api/login + oauth/ + 2fa/ + password/` |

⚠️ `/ipfilter` 页面对应的接口是 `/api/ipfliter/`（上游把 filter 拼成了 fliter）。

## 模块接口数量

| 模块 | 数量 |
|---|---|
| `/api/docker/` | 80 |
| `/api/webservice/` | 33 |
| `/api/(核心)/` | 26 |
| `/api/rclone/` | 25 |
| `/api/ipfliter/` | 18 |
| `/api/ddns/` | 15 |
| `/api/webterminal/` | 14 |
| `/api/cron/` | 13 |
| `/api/ssl/` | 12 |
| `/api/wol/` | 12 |
| `/api/ipdb/` | 10 |
| `/api/status/` | 10 |
| `/api/security-groups/` | 9 |
| `/api/storagemanagement/` | 8 |
| `/api/third/` | 7 |
| `/api/coraza/` | 6 |
| `/api/iconlib/` | 6 |
| `/api/smb/` | 6 |
| `/api/cloudflared/` | 5 |
| `/api/frp/` | 5 |
| `/api/local-path-browser/` | 5 |
| `/api/thirdPartyAuthManager/` | 5 |
| `/api/dlnaservice/` | 4 |
| `/api/ftpserver/` | 4 |
| `/api/oauth/` | 4 |
| `/api/portforward/` | 4 |
| `/api/webdav/` | 4 |
| `/api/account-recovery/` | 3 |
| `/api/modules/` | 3 |
| `/api/stun/` | 3 |
| `/api/stunrule/` | 2 |
| `/api/update/` | 2 |
| `/api/2fa/` | 1 |
| `/api/get-lines/` | 1 |
| `/api/login/` | 1 |
| `/api/logscenter/` | 1 |
| `/api/lucky/` | 1 |
| `/api/natdetect/` | 1 |
| `/api/password/` | 1 |

## 核心 / 配置 — `/api/(核心)/`

- `/api/about-content` 🔒 GET·PUT
- `/api/baseconfigure` 🔒 GET·PUT
- `/api/configure` 🔒
- `/api/ddns` ⚙️ POST·PUT·DELETE
- `/api/ddnstasklist` 🔒 GET
- `/api/frontend-preferences` ⚙️ PUT
- `/api/info` 🔒 GET
- `/api/ipregtest` 🔒 GET
- `/api/login` ⚙️ POST
- `/api/logout` ⚙️ PUT
- `/api/logs` 🔒 GET
- `/api/netinterfaces` 🔒 GET
- `/api/portforward` ⚙️ POST·PUT·DELETE
- `/api/portforwards` 🔒 GET
- `/api/portforwards_lite` 🔒 GET
- `/api/reboot_program` 🔒 GET
- `/api/restoreconfigureconfirm` 🔒 GET
- `/api/security-groups` 🔒 GET·POST
- `/api/ssl` 🔒 GET·POST·PUT·DELETE
- `/api/status` 🔒 GET
- `/api/stunrule` ⚙️ POST·PUT·DELETE
- `/api/stunrulelist` 🔒 GET
- `/api/stunrulelist_lite` 🔒 GET
- `/api/temp-access-tickets` ❌
- `/api/twofapassword` 🔒 GET
- `/api/v2l` ⚙️ POST

## Docker 管理 — `/api/docker/`

- `/api/docker/compose/` 🆔 GET·POST·DELETE
- `/api/docker/compose/backup` ⚙️ POST
- `/api/docker/compose/backup/status` 🔒 GET
- `/api/docker/compose/config` ⚙️ POST
- `/api/docker/compose/containers-for-cron` 🔒 GET
- `/api/docker/compose/discover` ⚙️ POST
- `/api/docker/compose/dockerfile` ⚙️ POST
- `/api/docker/compose/down` ⚙️ POST
- `/api/docker/compose/down-async` ⚙️ POST
- `/api/docker/compose/projects` 🔒 GET
- `/api/docker/compose/read-file` ⚙️ POST
- `/api/docker/compose/restart` ⚙️ POST
- `/api/docker/compose/restore` ⚙️ POST
- `/api/docker/compose/start` ⚙️ POST
- `/api/docker/compose/stop` ⚙️ POST
- `/api/docker/compose/stop-async` ⚙️ POST
- `/api/docker/compose/up` ⚙️ POST
- `/api/docker/compose/up-async` ⚙️ POST
- `/api/docker/compose/update-config` ⚙️ POST
- `/api/docker/compose/update-dockerfile` ⚙️ POST
- `/api/docker/config` 🔒 GET·POST
- `/api/docker/container-groups` 🔒 GET·POST·PUT·DELETE
- `/api/docker/container-groups/collapsed` ⚙️ PUT
- `/api/docker/container-groups/collapsed/states` 🔒 GET
- `/api/docker/container-groups/count` 🔒 GET
- `/api/docker/containers` 🔒 GET·POST
- `/api/docker/containers/` 🔒 GET·POST·DELETE
- `/api/docker/containers/group` 🔒 PUT
- `/api/docker/containers/sort-config` 🔒 GET
- `/api/docker/containers/sort/compose` ⚙️ PUT
- `/api/docker/containers/sort/custom` ⚙️ PUT
- `/api/docker/containers/sort/flat` ⚙️ PUT
- `/api/docker/containers/stats-cached` 🔒 GET
- `/api/docker/containers/switch-version` 🔒 POST
- `/api/docker/disk-usage` 🔒 GET
- `/api/docker/images` 🔒 GET
- `/api/docker/images/` 🔒 GET·POST·DELETE
- `/api/docker/images/backup-tag` 🔒 POST
- `/api/docker/images/build` 🔒 POST
- `/api/docker/images/build-from-git` 🔒 POST
- `/api/docker/images/build-from-zip` 🔒 POST
- `/api/docker/images/containers` 🔒 GET
- `/api/docker/images/import` 🔒 POST
- `/api/docker/images/load` 🔒 POST
- `/api/docker/images/pull` 🔒 POST
- `/api/docker/images/pull-async` 🔒 POST
- `/api/docker/images/pull-with-backup` 🔒 POST
- `/api/docker/images/pull-with-backup-async` 🔒 POST
- `/api/docker/images/push` 🔒 POST
- `/api/docker/images/remove` 🔒 DELETE
- `/api/docker/images/remove-saved-digest` 🔒 POST
- `/api/docker/images/save.withoutcompression` 🔒
- `/api/docker/images/search` 🔒 POST
- `/api/docker/images/upgrade-check` 🔒 POST
- `/api/docker/images/upgrade-check-ws` 🔒
- `/api/docker/images/upgrade-containers` 🔒 POST
- `/api/docker/images/upgrade-containers-async` 🔒 POST
- `/api/docker/images/upgrade-dismiss` 🔒 POST
- `/api/docker/images/upgrade-status` 🔒 GET·DELETE
- `/api/docker/info` 🔒 GET
- `/api/docker/labels` 🔒 GET
- `/api/docker/labels/` 🔒 GET
- `/api/docker/logs` 🔒 GET
- `/api/docker/monitor/status` 🔒 GET
- `/api/docker/networks` 🔒 GET·POST
- `/api/docker/networks/` 🔒 DELETE
- `/api/docker/prune` ⚙️ POST
- `/api/docker/registry/mirrors` 🔒 GET·POST·DELETE
- `/api/docker/self-container` 🔒 GET
- `/api/docker/summary` 🔒 GET
- `/api/docker/system-info` 🔒 GET
- `/api/docker/tasks` 🔒 GET·DELETE
- `/api/docker/tasks/` 🔒 GET·DELETE
- `/api/docker/tasks/image-pull/active` 🔒 GET
- `/api/docker/version` 🔒 GET
- `/api/docker/volumes` 🔒 GET·POST
- `/api/docker/volumes/` 🔒 GET·POST·DELETE
- `/api/docker/volumes/backup/status` 🔒 GET
- `/api/docker/volumes/export` 🔒 GET
- `/api/docker/volumes/import` ⚙️ POST

## Web 服务（反代） — `/api/webservice/`

- `/api/webservice/` 🆔 GET·POST·PUT·DELETE
- `/api/webservice/cgi` ⚙️ POST
- `/api/webservice/cgi/` 🆔 PUT·DELETE
- `/api/webservice/cgi/list` 🔒 GET
- `/api/webservice/discovery/active` 🔒 GET
- `/api/webservice/discovery/cancel` ⚙️ POST
- `/api/webservice/discovery/latest` 🔒 GET
- `/api/webservice/discovery/platform-services` 🔒 GET
- `/api/webservice/discovery/skip-host` ⚙️ POST
- `/api/webservice/discovery/start` ⚙️ POST
- `/api/webservice/discovery/status/` 🆔 GET
- `/api/webservice/frontend-state` 🔒 GET·PUT
- `/api/webservice/groups` 🔒 GET·POST·PUT·DELETE
- `/api/webservice/groups/orderadjustment` ⚙️ PUT
- `/api/webservice/groups/subrulecount` 🔒 GET
- `/api/webservice/lastlogs` 🔒 GET
- `/api/webservice/lightpanel/configtemplate` ⚙️ POST
- `/api/webservice/logs` 🔒 GET
- `/api/webservice/message-callback-channels` 🔒 GET
- `/api/webservice/rule/` 🆔 GET·PUT·DELETE
- `/api/webservice/ruleorderadjustment` ⚙️ PUT
- `/api/webservice/rules` 🔒 GET·POST
- `/api/webservice/rules_lite` 🔒 GET
- `/api/webservice/settings` 🔒 GET·PUT
- `/api/webservice/statistics/` 🆔
- `/api/webservice/statistics/clear` ⚙️ POST
- `/api/webservice/statistics/export` 🔒 GET
- `/api/webservice/statistics/import` ⚙️ POST
- `/api/webservice/statistics/meta` 🔒 GET
- `/api/webservice/webauth/sessions` 🔒 GET
- `/api/webservice/webauth/sessions/` 🔒 DELETE
- `/api/webservice/webauth/sessions/clear-subrule` ⚙️ POST
- `/api/webservice/webauth/sessions/delete` ⚙️ POST

## Rclone 网盘 — `/api/rclone/`

- `/api/rclone/globalconfig` 🔒 GET·PUT
- `/api/rclone/itemorderadjustment` ⚙️ PUT
- `/api/rclone/lastlogs` 🔒 GET
- `/api/rclone/logs` 🔒 GET
- `/api/rclone/remote/` 🆔 GET
- `/api/rclone/remotelist` 🔒 GET·POST·PUT·DELETE
- `/api/rclone/remotelist/option` 🔒 GET
- `/api/rclone/remotelistlite` 🔒 GET
- `/api/rclone/sync/` 🆔 GET
- `/api/rclone/sync/list` 🔒 GET·POST·PUT·DELETE
- `/api/rclone/sync/option` 🔒 GET
- `/api/rclone/sync/run/` 🔒 POST
- `/api/rclone/sync/stop/` 🔒 POST
- `/api/rclone/third/115pan/authcheck/` 🆔 GET
- `/api/rclone/third/115pan/authurl` 🔒 GET
- `/api/rclone/third/115pan/authuserlist` 🔒 GET
- `/api/rclone/third/115pan/user` ⚙️ DELETE
- `/api/rclone/third/alipan/authcheck/` 🆔 GET
- `/api/rclone/third/alipan/authurl` 🔒 GET
- `/api/rclone/third/alipan/authuserlist` 🔒 GET
- `/api/rclone/third/alipan/user` ⚙️ DELETE
- `/api/rclone/third/baidupan/authcheck/` 🆔 GET
- `/api/rclone/third/baidupan/authurl` 🔒 GET
- `/api/rclone/third/baidupan/authuserlist` 🔒 GET
- `/api/rclone/third/baidupan/user` ⚙️ DELETE

## IP 过滤（上游拼写如此） — `/api/ipfliter/`

- `/api/ipfliter/autorecordipconf` 🔒 GET·PUT
- `/api/ipfliter/list` 🔒 GET·POST
- `/api/ipfliter/list/` 🔒 GET·POST·PUT·DELETE
- `/api/ipfliter/list/subrulelist/` 🔒 GET
- `/api/ipfliter/list/subrulelist/order/` 🔒 PUT
- `/api/ipfliter/listlite` 🔒 GET
- `/api/ipfliter/oneclickrecord` 🔒 GET
- `/api/ipfliter/porttrap/blockedips` 🔒 GET
- `/api/ipfliter/porttrap/blockedips/` 🔒 DELETE
- `/api/ipfliter/porttrap/blockedips/batch-delete` 🔒 POST
- `/api/ipfliter/porttrap/blockedips/clear` 🔒 POST
- `/api/ipfliter/porttrap/blockedips/export` 🔒 GET
- `/api/ipfliter/porttrap/blockedips/refresh-ipinfo` 🔒 POST
- `/api/ipfliter/porttrap/blockedips/search` 🔒 GET
- `/api/ipfliter/porttrap/logs` 🔒 GET
- `/api/ipfliter/porttrap/stats` 🔒 GET
- `/api/ipfliter/porttrap/stats/reset` ⚙️ POST
- `/api/ipfliter/porttrapconf` 🔒 GET·PUT

## 动态域名 DDNS — `/api/ddns/`

- `/api/ddns/` 🆔 PUT·DELETE
- `/api/ddns/configure` 🔒 GET·PUT
- `/api/ddns/credential-sources` 🔒 GET
- `/api/ddns/enable` 🔒 GET
- `/api/ddns/expanded` 🔒 GET
- `/api/ddns/getipfromcmdtest` 🔒 GET
- `/api/ddns/ipsectionexpanded` 🔒 GET
- `/api/ddns/lastlogs` 🔒 GET
- `/api/ddns/logs` 🔒 GET
- `/api/ddns/manualSync/` 🆔 GET
- `/api/ddns/odhcpdclients` 🔒 GET
- `/api/ddns/recordOrderadjustment/` 🆔 PUT
- `/api/ddns/task/` 🆔 GET
- `/api/ddns/taskorderadjustment` ⚙️ PUT
- `/api/ddns/webhooktest` ⚙️ POST

## Web 终端 — `/api/webterminal/`

- `/api/webterminal/attach/` 🆔
- `/api/webterminal/config` 🔒 GET·PUT
- `/api/webterminal/connect/` 🆔
- `/api/webterminal/connectionorderadjustment` ⚙️ PUT
- `/api/webterminal/connections` 🔒 GET·POST·PUT
- `/api/webterminal/connections/` 🔒 GET·PUT·DELETE
- `/api/webterminal/connections/test` 🔒 POST
- `/api/webterminal/globalshortcuts` 🔒 GET·PUT
- `/api/webterminal/logs` 🔒 GET
- `/api/webterminal/sessions` 🔒 GET
- `/api/webterminal/sessions/` 🔒 GET·PUT·DELETE
- `/api/webterminal/sftp/` 🆔 GET·POST·DELETE
- `/api/webterminal/shells` 🔒 GET
- `/api/webterminal/splitlayout` 🔒 GET·PUT·DELETE

## 计划任务 — `/api/cron/`

- `/api/cron/dojobs` 🔒 GET
- `/api/cron/enable` 🔒 GET
- `/api/cron/expressioncheck` 🔒 GET
- `/api/cron/groups` 🔒 GET·POST·PUT·DELETE
- `/api/cron/groups/collapsed` ⚙️ PUT
- `/api/cron/groups/collapsed/states` 🔒 GET
- `/api/cron/groups/orderadjustment` ⚙️ PUT
- `/api/cron/groups/taskcount` 🔒 GET
- `/api/cron/jobs/trigger` ⚙️ POST
- `/api/cron/lastlogs` 🔒 GET
- `/api/cron/list` 🔒 GET·POST·PUT·DELETE
- `/api/cron/logs` 🔒 GET
- `/api/cron/taskgrouporderupdate` ⚙️ PUT

## SSL 证书 — `/api/ssl/`

- `/api/ssl/` 🔒 GET·POST·PUT·DELETE
- `/api/ssl/credential-sources` 🔒 GET
- `/api/ssl/download` 🔒
- `/api/ssl/flush` 🔒 PUT
- `/api/ssl/lastlogs` 🔒 GET
- `/api/ssl/logs` 🔒 GET
- `/api/ssl/manualsync/` 🔒 GET
- `/api/ssl/platform/capabilities` 🔒 GET
- `/api/ssl/platform/certificates` 🔒 GET
- `/api/ssl/setting` 🔒 GET·PUT
- `/api/ssl/sslorderadjustment` 🔒 PUT
- `/api/ssl/syncclients` 🔒 GET

## 网络唤醒 WOL — `/api/wol/`

- `/api/wol/client/state` 🔒 GET
- `/api/wol/device` ⚙️ POST·PUT·DELETE
- `/api/wol/device/shutdown` 🔒 GET
- `/api/wol/device/wakeup` 🔒 GET
- `/api/wol/deviceorderadjustment` ⚙️ PUT
- `/api/wol/devices` 🔒 GET
- `/api/wol/devices_lite` 🔒 GET
- `/api/wol/lastlogs` 🔒 GET
- `/api/wol/logs` 🔒 GET
- `/api/wol/service/configure` 🔒 GET·PUT
- `/api/wol/service/getipv4interface` 🔒 GET
- `/api/wol/webhooktest` ⚙️ POST

## IP 地址库 — `/api/ipdb/`

- `/api/ipdb/avalidDBFiles` 🔒 GET
- `/api/ipdb/configure` 🔒 GET·PUT
- `/api/ipdb/dbfile` ⚙️ DELETE
- `/api/ipdb/download` 🔒
- `/api/ipdb/instanceorderadjustment` ⚙️ PUT
- `/api/ipdb/item` ⚙️ POST·PUT·DELETE
- `/api/ipdb/item/` 🆔 GET
- `/api/ipdb/items` 🔒 GET
- `/api/ipdb/logs` 🔒 GET
- `/api/ipdb/query` 🔒 GET

## 主机 / 状态面板 — `/api/status/`

- `/api/status/history` 🔒 GET
- `/api/status/history/clear` ⚙️ POST
- `/api/status/history/meta` 🔒 GET
- `/api/status/history/process-ranks` 🔒 GET
- `/api/status/host-connections` 🔒 GET
- `/api/status/host-overview` 🔒 GET
- `/api/status/host-process-kill` ⚙️ POST
- `/api/status/host-processes` 🔒 GET
- `/api/status/module-overview` 🔒 GET
- `/api/status/ws` 🔒

## 安全组 / 授权 — `/api/security-groups/`

- `/api/security-groups/` 🔒 PUT·DELETE
- `/api/security-groups/grants` 🔒 GET
- `/api/security-groups/grants/` 🔒 DELETE
- `/api/security-groups/grants/delete` ⚙️ POST
- `/api/security-groups/lite` 🔒 GET
- `/api/security-groups/oauth-users` 🔒 GET·POST
- `/api/security-groups/oauth-users/` 🔒 PUT·DELETE
- `/api/security-groups/users` 🔒 GET·POST
- `/api/security-groups/users/` 🔒 PUT·DELETE

## 存储管理 — `/api/storagemanagement/`

- `/api/storagemanagement/aliyunpan_auth` 🔒 GET
- `/api/storagemanagement/aliyunpan_auth_check/` 🆔 GET
- `/api/storagemanagement/enable` 🔒 GET
- `/api/storagemanagement/itemorderadjustment` ⚙️ PUT
- `/api/storagemanagement/lastlogs` 🔒 GET
- `/api/storagemanagement/list` 🔒 GET·POST·PUT·DELETE
- `/api/storagemanagement/litelist` 🔒 GET
- `/api/storagemanagement/logs` 🔒 GET

## 第三方服务 — `/api/third/`

- `/api/third/filebrowser/backupdb` 🔒
- `/api/third/filebrowser/configure` 🔒 GET·PUT
- `/api/third/filebrowser/lastlogs` 🔒 GET
- `/api/third/filebrowser/logs` 🔒 GET
- `/api/third/filebrowser/resetadmin` 🔒 GET
- `/api/third/filebrowser/status` 🔒 GET
- `/api/third/filebrowser/video-transcoding/environment` 🔒 GET

## Coraza WAF — `/api/coraza/`

- `/api/coraza/OWASPCoreRuleset` 🔒 GET
- `/api/coraza/instancelist` 🔒 GET
- `/api/coraza/instanceorderadjustment` ⚙️ PUT
- `/api/coraza/list` 🔒 GET·POST·PUT
- `/api/coraza/list/` 🔒 GET·DELETE
- `/api/coraza/logs` 🔒 GET

## 图标库 — `/api/iconlib/`

- `/api/iconlib/icon` 🟡
- `/api/iconlib/icons` 🔒 GET
- `/api/iconlib/logs` 🔒 GET
- `/api/iconlib/search` 🔒 GET
- `/api/iconlib/sources` 🔒 GET·POST·PUT
- `/api/iconlib/sources/` 🔒 GET·DELETE

## SMB 共享 — `/api/smb/`

- `/api/smb/configure` 🔒 GET·PUT
- `/api/smb/connections/` 🆔 POST
- `/api/smb/lastlogs` 🔒 GET
- `/api/smb/logs` 🔒 GET
- `/api/smb/runtime` 🔒 GET
- `/api/smb/status` 🔒 GET

## Cloudflared 隧道 — `/api/cloudflared/`

- `/api/cloudflared/` 🆔 GET·POST·PUT·DELETE
- `/api/cloudflared/list` 🔒 GET·POST·PUT
- `/api/cloudflared/list/` 🔒 GET·DELETE
- `/api/cloudflared/logs` 🔒 GET
- `/api/cloudflared/orderadjustment` ⚙️ PUT

## FRP 内网穿透 — `/api/frp/`

- `/api/frp/` 🆔 GET·POST·PUT·DELETE
- `/api/frp/list` 🔒 GET·POST·PUT
- `/api/frp/list/` 🔒 GET·DELETE
- `/api/frp/logs` 🔒 GET
- `/api/frp/orderadjustment` ⚙️ PUT

## 本地路径浏览 — `/api/local-path-browser/`

- `/api/local-path-browser/list` 🔒 GET
- `/api/local-path-browser/mkdir` ⚙️ POST
- `/api/local-path-browser/path` ⚙️ DELETE
- `/api/local-path-browser/rename` ⚙️ PUT
- `/api/local-path-browser/roots` 🔒 GET

## 第三方认证 — `/api/thirdPartyAuthManager/`

- `/api/thirdPartyAuthManager/config` 🔒 GET·PUT
- `/api/thirdPartyAuthManager/list` 🔒 GET·POST·PUT
- `/api/thirdPartyAuthManager/list/` 🔒 GET·DELETE
- `/api/thirdPartyAuthManager/logs` 🔒 GET
- `/api/thirdPartyAuthManager/orderadjustment` ⚙️ PUT

## DLNA 服务 — `/api/dlnaservice/`

- `/api/dlnaservice/configure` 🔒 GET·PUT
- `/api/dlnaservice/lastlogs` 🔒 GET
- `/api/dlnaservice/logs` 🔒 GET
- `/api/dlnaservice/status` 🔒 GET

## FTP 服务 — `/api/ftpserver/`

- `/api/ftpserver/configure` 🔒 GET·PUT
- `/api/ftpserver/lastlogs` 🔒 GET
- `/api/ftpserver/logs` 🔒 GET
- `/api/ftpserver/status` 🔒 GET

## OAuth 登录 — `/api/oauth/`

- `/api/oauth/login` ⚙️ POST
- `/api/oauth/status` ✅ GET
- `/api/oauth/tmpcode` 🟡
- `/api/oauth/userinfo` 🔒 GET

## 端口转发 — `/api/portforward/`

- `/api/portforward/` 🆔 GET
- `/api/portforward/configure` 🔒 GET·PUT
- `/api/portforward/enable` 🔒 GET
- `/api/portforward/ruleorderadjustment` 🔒 PUT

## WebDAV — `/api/webdav/`

- `/api/webdav/configure` 🔒 GET·PUT
- `/api/webdav/lastlogs` 🔒 GET
- `/api/webdav/logs` 🔒 GET
- `/api/webdav/status` 🔒 GET

## 账号找回 — `/api/account-recovery/`

- `/api/account-recovery/complete` ⚙️ POST
- `/api/account-recovery/request` ⚙️ POST
- `/api/account-recovery/status` ⚙️ POST

## 模块管理 — `/api/modules/`

- `/api/modules/` 🆔 GET·POST·PUT
- `/api/modules/hidden` ⚙️ PUT
- `/api/modules/list` 🔒 GET

## STUN 穿透 — `/api/stun/`

- `/api/stun/` 🆔 GET
- `/api/stun/configure` 🔒 GET·PUT
- `/api/stun/ruleorderadjustment` 🔒 PUT

## STUN 规则 — `/api/stunrule/`

- `/api/stunrule/enable` 🔒 GET
- `/api/stunrule/webhooktest` ⚙️ POST

## 程序更新 — `/api/update/`

- `/api/update/cancel` 🔒 GET
- `/api/update/comfire` ⚙️ PUT

## 两步验证 — `/api/2fa/`

- `/api/2fa/setting` ⚙️ PUT

## 行读取（按 ID） — `/api/get-lines/`

- `/api/get-lines/` 🆔

## 登录 — `/api/login/`

- `/api/login/challenge` ✅ GET

## 日志中心 — `/api/logscenter/`

- `/api/logscenter/query` 🔒

## Lucky 服务 — `/api/lucky/`

- `/api/lucky/service` ⚙️ PUT

## NAT 侦测 — `/api/natdetect/`

- `/api/natdetect/ws` 🔒

## 密码 — `/api/password/`

- `/api/password/verify` ⚙️ PUT

## 非 `/api/` 前缀的公开接口

不在 `/api/` 下，不需要 token：

- `/LoginPageConfig`
- `/frontendcontroll`
- `/officialwebsiteaddresslist`
- `/version`

## 未确认的候选（不计入清单）

以下字符串形似接口路径，但在前端 JS 里找不到任何 `url:` / 调用点引用，GET 实测也是 404，故不计入清单：

- `/api/.`
- `/api/1427/56167`
- `/api/describeviewtree`
- `/api/logscenter`
- `/api/upload`
- `/api/user`

> 判定依据（实测佐证）：`/api/user` 只出现在中英文 i18n 帮助文案里（`例：前端路径 /app 下访问 /app/api/user，匹配 location /api/`），`/api/upload` 只出现在一段 textarea 的 `placeholder` 里。
> ⚠️ 但别把这里当成绝对的「不存在」：前端还有 `const Ce="/api/logscenter"` 之后用 `` `${Ce}/config` `` 拼路径的写法，这类路径字面上不会出现在任何调用点。要用就手工验证一次。

## 易错点

- ⚠️ 跳板地址会 302 到直连端口，**直连端口会随升级/重启变化**；
  不要硬编码端口，见 SKILL.md「两层地址」一节
- ⚠️ **按「方法 + 路径」路由**：同一个路径 GET 404 不代表接口不存在，
  先查本清单里的方法标记再换方法
- ⚠️ `/api/ipfliter/` —— 上游拼写错误（正确应为 ipfilter），照抄才会 200
- ⚠️ `/api/update/comfire` —— 上游拼写错误（正确应为 confirm）
- ⚠️ 带结尾斜杠的路径（如 `/api/ddns/task/`、`/api/docker/containers/`）表示**按 ID 操作**，需再拼 ID，单独请求会 404
- ⚠️ `*_lite` 后缀是精简列表，字段更少但更快
- ⚠️ 写入/控制类接口（configure、reboot_program、down、prune、remove、restore、kill）会影响线上服务，调用前必须与用户确认
- ⚠️ 实例限流约 **20 次/秒**（响应头 `Ratelimit-Limit: 20`），批量调用要节流
