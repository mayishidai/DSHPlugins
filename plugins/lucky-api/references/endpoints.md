# Lucky 接口清单（完整版）

- **Base URL**：`https://lucky.stun.abcc.qzz.io:48020`
- **接口总数**：`273` 个 `/api/` 接口 + 5 个非 `/api/` 公开接口
- **来源**：主包 `static/js/lucky_index-Byr8K_rD.js` **及 66 个懒加载分片**
- **由 `scripts/scrape_endpoints.py` 自动生成**，Lucky 升级后重跑即可刷新

> ⚠️ 只抓主包会漏掉约 **84%** 的接口——绝大多数模块接口都在懒加载分片里。
> 方法未标注的一律先按 GET 试，报 405 再换 POST。

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
| `/login` | `/api/login + oauth/` |

⚠️ `/ipfilter` 页面对应的接口是 `/api/ipfliter/`（上游把 filter 拼成了 fliter）。

## 模块接口数量

| 模块 | 数量 |
|---|---|
| `/api/docker/` | 71 |
| `/api/(核心)/` | 21 |
| `/api/rclone/` | 20 |
| `/api/webservice/` | 18 |
| `/api/webterminal/` | 15 |
| `/api/ddns/` | 14 |
| `/api/cron/` | 12 |
| `/api/wol/` | 11 |
| `/api/ipdb/` | 9 |
| `/api/ssl/` | 8 |
| `/api/storagemanagement/` | 8 |
| `/api/coraza/` | 6 |
| `/api/iconlib/` | 6 |
| `/api/ipfliter/` | 6 |
| `/api/cloudflared/` | 5 |
| `/api/frp/` | 5 |
| `/api/thirdPartyAuthManager/` | 5 |
| `/api/dlnaservice/` | 4 |
| `/api/ftpserver/` | 4 |
| `/api/oauth/` | 4 |
| `/api/portforward/` | 4 |
| `/api/third/` | 4 |
| `/api/webdav/` | 4 |
| `/api/stun/` | 3 |
| `/api/stunrule/` | 2 |
| `/api/update/` | 2 |
| `/api/lucky/` | 1 |
| `/api/modules/` | 1 |

## 核心 / 配置 — `/api/(核心)/`

- `/api/baseconfigure`
- `/api/ddns`
- `/api/ddnstasklist`
- `/api/info`
- `/api/ipregtest`
- `/api/login`
- `/api/logout`
- `/api/logs`
- `/api/netinterfaces`
- `/api/portforward`
- `/api/portforwards`
- `/api/portforwards_lite`
- `/api/reboot_program`
- `/api/restoreconfigureconfirm`
- `/api/ssl`
- `/api/status`
- `/api/stunrule`
- `/api/stunrulelist`
- `/api/stunrulelist_lite`
- `/api/twofapassword`
- `/api/v2l`

## Docker 管理 — `/api/docker/`

- `/api/docker/compose/`
- `/api/docker/compose/backup`
- `/api/docker/compose/backup/status`
- `/api/docker/compose/config`
- `/api/docker/compose/containers-for-cron`
- `/api/docker/compose/discover`
- `/api/docker/compose/dockerfile`
- `/api/docker/compose/down`
- `/api/docker/compose/down-async`
- `/api/docker/compose/projects`
- `/api/docker/compose/read-file`
- `/api/docker/compose/restart`
- `/api/docker/compose/restore`
- `/api/docker/compose/start`
- `/api/docker/compose/stop`
- `/api/docker/compose/stop-async`
- `/api/docker/compose/up`
- `/api/docker/compose/up-async`
- `/api/docker/compose/update-config`
- `/api/docker/compose/update-dockerfile`
- `/api/docker/config`
- `/api/docker/container-groups`
- `/api/docker/container-groups/collapsed`
- `/api/docker/container-groups/collapsed/states`
- `/api/docker/container-groups/count`
- `/api/docker/container-groups/order`
- `/api/docker/containers`
- `/api/docker/containers/`
- `/api/docker/containers/order-mapping`
- `/api/docker/containers/set-group`
- `/api/docker/containers/stats-cached`
- `/api/docker/containers/switch-version`
- `/api/docker/disk-usage`
- `/api/docker/images`
- `/api/docker/images/`
- `/api/docker/images/backup-tag`
- `/api/docker/images/build`
- `/api/docker/images/build-from-git`
- `/api/docker/images/build-from-zip`
- `/api/docker/images/containers`
- `/api/docker/images/import`
- `/api/docker/images/load`
- `/api/docker/images/pull`
- `/api/docker/images/pull-async`
- `/api/docker/images/pull-with-backup`
- `/api/docker/images/push`
- `/api/docker/images/remove`
- `/api/docker/images/remove-saved-digest`
- `/api/docker/images/search`
- `/api/docker/images/upgrade-check`
- `/api/docker/images/upgrade-containers`
- `/api/docker/images/upgrade-dismiss`
- `/api/docker/images/upgrade-status`
- `/api/docker/info`
- `/api/docker/labels`
- `/api/docker/labels/`
- `/api/docker/logs`
- `/api/docker/monitor/status`
- `/api/docker/networks`
- `/api/docker/networks/`
- `/api/docker/prune`
- `/api/docker/registry/mirrors`
- `/api/docker/self-container`
- `/api/docker/tasks`
- `/api/docker/tasks/`
- `/api/docker/version`
- `/api/docker/volumes`
- `/api/docker/volumes/`
- `/api/docker/volumes/backup/status`
- `/api/docker/volumes/export`
- `/api/docker/volumes/import`

## Rclone 网盘 — `/api/rclone/`

- `/api/rclone/globalconfig`
- `/api/rclone/itemorderadjustment`
- `/api/rclone/lastlogs`
- `/api/rclone/logs`
- `/api/rclone/remote/`
- `/api/rclone/remotelist`
- `/api/rclone/remotelist/option`
- `/api/rclone/remotelistlite`
- `/api/rclone/third/115pan/authcheck/`
- `/api/rclone/third/115pan/authurl`
- `/api/rclone/third/115pan/authuserlist`
- `/api/rclone/third/115pan/user`
- `/api/rclone/third/alipan/authcheck/`
- `/api/rclone/third/alipan/authurl`
- `/api/rclone/third/alipan/authuserlist`
- `/api/rclone/third/alipan/user`
- `/api/rclone/third/baidupan/authcheck/`
- `/api/rclone/third/baidupan/authurl`
- `/api/rclone/third/baidupan/authuserlist`
- `/api/rclone/third/baidupan/user`

## Web 服务（反代） — `/api/webservice/`

- `/api/webservice/`
- `/api/webservice/cgi`
- `/api/webservice/cgi/`
- `/api/webservice/cgi/list`
- `/api/webservice/groups`
- `/api/webservice/groups/orderadjustment`
- `/api/webservice/groups/subrulecount`
- `/api/webservice/lastlogs`
- `/api/webservice/lightpanel/configtemplate`
- `/api/webservice/logs`
- `/api/webservice/modulesettings`
- `/api/webservice/modulesettings/frontend`
- `/api/webservice/rule/`
- `/api/webservice/ruleorderadjustment`
- `/api/webservice/rules`
- `/api/webservice/rules_lite`
- `/api/webservice/tipinfo`
- `/api/webservice/tipread`

## Web 终端 — `/api/webterminal/`

- `/api/webterminal/connectionorderadjustment`
- `/api/webterminal/connections`
- `/api/webterminal/connections/`
- `/api/webterminal/connections/test`
- `/api/webterminal/globalshortcuts`
- `/api/webterminal/logs`
- `/api/webterminal/security`
- `/api/webterminal/security/agreement`
- `/api/webterminal/security/check2fa`
- `/api/webterminal/security/verify2fa`
- `/api/webterminal/sessions`
- `/api/webterminal/sessions/`
- `/api/webterminal/sftp/`
- `/api/webterminal/shells`
- `/api/webterminal/splitlayout`

## 动态域名 DDNS — `/api/ddns/`

- `/api/ddns/`
- `/api/ddns/configure`
- `/api/ddns/enable`
- `/api/ddns/expanded`
- `/api/ddns/getipfromcmdtest`
- `/api/ddns/ipsectionexpanded`
- `/api/ddns/lastlogs`
- `/api/ddns/logs`
- `/api/ddns/manualSync/`
- `/api/ddns/odhcpdclients`
- `/api/ddns/recordOrderadjustment/`
- `/api/ddns/task/`
- `/api/ddns/taskorderadjustment`
- `/api/ddns/webhooktest`

## 计划任务 — `/api/cron/`

- `/api/cron/dojobs`
- `/api/cron/enable`
- `/api/cron/expressioncheck`
- `/api/cron/groups`
- `/api/cron/groups/collapsed`
- `/api/cron/groups/collapsed/states`
- `/api/cron/groups/orderadjustment`
- `/api/cron/groups/taskcount`
- `/api/cron/lastlogs`
- `/api/cron/list`
- `/api/cron/logs`
- `/api/cron/taskgrouporderupdate`

## 网络唤醒 WOL — `/api/wol/`

- `/api/wol/device`
- `/api/wol/device/shutdown`
- `/api/wol/device/wakeup`
- `/api/wol/deviceorderadjustment`
- `/api/wol/devices`
- `/api/wol/devices_lite`
- `/api/wol/lastlogs`
- `/api/wol/logs`
- `/api/wol/service/configure`
- `/api/wol/service/getipv4interface`
- `/api/wol/webhooktest`

## IP 地址库 — `/api/ipdb/`

- `/api/ipdb/avalidDBFiles`
- `/api/ipdb/configure`
- `/api/ipdb/dbfile`
- `/api/ipdb/instanceorderadjustment`
- `/api/ipdb/item`
- `/api/ipdb/item/`
- `/api/ipdb/items`
- `/api/ipdb/logs`
- `/api/ipdb/query`

## SSL 证书 — `/api/ssl/`

- `/api/ssl/`
- `/api/ssl/flush`
- `/api/ssl/lastlogs`
- `/api/ssl/logs`
- `/api/ssl/manualsync/`
- `/api/ssl/setting`
- `/api/ssl/sslorderadjustment`
- `/api/ssl/syncclients`

## 存储管理 — `/api/storagemanagement/`

- `/api/storagemanagement/aliyunpan_auth`
- `/api/storagemanagement/aliyunpan_auth_check/`
- `/api/storagemanagement/enable`
- `/api/storagemanagement/itemorderadjustment`
- `/api/storagemanagement/lastlogs`
- `/api/storagemanagement/list`
- `/api/storagemanagement/litelist`
- `/api/storagemanagement/logs`

## Coraza WAF — `/api/coraza/`

- `/api/coraza/OWASPCoreRuleset`
- `/api/coraza/instancelist`
- `/api/coraza/instanceorderadjustment`
- `/api/coraza/list`
- `/api/coraza/list/`
- `/api/coraza/logs`

## 图标库 — `/api/iconlib/`

- `/api/iconlib/icon`
- `/api/iconlib/icons`
- `/api/iconlib/logs`
- `/api/iconlib/search`
- `/api/iconlib/sources`
- `/api/iconlib/sources/`

## IP 过滤（上游拼写如此） — `/api/ipfliter/`

- `/api/ipfliter/autorecordipconf`
- `/api/ipfliter/list`
- `/api/ipfliter/list/`
- `/api/ipfliter/list/subrulelist/`
- `/api/ipfliter/listlite`
- `/api/ipfliter/oneclickrecord`

## Cloudflared 隧道 — `/api/cloudflared/`

- `/api/cloudflared/`
- `/api/cloudflared/list`
- `/api/cloudflared/list/`
- `/api/cloudflared/logs`
- `/api/cloudflared/orderadjustment`

## FRP 内网穿透 — `/api/frp/`

- `/api/frp/`
- `/api/frp/list`
- `/api/frp/list/`
- `/api/frp/logs`
- `/api/frp/orderadjustment`

## 第三方认证 — `/api/thirdPartyAuthManager/`

- `/api/thirdPartyAuthManager/config`
- `/api/thirdPartyAuthManager/list`
- `/api/thirdPartyAuthManager/list/`
- `/api/thirdPartyAuthManager/logs`
- `/api/thirdPartyAuthManager/orderadjustment`

## DLNA 服务 — `/api/dlnaservice/`

- `/api/dlnaservice/configure`
- `/api/dlnaservice/lastlogs`
- `/api/dlnaservice/logs`
- `/api/dlnaservice/status`

## FTP 服务 — `/api/ftpserver/`

- `/api/ftpserver/configure`
- `/api/ftpserver/lastlogs`
- `/api/ftpserver/logs`
- `/api/ftpserver/status`

## OAuth 登录 — `/api/oauth/`

- `/api/oauth/login`
- `/api/oauth/status`
- `/api/oauth/tmpcode`
- `/api/oauth/userinfo`

## 端口转发 — `/api/portforward/`

- `/api/portforward/`
- `/api/portforward/configure`
- `/api/portforward/enable`
- `/api/portforward/ruleorderadjustment`

## 第三方服务 — `/api/third/`

- `/api/third/filebrowser/configure`
- `/api/third/filebrowser/lastlogs`
- `/api/third/filebrowser/logs`
- `/api/third/filebrowser/resetadmin`

## WebDAV — `/api/webdav/`

- `/api/webdav/configure`
- `/api/webdav/lastlogs`
- `/api/webdav/logs`
- `/api/webdav/status`

## STUN 穿透 — `/api/stun/`

- `/api/stun/`
- `/api/stun/configure`
- `/api/stun/ruleorderadjustment`

## STUN 规则 — `/api/stunrule/`

- `/api/stunrule/enable`
- `/api/stunrule/webhooktest`

## 程序更新 — `/api/update/`

- `/api/update/cancel`
- `/api/update/comfire`

## Lucky 服务 — `/api/lucky/`

- `/api/lucky/service`

## 模块管理 — `/api/modules/`

- `/api/modules/list`

## 非 `/api/` 前缀的公开接口

不在 `/api/` 下，多半**不需要 token**（未逐一验证）：

- `/LoginPageConfig`
- `/about.html`
- `/frontendcontroll`
- `/officialwebsiteaddresslist`
- `/version`

## 易错点

- ⚠️ `/api/ipfliter/` —— 上游拼写错误（正确应为 ipfilter），照抄才会 200
- ⚠️ `/api/update/comfire` —— 上游拼写错误（正确应为 confirm）
- ⚠️ 带结尾斜杠的路径（如 `/api/ddns/task/`、`/api/docker/containers/`）通常表示**按 ID 操作**，需再拼 ID，单独请求会 404
- ⚠️ `*_lite` 后缀是精简列表，字段更少但更快
- ⚠️ 写入/控制类接口（configure、reboot_program、down、prune、remove、restore）会影响线上服务，调用前必须与用户确认
