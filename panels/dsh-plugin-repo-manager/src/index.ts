/**
 * dsh-plugin-repo-manager - 自定义插件仓库管理插件
 * 
 * 功能：
 * - 侧边栏按钮，打开面板
 * - 列出本地 skill 仓库
 * - 显示安装状态
 * - 安装/卸载 skill
 * - 轮询刷新（可自定义间隔）
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, mkdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'dsh-plugin-repo-manager'

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  /** 仓库目录：本仓库按「类型」分层，技能型统一放在顶层 skills/ 下 */
  repoDir: '/vol1/1000/AI/DSHPlugin/skills',
  /** skills 目录 */
  skillsDir: () => join(process.env.DSH_HOME || join(process.env.HOME || '', '.dsh'), 'skills'),
  /** 轮询间隔（毫秒） */
  pollInterval: 3000,
  /** 是否启用侧边栏按钮 */
  showSidebarButton: true,
  /** 侧边栏按钮标题 */
  sidebarTitle: '插件仓库',
}

/**
 * 解析仓库目录
 */
function resolveRepoDir(ctx: any): string {
  const config = ctx.get?.('config') as Record<string, unknown> | undefined
  return (config?.['repoDir'] as string | undefined)
    ?? process.env.DSH_PLUGIN_REPO_DIR
    ?? DEFAULT_CONFIG.repoDir
}

/**
 * 解析 skills 目录
 */
function resolveSkillsDir(ctx: any): string {
  const config = ctx.get?.('config') as Record<string, unknown> | undefined
  return (config?.['skillsDir'] as string | undefined)
    ?? process.env.DSH_PLUGIN_SKILLS_DIR
    ?? DEFAULT_CONFIG.skillsDir()
}

/**
 * 解析轮询间隔
 */
function resolvePollInterval(ctx: any): number {
  const config = ctx.get?.('config') as Record<string, unknown> | undefined
  return (config?.['pollInterval'] as number | undefined)
    ?? parseInt(process.env.DSH_PLUGIN_POLL_INTERVAL || '3000')
    ?? 3000
}

/**
 * 检查名称是否合法（kebab-case）
 */
function isValidName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
}

/**
 * 读取插件版本
 */
function getPluginVersion(pluginDir: string): string | null {
  const manifestJson = join(pluginDir, 'manifest.json')
  if (existsSync(manifestJson)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestJson, 'utf-8'))
      return manifest.version ?? null
    } catch { return null }
  }
  const versionJson = join(pluginDir, 'version.json')
  if (existsSync(versionJson)) {
    try {
      const data = JSON.parse(readFileSync(versionJson, 'utf-8'))
      return data.version ?? null
    } catch { return null }
  }
  return null
}

/**
 * 列出仓库中的插件
 */
export function listPlugins(repoDir: string, skillsDir: string): Array<{
  name: string
  repoDirName: string
  version: string | null
  installed: boolean
  installedVersion: string | null
  source: 'repo'
}> {
  const installedNames = new Set<string>()
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      if (isValidName(name)) installedNames.add(name)
    }
  }

  const plugins: any[] = []
  if (!existsSync(repoDir)) return plugins

  for (const dirName of readdirSync(repoDir)) {
    const pluginDir = join(repoDir, dirName)
    if (!existsSync(pluginDir) || readdirSync(pluginDir).length === 0) continue

    const skillMd = join(pluginDir, 'SKILL.md')
    const manifestJson = join(pluginDir, 'manifest.json')
    if (!existsSync(skillMd) && !existsSync(manifestJson)) continue

    const version = getPluginVersion(pluginDir)
    const isInstalled = installedNames.has(dirName)
    const installedVersion = isInstalled ? getInstalledVersion(skillsDir, dirName) : null

    plugins.push({
      name: dirName,
      repoDirName: dirName,
      version,
      installed: isInstalled,
      installedVersion: installedVersion ?? undefined,
      source: 'repo' as const,
    })
  }
  return plugins
}

/**
 * 读取已安装版本
 */
function getInstalledVersion(skillsDir: string, name: string): string | null {
  const versionJson = join(skillsDir, name, 'version.json')
  if (existsSync(versionJson)) {
    try {
      const data = JSON.parse(readFileSync(versionJson, 'utf-8'))
      return data.version ?? null
    } catch { return null }
  }
  return null
}

/**
 * 卸载插件
 */
export function uninstallPlugin(skillsDir: string, name: string): {
  ok: boolean
  name?: string
  removed?: boolean
  error?: { code: string; message: string; details?: string }
} {
  if (!isValidName(name)) {
    return { ok: false, error: { code: 'INVALID_NAME', message: `插件名 "${name}" 不是合法的 kebab-case` } }
  }

  const targetDir = join(skillsDir, name)
  const rel = require('path').relative(skillsDir, targetDir)
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) {
    return { ok: false, error: { code: 'PATH_TRAVERSAL', message: '路径穿越检测失败' } }
  }

  if (!existsSync(targetDir)) {
    return { ok: false, error: { code: 'NOT_INSTALLED', message: `插件 "${name}" 未安装` } }
  }

  try {
    rmSync(targetDir, { recursive: true, force: true })
    return { ok: true, name, removed: true }
  } catch (error) {
    return { ok: false, error: { code: 'UNINSTALL_FAILED', message: `卸载失败`, details: error instanceof Error ? error.message : '未知错误' } }
  }
}

/**
 * 安装插件
 */
export function installPlugin(repoDir: string, skillsDir: string, name: string): {
  ok: boolean
  name?: string
  installed?: boolean
  error?: { code: string; message: string; details?: string }
} {
  if (!isValidName(name)) {
    return { ok: false, error: { code: 'INVALID_NAME', message: `插件名 "${name}" 不是合法的 kebab-case` } }
  }

  const sourceDir = join(repoDir, name)
  if (!existsSync(sourceDir)) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `插件 "${name}" 在仓库中不存在` } }
  }

  const targetDir = join(skillsDir, name)
  const rel = require('path').relative(skillsDir, targetDir)
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) {
    return { ok: false, error: { code: 'PATH_TRAVERSAL', message: '路径穿越检测失败' } }
  }

  try {
    mkdirSync(dirname(targetDir), { recursive: true })
    // 复制整个目录
    const copyDir = (src: string, dst: string) => {
      if (!existsSync(dst)) mkdirSync(dst, { recursive: true })
      for (const file of readdirSync(src)) {
        const srcPath = join(src, file)
        const dstPath = join(dst, file)
        if (existsSync(srcPath)) {
          if (existsSync(srcPath) && readdirSync(srcPath).length > 0) {
            copyDir(srcPath, dstPath)
          } else {
            copyFileSync(srcPath, dstPath)
          }
        }
      }
    }
    copyDir(sourceDir, targetDir)
    
    // 写入版本信息
    const version = getPluginVersion(sourceDir)
    if (version) {
      const versionJson = join(targetDir, 'version.json')
      if (!existsSync(versionJson)) {
        writeFileSync(versionJson, JSON.stringify({ version, installedAt: new Date().toISOString() }, null, 2))
      }
    }

    return { ok: true, name, installed: true }
  } catch (error) {
    return { ok: false, error: { code: 'INSTALL_FAILED', message: `安装失败`, details: error instanceof Error ? error.message : '未知错误' } }
  }
}

/**
 * 读取请求体
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/**
 * 主 apply 函数
 */
export async function apply(ctx: any): Promise<void> {
  const repoDir = resolveRepoDir(ctx)
  const skillsDir = resolveSkillsDir(ctx)
  const pollInterval = resolvePollInterval(ctx)

  // 注册 HTTP API
  const webServer = ctx.get?.('webServer')
  if (webServer) {
    webServer.register({
      kind: 'prefix',
      path: '/api/plugin-repo',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`)
        const method = req.method || 'GET'

        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        try {
          if (url.pathname === '/list' && method === 'GET') {
            const plugins = listPlugins(repoDir, skillsDir)
            sendJson(res, { ok: true, plugins, pollInterval })
          } else if (url.pathname === '/install' && method === 'POST') {
            const body = await readBody(req)
            const { name } = JSON.parse(body || '{}')
            const result = installPlugin(repoDir, skillsDir, name)
            sendJson(res, result)
          } else if (url.pathname === '/uninstall' && method === 'POST') {
            const body = await readBody(req)
            const { name } = JSON.parse(body || '{}')
            const result = uninstallPlugin(skillsDir, name)
            sendJson(res, result)
          } else {
            sendJson(res, { ok: false, error: { code: 'NOT_FOUND', message: '接口不存在' } })
          }
        } catch (error) {
          sendJson(res, { ok: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '未知错误' } })
        }
      }
    })

    console.log(`[plugin-repo-manager] HTTP API registered at /api/plugin-repo`)
    console.log(`[plugin-repo-manager] repoDir: ${repoDir}`)
    console.log(`[plugin-repo-manager] skillsDir: ${skillsDir}`)
    console.log(`[plugin-repo-manager] pollInterval: ${pollInterval}ms`)
  } else {
    console.warn(`[plugin-repo-manager] webServer not available, HTTP API not registered`)
  }

  // 存储配置供客户端使用
  ctx.provide?.('pluginRepoConfig', {
    repoDir,
    skillsDir,
    pollInterval,
  })
}

/**
 * 发送 JSON 响应
 */
function sendJson(res: ServerResponse, data: any): void {
  const body = JSON.stringify(data)
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}
