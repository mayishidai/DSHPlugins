window.__ModuleLoader__.load({
  id: "dsh-plugin-repo-manager",
  factory: function(require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require('react');
    var jsxRuntime = require('react/jsx-runtime');

    // Locale dictionaries
    var zh = {
      tab: '我的插件仓库',
      sidebar: '插件仓库',
      loading: '加载中...',
      error: '加载失败，请重试',
      retry: '重试',
      empty: '仓库中没有插件',
      installed: '已安装',
      notInstalled: '未安装',
      install: '安装',
      installing: '安装中...',
      uninstall: '卸载',
      uninstalling: '卸载中...',
      confirmUninstall: '确认卸载',
      confirmUninstallMsg: '确定要卸载 "{{name}}" 吗？此操作不可撤销。',
      confirmInstall: '确认安装',
      confirmInstallMsg: '确定要安装 "{{name}}" 吗？将从仓库复制到 skills 目录。',
      version: '版本',
      refresh: '刷新',
      refreshing: '刷新中...',
      settings: '设置',
      pollInterval: '刷新间隔 (ms)',
      repoDir: '仓库目录',
      skillsDir: 'Skills 目录',
      openInExplorer: '打开',
    };

    var en = {
      tab: 'My Plugin Repo',
      sidebar: 'Plugin Repo',
      loading: 'Loading...',
      error: 'Failed to load',
      retry: 'Retry',
      empty: 'No plugins',
      installed: 'Installed',
      notInstalled: 'Not installed',
      install: 'Install',
      installing: 'Installing...',
      uninstall: 'Uninstall',
      uninstalling: 'Uninstalling...',
      confirmUninstall: 'Confirm Uninstall',
      confirmUninstallMsg: 'Uninstall "{{name}}"?',
      confirmInstall: 'Confirm Install',
      confirmInstallMsg: 'Install "{{name}}"?',
      version: 'Version',
      refresh: 'Refresh',
      refreshing: 'Refreshing...',
      settings: 'Settings',
      pollInterval: 'Poll Interval (ms)',
      repoDir: 'Repo Directory',
      skillsDir: 'Skills Directory',
      openInExplorer: 'Open',
    };

    // Component
    function PluginRepoPanel(props) {
      var apiBase = props.apiBase || '/api/plugin-repo';
      var initialPollInterval = props.pollInterval || 3000;
      var repoDir = props.repoDir || '/vol1/1000/AI/DSHPlugin/skills';
      var skillsDir = props.skillsDir || '';

      var _s0 = React.useState([]), plugins = _s0[0], setPlugins = _s0[1];
      var _s1 = React.useState(true), loading = _s1[0], setLoading = _s1[1];
      var _s2 = React.useState(null), error = _s2[0], setError = _s2[1];
      var _s3 = React.useState(null), actionLoading = _s3[0], setActionLoading = _s3[1];
      var _s4 = React.useState(new Set()), selected = _s4[0], setSelected = _s4[1];
      var _s5 = React.useState(null), confirm = _s5[0], setConfirm = _s5[1];
      var _s6 = React.useState(initialPollInterval), pollInterval = _s6[0], setPollInterval = _s6[1];
      var _s7 = React.useState(false), showSettings = _s7[0], setShowSettings = _s7[1];
      var _s8 = React.useState(new Date()), lastUpdate = _s8[0];

      function load() {
        setLoading(true); setError(null);
        fetch(apiBase + '/list')
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d.ok && d.plugins) { setPlugins(d.plugins); }
            else setError(d.error && d.error.message || 'Failed');
          })
          .catch(function(e) { setError(e && e.message || 'Error'); })
          .finally(function() { setLoading(false); });
      }

      React.useEffect(function() { load(); }, []);
      React.useEffect(function() {
        if (pollInterval <= 0) return;
        var t = setInterval(load, pollInterval);
        return function() { clearInterval(t); };
      }, [pollInterval]);

      function install(name) {
        setActionLoading(name); setConfirm(null);
        fetch(apiBase + '/install', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name: name}) })
          .then(function(r) { return r.json(); })
          .then(function(d) { if (d.ok) load(); else setError(d.error && d.error.message); })
          .catch(function(e) { setError(e && e.message); })
          .finally(function() { setActionLoading(null); });
      }

      function uninstall(name) {
        setActionLoading(name); setConfirm(null);
        fetch(apiBase + '/uninstall', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name: name}) })
          .then(function(r) { return r.json(); })
          .then(function(d) { if (d.ok) load(); else setError(d.error && d.error.message); })
          .catch(function(e) { setError(e && e.message); })
          .finally(function() { setActionLoading(null); });
      }

      function toggle(name) {
        var n = new Set(selected);
        n.has(name) ? n.delete(name) : n.add(name);
        setSelected(n);
      }

      if (loading && !plugins.length) return jsxRuntime.jsx('div', { style: {padding:'20px',color:'var(--dsw-alias-label-tertiary)'}, children: zh.loading });
      if (error && !plugins.length) return jsxRuntime.jsx('div', { style: {padding:'20px'}, children: jsxRuntime.jsx('button', {onClick:load, children: zh.retry}) });
      if (!plugins.length) return jsxRuntime.jsx('div', { style: {padding:'40px',textAlign:'center',color:'var(--dsw-alias-label-tertiary)'}, children: zh.empty });

      return jsxRuntime.jsx('div', { style: {width:'100%',maxWidth:'900px',padding:'20px'} },
        jsxRuntime.jsx('div', { style: {display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'} },
          jsxRuntime.jsx('div', { style: {display:'flex',gap:'8px',alignItems:'center'} },
            jsxRuntime.jsx('button', {onClick:load,disabled:loading,style:{padding:'6px 12px',borderRadius:'6px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer'}}, loading ? zh.refreshing : zh.refresh),
            jsxRuntime.jsx('span', {style:{color:'var(--dsw-alias-label-tertiary)',fontSize:'12px'}}, 'Updated: ' + lastUpdate.toLocaleTimeString())
          ),
          jsxRuntime.jsx('div', { style: {display:'flex',gap:'8px',alignItems:'center'} },
            selected.size > 0 && jsxRuntime.jsx('div', {style:{display:'flex',gap:'8px'}},
              jsxRuntime.jsx('button', {onClick:function(){for(var n of selected) install(n); setSelected(new Set());},style:{padding:'6px 12px',borderRadius:'6px',border:'1px solid var(--dsw-alias-border-l3)',background:'var(--dsw-alias-state-success-bg)',color:'var(--dsw-alias-state-success-primary)',cursor:'pointer'}}, 'Install ('+selected.size+')'),
              jsxRuntime.jsx('button', {onClick:function(){for(var n of selected) uninstall(n); setSelected(new Set());},style:{padding:'6px 12px',borderRadius:'6px',border:'1px solid var(--dsw-alias-border-l3)',background:'var(--dsw-alias-state-error-bg)',color:'var(--dsw-alias-state-error-primary)',cursor:'pointer'}}, 'Uninstall ('+selected.size+')')
            ),
            jsxRuntime.jsx('button', {onClick:function(){setShowSettings(!showSettings);},style:{padding:'6px 12px',borderRadius:'6px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer'}}, '⚙ Settings')
          )
        ),
        showSettings && jsxRuntime.jsx('div', {style:{marginBottom:'16px',padding:'16px',background:'var(--dsw-alias-bg-layer-2)',borderRadius:'8px'}},
          jsxRuntime.jsx('h3', {style:{margin:'0 0 12px'}}, zh.settings),
          jsxRuntime.jsx('div', {style:{display:'grid',gap:'12px'}},
            jsxRuntime.jsx('div', null,
              jsxRuntime.jsx('label', {style:{display:'block',fontSize:'12px',color:'var(--dsw-alias-label-secondary)',marginBottom:'4px'}}, zh.pollInterval),
              jsxRuntime.jsx('input', {type:'number',min:'500',step:'500',value:pollInterval,onChange:function(e){var n=parseInt(e.target.value); if(!isNaN(n)&&n>=500) setPollInterval(n);},style:{padding:'6px 10px',borderRadius:'4px',border:'1px solid var(--dsw-alias-border-l3)',width:'120px'}})
            ),
            jsxRuntime.jsx('div', null,
              jsxRuntime.jsx('label', {style:{display:'block',fontSize:'12px',color:'var(--dsw-alias-label-secondary)',marginBottom:'4px'}}, zh.repoDir),
              jsxRuntime.jsx('code', {style:{fontFamily:'monospace',fontSize:'12px'}}, repoDir)
            )
          )
        ),
        jsxRuntime.jsx('table', {style:{width:'100%',borderCollapse:'collapse'}},
          jsxRuntime.jsx('thead', null,
            jsxRuntime.jsx('tr', {style:{borderBottom:'1px solid var(--dsw-alias-border-l2)'}},
              jsxRuntime.jsx('th', {style:{padding:'8px',width:'40px'}}, jsxRuntime.jsx('input', {type:'checkbox',checked:selected.size===plugins.length&&plugins.length>0,onChange:function(e){e.target.checked?setSelected(new Set(plugins.map(function(p){return p.name;}))):setSelected(new Set());}})),
              jsxRuntime.jsx('th', {style:{padding:'8px',textAlign:'left'}}, 'Plugin'),
              jsxRuntime.jsx('th', {style:{padding:'8px',textAlign:'left'}}, 'Version'),
              jsxRuntime.jsx('th', {style:{padding:'8px',textAlign:'center'}}, 'Status'),
              jsxRuntime.jsx('th', {style:{padding:'8px',textAlign:'right'}}, 'Action')
            )
          ),
          jsxRuntime.jsx('tbody', null, plugins.map(function(plugin) {
            return jsxRuntime.jsx('tr', {key:plugin.name,style:{borderBottom:'1px solid var(--dsw-alias-border-l3)'}},
              jsxRuntime.jsx('td', {style:{padding:'12px 8px',textAlign:'center'}}, jsxRuntime.jsx('input', {type:'checkbox',checked:selected.has(plugin.name),onChange:function(){toggle(plugin.name);}})),
              jsxRuntime.jsx('td', {style:{padding:'12px 8px'}}, jsxRuntime.jsx('div', {style:{fontWeight:500}}, plugin.name)),
              jsxRuntime.jsx('td', {style:{padding:'12px 8px',color:'var(--dsw-alias-label-tertiary)'}, children: plugin.version || '—'}),
              jsxRuntime.jsx('td', {style:{padding:'12px 8px',textAlign:'center'}},
                plugin.installed ? jsxRuntime.jsx('span', {style:{display:'inline-block',padding:'2px 8px',borderRadius:'12px',fontSize:'12px',background:'var(--dsw-alias-state-success-bg)',color:'var(--dsw-alias-state-success-primary)'}, children: zh.installed}) : jsxRuntime.jsx('span', {style:{color:'var(--dsw-alias-label-tertiary)'}, children: zh.notInstalled})
              ),
              jsxRuntime.jsx('td', {style:{padding:'12px 8px',textAlign:'right'}},
                !plugin.installed && !actionLoading ? jsxRuntime.jsx('button', {onClick:function(){setConfirm({type:'install',name:plugin.name});},style:{padding:'4px 12px',borderRadius:'6px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer'}}, zh.install)
                : actionLoading === plugin.name ? jsxRuntime.jsx('span', {style:{color:'var(--dsw-alias-label-tertiary)'}, children: zh.installing})
                : plugin.installed ? jsxRuntime.jsx('button', {onClick:function(){setConfirm({type:'uninstall',name:plugin.name});},style:{padding:'4px 12px',borderRadius:'6px',border:'1px solid var(--dsw-alias-border-l3)',background:'var(--dsw-alias-state-error-bg)',color:'var(--dsw-alias-state-error-primary)',cursor:'pointer'}}, zh.uninstall) : null
              )
            );
          }))
        ),
        confirm && jsxRuntime.jsx('div', {style:{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}},
          jsxRuntime.jsx('div', {style:{background:'var(--dsw-alias-bg-layer-3)',padding:'24px',borderRadius:'12px',maxWidth:'400px',width:'90%'}},
            jsxRuntime.jsx('h3', {style:{margin:'0 0 16px'}}, confirm.type==='uninstall' ? zh.confirmUninstall : zh.confirmInstall),
            jsxRuntime.jsx('p', {style:{margin:'0 0 24px'}}, (confirm.type==='uninstall' ? zh.confirmUninstallMsg : zh.confirmInstallMsg).replace('{{name}}', confirm.name)),
            jsxRuntime.jsx('div', {style:{display:'flex',gap:'12px',justifyContent:'flex-end'}},
              jsxRuntime.jsx('button', {onClick:function(){setConfirm(null);},style:{padding:'8px 16px',borderRadius:'6px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer'}}, 'Cancel'),
              jsxRuntime.jsx('button', {onClick:function(){confirm.type==='uninstall'?uninstall(confirm.name):install(confirm.name);},style:{padding:'8px 16px',borderRadius:'6px',border:'none',background:confirm.type==='uninstall'?'var(--dsw-alias-state-error-primary)':'var(--dsw-alias-state-success-primary)',color:'white',cursor:'pointer'}}, 'Confirm')
            )
          )
        )
      );
    }

    // Apply
    function apply(ctx) {
      var NS = 'settings.pluginRepo';
      var config = ctx.get && ctx.get('pluginRepoConfig') || {};
      var pollInterval = config.pollInterval || 3000;
      var repoDir = config.repoDir || '/vol1/1000/AI/DSHPlugin/skills';
      var skillsDir = config.skillsDir || '';

      ctx.effect(function() { return ctx.locale && ctx.locale.register(NS, {zh:zh, en:en}); }, 'dsh-plugin-repo-manager: dictionaries');
      var t = ctx.locale && ctx.locale.bind ? ctx.locale.bind(NS) : function(k) { return zh[k] || k; };

      if (ctx.slots && ctx.slots.inject) {
        ctx.slots.inject('settings.plugins.tab', function() {
          return ctx.slots.register(
            { name:'settings.plugins.tab', id:'plugin-repo', order:20, label:function(){return t('tab');}, locale:NS },
            function(props) { return jsxRuntime.jsx(PluginRepoPanel, {apiBase:'/api/plugin-repo', pollInterval:pollInterval, repoDir:repoDir, skillsDir:skillsDir}); }
          );
        });
      }

      if (ctx.slots && ctx.slots.inject) {
        ctx.slots.inject('sidebar', function() {
          return ctx.slots.register(
            { name:'sidebar', id:'plugin-repo-btn', order:100, icon:'package', label:function(){return t('sidebar');} },
            function(props) {
              return jsxRuntime.jsx('div', {
                onClick:function(){ if(props.navigateTo) props.navigateTo('settings.plugins.tab.plugin-repo'); },
                style:{cursor:'pointer',padding:'8px'}
              }, t('sidebar'));
            }
          );
        });
      }
    }

    module.exports = { apply: apply, PluginRepoPanel: PluginRepoPanel };
  }
});