#!/usr/bin/env node
/**
 * Wrap the TypeScript output in the DSH browser module-loader handoff.
 * 
 * The client-modules shell fetches `/plugins/<id>/client.js` and expects the
 * bundle to register itself via `window.__ModuleLoader__.load({ id, factory })`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = '@deepseek-ai/dsh-plugin-repo-manager'
const TARGET = resolve(__dirname, '..', 'lib', 'client.js')

// Read the compiled JS
let code = ''
if (existsSync(TARGET)) {
  code = readFileSync(TARGET, 'utf8')
} else {
  // Fallback: create a simple stub
  code = `
var PluginRepoTab = function(props) { return null; };
var NS = "settings.pluginRepo";
var inject = ["slots", "locale", "remote", "remote.pluginRepo"];
function apply(ctx) {
  ctx.effect(function() { return ctx.locale.register(NS, { zh: {}, en: {} }); }, 'dsh-plugin-repo-manager: dictionaries');
  var t = ctx.locale.bind(NS);
  var pluginRepoTabInjected = {
    list: function() { return ctx.remote.pluginRepo.list(); },
    uninstall: function(name) { return ctx.remote.pluginRepo.uninstall({ name: name }); }
  };
  ctx.slots.inject('settings.plugins.tab', function() {
    return ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'plugin-repo',
      order: 20,
      label: function() { return t('tab'); },
      locale: NS,
      inject: function() { return pluginRepoTabInjected; }
    }, PluginRepoTab);
  });
}
module.exports = { apply: apply, NS: NS, inject: inject };
`
}

// Wrap in ModuleLoader handoff
const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PKG)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${code}
    return module.exports;
  }
});
`

// Ensure lib directory exists
const libDir = resolve(__dirname, '..', 'lib')
if (!existsSync(libDir)) {
  mkdirSync(libDir, { recursive: true })
}

writeFileSync(TARGET, wrapped)
console.log(`wrapped ${TARGET}`)
