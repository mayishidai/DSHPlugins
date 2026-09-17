.PHONY: build install install-panel uninstall check test help

# DSHPlugins 便捷命令。
#
# 说明：本仓库的安装分两类，互不相同——
#   - 技能型（skills/）：复制到 $DSH_HOME/skills/，由 skill-filesystem 自动发现
#   - 面板型（panels/）：编译产物装到 DSH profile，注册为 bundle

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

uninstall-panel: ## 从 DSH profile 卸载面板插件
	bash scripts/uninstall-from-profile.sh

uninstall: ## 卸载技能：make uninstall NAME=lucky-api
	@test -n "$(NAME)" || (echo "用法: make uninstall NAME=<技能名>" && exit 1)
	rm -rf "$(DSH_HOME)/skills/$(NAME)"
	@echo "✓ 已卸载 $(NAME)"

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

test: ## 跑面板插件的单元/端到端测试
	cd $(PANEL_DIR) && npm test

typecheck: ## 面板插件类型检查
	cd $(PANEL_DIR) && npm run typecheck
