.PHONY: build install install-all install-panel uninstall uninstall-panel list check verify test typecheck sync-skill sync-skill-dry update-panel list-profiles help

# DSHPlugins 便捷命令。
#
# 说明：本仓库的安装分两类，互不相同——
#   - 技能型（skills/）：复制到 $DSH_HOME/skills/，由 skill-filesystem 自动发现
#   - 面板型（panels/）：编译产物装到 DSH profile，注册为 bundle
#
# 另外：技能还要在 WorkBuddy 本机可用（~/.workbuddy/skills/）。
# **以本仓库为唯一实现来源**，用户级那份用 `make sync-skill` 生成，不要手改。

REPO_ROOT := $(shell pwd)
PANEL_DIR := $(REPO_ROOT)/panels/dsh-plugin-repo-manager
DSH_HOME  ?= $(HOME)/.dsh

help: ## 显示帮助
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

build: ## 编译面板插件（服务端 tsc + 客户端 bundle）
	cd $(PANEL_DIR) && npm run build

install: ## 安装技能到 DSH：make install NAME=lucky-api
	@test -n "$(NAME)" || (echo "用法: make install NAME=<技能名>" && exit 1)
	@test -d "skills/$(NAME)" || (echo "ERROR: skills/$(NAME) 不存在" && exit 1)
	mkdir -p "$(DSH_HOME)/skills"
	rm -rf "$(DSH_HOME)/skills/$(NAME)"
	cp -r "skills/$(NAME)" "$(DSH_HOME)/skills/$(NAME)"
	@echo "✓ 已安装 skills/$(NAME) → $(DSH_HOME)/skills/$(NAME)"

install-all: ## 安装 skills/ 下所有技能到 DSH
	@mkdir -p "$(DSH_HOME)/skills"
	@for d in skills/*/; do \
		n=$$(basename "$$d"); \
		[ -f "$$d/SKILL.md" ] || continue; \
		rm -rf "$(DSH_HOME)/skills/$$n"; \
		cp -r "$$d" "$(DSH_HOME)/skills/$$n"; \
		echo "✓ $$n"; \
	done

install-panel: build ## 安装面板插件到 DSH profile（会先编译）
	bash scripts/install-to-profile.sh

list-profiles: ## 只读：列出 profile 候选与各自检查结果（多机部署排查用）
	bash scripts/lib/resolve-profile.sh --list

update-panel: ## 拉取最新并重装面板插件（git pull + install，等价于 install-panel 的「先更新」版）
	bash scripts/update-and-install.sh

uninstall-panel: ## 从 DSH profile 卸载面板插件
	bash scripts/uninstall-from-profile.sh

uninstall: ## 卸载技能：make uninstall NAME=lucky-api
	@test -n "$(NAME)" || (echo "用法: make uninstall NAME=<技能名>" && exit 1)
	rm -rf "$(DSH_HOME)/skills/$(NAME)"
	@echo "✓ 已卸载 $(NAME)"

sync-skill: ## 同步技能到 WorkBuddy 用户级：make sync-skill NAME=lucky-api（全部：ALL=1）
	@if [ "$(ALL)" = "1" ]; then \
		python3 scripts/sync-skill-to-workbuddy.py --all; \
	else \
		test -n "$(NAME)" || (echo "用法: make sync-skill NAME=<技能名> 或 make sync-skill ALL=1" && exit 1); \
		python3 scripts/sync-skill-to-workbuddy.py "$(NAME)"; \
	fi

sync-skill-dry: ## 只报告同步差异，不写文件
	@if [ "$(ALL)" = "1" ]; then \
		python3 scripts/sync-skill-to-workbuddy.py --all --dry-run; \
	else \
		test -n "$(NAME)" || (echo "用法: make sync-skill-dry NAME=<技能名> 或 ALL=1" && exit 1); \
		python3 scripts/sync-skill-to-workbuddy.py "$(NAME)" --dry-run; \
	fi

list: ## 列出仓库中的插件
	@echo "技能（skills/）:"
	@for d in skills/*/; do \
		[ -f "$$d/SKILL.md" ] || continue; \
		v=$$(grep -o '"version"[^,]*' "$$d/manifest.json" 2>/dev/null | head -1 | cut -d'"' -f4); \
		printf "  %-24s %s\n" "$$(basename $$d)" "$${v:-?}"; \
	done
	@echo ""
	@echo "面板（panels/）:"
	@for d in panels/*/; do \
		[ -d "$$d" ] || continue; \
		v=$$(grep -o '"version"[^,]*' "$$d/manifest.json" 2>/dev/null | head -1 | cut -d'"' -f4); \
		printf "  %-24s %s\n" "$$(basename $$d)" "$${v:-?}"; \
	done

check: ## 校验仓库中所有插件（只读）
	@for d in skills/*/ panels/*/; do \
		[ -d "$$d" ] || continue; \
		printf "%-40s" "$$d"; \
		if python3 "$$HOME/.workbuddy/skills/dsh-plugin-repo-add/scripts/validate_plugin.py" "$$d" >/dev/null 2>&1; then \
			echo "PASS"; \
		else \
			echo "FAIL"; \
		fi; \
	done

verify: ## 跑仓库侧全部校验（Python 校验 + Bash 自检 + 一致性回归 + 面板可加载性 + 宿主路径探测 + 镜像技能对齐 + 两类守卫的反向回归）
	@echo "== 1/8 仓库结构校验（validate_repo.py）=="
	@python3 scripts/validate_repo.py || exit 1
	@echo ""
	@echo "== 2/8 安装前自检（preflight.sh）=="
	@bash scripts/preflight.sh || exit 1
	@echo ""
	@echo "== 3/8 凭据粗筛一致性回归（两套实现判定必须一致）=="
	@python3 scripts/tests/test_cred_parity.py || exit 1
	@echo ""
	@echo "== 4/8 面板可加载性（按包名真实解析 + 导出形态）=="
	@node scripts/tests/test-panel-resolve.mjs || exit 1
	@echo ""
	@echo "== 5/8 DSH profile 运行时探测（真实 lib + 假布局）=="
	@bash scripts/tests/test-profile-resolve.sh || exit 1
	@echo ""
	@echo "== 6/8 镜像技能结构对齐（game-dev-workflow ↔ app-dev-workflow）=="
	@python3 scripts/tests/test-skill-parity.py || exit 1
	@echo ""
	@echo "== 7/8 镜像对齐守卫的反向回归（注入漂移，证其非空转）=="
	@python3 scripts/tests/test-skill-parity-negatives.py || exit 1
	@echo ""
	@echo "== 8/8 宿主路径守卫的反向回归（注入漂移，证其非空转）=="
	@python3 scripts/tests/test-host-path-guard.py || exit 1
	@echo ""
	@echo "✓ 全部校验通过"

test: ## 跑面板插件的单元/端到端测试
	cd $(PANEL_DIR) && npm test

typecheck: ## 面板插件类型检查
	cd $(PANEL_DIR) && npm run typecheck
