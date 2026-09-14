.PHONY: build install uninstall list sync clean

# DSHPlugin 便捷命令（等价于 scripts/ 下的脚本）

build: ## 生成 registry/manifest.json
	./scripts/build-manifest.sh

install: ## 安装：make install NAME=xxx [FORCE=1]
	./scripts/install-plugin.sh $(NAME) $(if $(FORCE),--force,)

uninstall: ## 卸载：make uninstall NAME=xxx
	./scripts/uninstall-plugin.sh $(NAME)

list: ## 列出插件
	./scripts/list-plugins.sh

sync: ## 一键同步全部插件到 DSH
	./scripts/sync-to-dsh.sh

clean: ## 清理生成的清单
	rm -f registry/manifest.json

help: ## 显示帮助
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'