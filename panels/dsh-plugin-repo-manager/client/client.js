window.__ModuleLoader__.load({
  id: "dsh-plugin-repo-manager",
  factory: function(require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require('react');
    var jsxRuntime = require('react/jsx-runtime');

    // Locale dictionaries
    // ⚠️ 与 src/client/locales.ts **必须逐字一致**（同一个 locale 命名空间
    // settings.pluginRepo，两边各注册一次）。「不一致时以谁为准」的规则写在
    // src/client/locales.ts 顶部，此处不复述。scripts/test-client-parity.mjs 第 11 节逐键比对。
    // ⚠️ 本文件整体是**模板字符串**：注释里不能出现反引号和美元加花括号，否则会提前闭合。
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
      confirmUninstallMsg: '确定要卸载 "{{name}}" 吗？将从 DSH 的 skills 目录删除，仓库目录不受影响。',
      confirmInstall: '确认安装',
      confirmInstallMsg: '确定要安装 "{{name}}" 吗？将从仓库复制到 skills 目录。',
      uninstallSuccess: '卸载成功',
      uninstallFailed: '卸载失败',
      installSuccess: '安装成功',
      installFailed: '安装失败',
      version: '版本',
      description: '描述',
      refresh: '刷新',
      refreshing: '刷新中...',
      settings: '设置',
      pollInterval: '刷新间隔 (ms)',
      pollIntervalHint: '自动刷新的时间间隔（毫秒）',
      pollIntervalDefault: '3000',
      openInFileExplorer: '在文件管理器中打开',
      repoDir: '仓库目录',
      skillsDir: 'Skills 目录',
    };

    var en = {
      tab: 'My Plugin Repo',
      sidebar: 'Plugin Repo',
      loading: 'Loading...',
      error: 'Failed to load, please retry',
      retry: 'Retry',
      empty: 'No plugins in repository',
      installed: 'Installed',
      notInstalled: 'Not installed',
      install: 'Install',
      installing: 'Installing...',
      uninstall: 'Uninstall',
      uninstalling: 'Uninstalling...',
      confirmUninstall: 'Confirm Uninstall',
      confirmUninstallMsg: 'Uninstall "{{name}}"? It will be removed from the DSH skills directory; the repository directory is not affected.',
      confirmInstall: 'Confirm Install',
      confirmInstallMsg: 'Install "{{name}}"? It will be copied from the repository to the skills directory.',
      uninstallSuccess: 'Uninstall successful',
      uninstallFailed: 'Uninstall failed',
      installSuccess: 'Install successful',
      installFailed: 'Install failed',
      version: 'Version',
      description: 'Description',
      refresh: 'Refresh',
      refreshing: 'Refreshing...',
      settings: 'Settings',
      pollInterval: 'Poll Interval (ms)',
      pollIntervalHint: 'Auto-refresh interval in milliseconds',
      pollIntervalDefault: '3000',
      openInFileExplorer: 'Open in File Explorer',
      repoDir: 'Repository Directory',
      skillsDir: 'Skills Directory',
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
      var _s9 = React.useState(null), notice = _s9[0], setNotice = _s9[1];
      // skillsDir 错位告警（后端 /list 带回；无问题时为 null）+ 用户是否已关掉提示
      var _s10 = React.useState(null), skillsDirWarning = _s10[0], setSkillsDirWarning = _s10[1];
      var _s11 = React.useState(false), warningDismissed = _s11[0], setWarningDismissed = _s11[1];

      function load() {
        setLoading(true); setError(null);
        var url = apiBase + '/list';
        fetch(url)
          .then(function(r) {
            // 必须先判 HTTP 状态再解析 body。
            // 后端没注册时返回的是 404 + HTML，直接 r.json() 会抛
            // "Unexpected token '<'"——把「接口不存在」误报成「JSON 解析失败」，
            // 排查方向会被带偏。这里把状态码和 URL 一起带进错误里。
            if (!r.ok) {
              var err = new Error('HTTP ' + r.status + ' @ ' + url);
              err.status = r.status; err.url = url;
              throw err;
            }
            return r.json();
          })
          .then(function(d) {
            // 每次刷新都更新 skillsDir 诊断：它是「装了却没生效」的唯一线索
            if (d.ok && d.plugins) { setPlugins(d.plugins); setSkillsDirWarning(d.skillsDirWarning || null); }
            else setError((d.error && d.error.message) || '接口返回 OK=false');
          })
          .catch(function(e) {
            if (e && e.status) setError(e.message);
            else setError('请求失败：' + ((e && e.message) || '未知错误') + ' @ ' + url);
          })
          .finally(function() { setLoading(false); });
      }

      React.useEffect(function() { load(); }, []);
      React.useEffect(function() {
        if (pollInterval <= 0) return;
        var t = setInterval(load, pollInterval);
        return function() { clearInterval(t); };
      }, [pollInterval]);

      // 安装 / 更新共用同一接口；后端按已装情况决定是否留档备份
      function install(name, silent) {
        setActionLoading(name); setConfirm(null);
        return fetch(apiBase + '/install', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name: name}) })
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d.ok) {
              if (d.updated) {
                var backup = d.backupDir ? '，旧版已备份至 ' + d.backupDir : '';
                setNotice('已更新 ' + name + '：' + (d.from || '?') + ' → ' + (d.to || '?') + backup);
              } else if (!silent) {
                setNotice('已安装 ' + name + (d.to ? ' (' + d.to + ')' : ''));
              }
              return load().then(function() { return d; });
            }
            setError(d.error && d.error.message);
            return d;
          })
          .catch(function(e) { setError(e && e.message); return null; })
          .finally(function() { setActionLoading(null); });
      }

      // 一键更新所有「可更新」的插件（串行，逐个汇总结果）
      function updateAll() {
        var targets = plugins.filter(function(p) { return p.installed && p.hasUpdate; }).map(function(p) { return p.name; });
        if (!targets.length) return;
        var succeeded = [], failed = [];
        var chain = Promise.resolve();
        targets.forEach(function(n) {
          chain = chain.then(function() {
            return install(n, true).then(function(r) {
              if (r && r.ok) succeeded.push(n); else failed.push(n);
            });
          });
        });
        return chain.then(function() { return load(); })
          .then(function() {
            if (!failed.length) setNotice('全部更新完成（' + succeeded.length + ' 个）');
            else setError('更新失败 ' + failed.length + ' 个：' + failed.join('、') + '（成功 ' + succeeded.length + ' 个）');
          });
      }

      function uninstall(name) {
        setActionLoading(name); setConfirm(null); setNotice(null); setError(null);
        var url = apiBase + '/uninstall';
        fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name: name}) })
          .then(function(r) {
            if (!r.ok) { var err = new Error('HTTP ' + r.status + ' @ ' + url); err.status = r.status; err.url = url; throw err; }
            return r.json();
          })
          .then(function(d) {
            if (d.ok) { setNotice('已卸载 ' + name); load(); }
            else {
              // 必须显示后端 error 的**内容**：曾经的 bug 是后端抛
              // "require is not defined" 而前端什么都不显示 → 表现成「点了没反应」。
              // 注意：整段是模板字符串，换行符必须写成反斜杠+n 两个字符的转义形式，
              // 直接写反斜杠会被模板串在生成期解析成真实换行 → 产出的 JS 语法错误。
              var detail = (d.error && d.error.details) ? '（' + String(d.error.details).split('\n')[0] + '）' : '';
              setError('卸载 ' + name + ' 失败：' + ((d.error && d.error.message) || '未知原因') + detail);
            }
          })
          .catch(function(e) {
            var m = (e && e.message) || '未知错误';
            setError('卸载 ' + name + ' 失败：' + (m.indexOf('@') >= 0 ? m : m + ' @ ' + url));
          })
          .finally(function() { setActionLoading(null); });
      }

      function toggle(name) {
        var n = new Set(selected);
        n.has(name) ? n.delete(name) : n.add(name);
        setSelected(n);
      }

      if (loading && !plugins.length) return jsxRuntime.jsx('div', { style: {padding:'12px 14px',color:'var(--dsw-alias-label-tertiary)'}, children: zh.loading });

      // 错误态：必须把 error 的**内容**显示出来，并附上诊断信息。
      // 曾经这里只画了一个「重试」按钮，error 仅当开关用 —— 结果
      // 「后端没注册(404)」「路径写错」「仓库目录不存在」四种完全不同的
      // 故障长得一模一样，只能靠猜。诊断信息里给出请求 URL 与已解析的
      // repoDir，一眼就能判断是哪一种。
      if (error && !plugins.length) return jsxRuntime.jsx('div', { style: {padding:'12px 14px'} },
        jsxRuntime.jsx('div', { style: {color:'var(--dsw-alias-state-error-primary)', marginBottom:'6px', wordBreak:'break-all', fontSize:'13px'}, children: error }),
        jsxRuntime.jsx('div', { style: {fontSize:'12px', color:'var(--dsw-alias-label-tertiary)', marginBottom:'2px', wordBreak:'break-all', lineHeight:1.4}, children: '接口: ' + apiBase + '/list' }),
        jsxRuntime.jsx('div', { style: {fontSize:'12px', color:'var(--dsw-alias-label-tertiary)', marginBottom:'10px', wordBreak:'break-all', lineHeight:1.4}, children: zh.repoDir + ': ' + repoDir }),
        jsxRuntime.jsx('button', {onClick:load, style:{padding:'4px 10px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer',fontSize:'13px'}, children: zh.retry })
      );

      if (!plugins.length) return jsxRuntime.jsx('div', { style: {padding:'24px',textAlign:'center',color:'var(--dsw-alias-label-tertiary)'}, children: zh.empty });

      return jsxRuntime.jsx('div', { style: {width:'100%',maxWidth:'900px',padding:'12px 14px'} },
        // 头部：紧凑单行 —— 左侧只有刷新，时间戳放到右侧组内，窄面板下不会挤成两行。
        jsxRuntime.jsx('div', { style: {display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',flexWrap:'wrap',marginBottom:'10px'} },
          jsxRuntime.jsx('div', { style: {display:'flex',gap:'6px',alignItems:'center'} },
            jsxRuntime.jsx('button', {onClick:load,disabled:loading,style:{padding:'4px 10px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer',fontSize:'13px'}}, loading ? zh.refreshing : zh.refresh)
          ),
          jsxRuntime.jsx('div', { style: {display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'} },
            jsxRuntime.jsx('span', {style:{color:'var(--dsw-alias-label-tertiary)',fontSize:'12px'}}, lastUpdate.toLocaleTimeString()),
            plugins.some(function(p){return p.installed && p.hasUpdate;}) && jsxRuntime.jsx('button', {onClick:updateAll,style:{padding:'4px 10px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'var(--dsw-alias-state-warning-bg, #fff7e6)',color:'var(--dsw-alias-state-warning-primary, #b26b00)',cursor:'pointer',fontSize:'13px'}}, '⬆ Update All (' + plugins.filter(function(p){return p.installed && p.hasUpdate;}).length + ')'),
            selected.size > 0 && jsxRuntime.jsx('div', {style:{display:'flex',gap:'6px'}},
              jsxRuntime.jsx('button', {onClick:function(){for(var n of selected) install(n); setSelected(new Set());},style:{padding:'4px 10px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'var(--dsw-alias-state-success-bg)',color:'var(--dsw-alias-state-success-primary)',cursor:'pointer',fontSize:'13px'}}, 'Install ('+selected.size+')'),
              jsxRuntime.jsx('button', {onClick:function(){for(var n of selected) uninstall(n); setSelected(new Set());},style:{padding:'4px 10px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'var(--dsw-alias-state-error-bg)',color:'var(--dsw-alias-state-error-primary)',cursor:'pointer',fontSize:'13px'}}, 'Uninstall ('+selected.size+')')
            ),
            jsxRuntime.jsx('button', {onClick:function(){setShowSettings(!showSettings);},style:{padding:'4px 10px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer',fontSize:'13px'}}, '⚙ Settings')
          )
        ),
        notice && jsxRuntime.jsx('div', {style:{marginBottom:'8px',padding:'5px 10px',borderRadius:'5px',fontSize:'12px',background:'var(--dsw-alias-state-success-bg)',color:'var(--dsw-alias-state-success-primary)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'}},
          jsxRuntime.jsx('span', null, notice),
          jsxRuntime.jsx('button', {onClick:function(){setNotice(null);},style:{padding:'2px 8px',borderRadius:'4px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer',fontSize:'12px',flexShrink:0}}, 'Close')
        ),
        // skillsDir 错位告警：这类失效**全程不报错** —— 面板显示「已安装」、
        // 文件确实写进磁盘、接口全部 ok:true，但 DSH 扫描的是另一个目录，
        // 所以技能装了也看不见。必须在这里直接说清楚，别让用户去猜。
        skillsDirWarning && !warningDismissed && jsxRuntime.jsx('div', {style:{marginBottom:'8px',padding:'6px 10px',borderRadius:'5px',fontSize:'12px',lineHeight:1.5,background:'var(--dsw-alias-state-warning-bg, #fff7e6)',color:'var(--dsw-alias-state-warning-primary, #b26b00)',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'8px'}},
          jsxRuntime.jsx('span', {style:{flex:1,wordBreak:'break-word'}}, '⚠ ' + skillsDirWarning),
          jsxRuntime.jsx('button', {onClick:function(){setWarningDismissed(true);},style:{padding:'2px 8px',borderRadius:'4px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer',fontSize:'12px',flexShrink:0}}, 'Got it')
        ),
        // 设置：三项并排一行（原先是纵向 grid，占掉大半屏高度）。
        showSettings && jsxRuntime.jsx('div', {style:{marginBottom:'10px',padding:'10px 12px',background:'var(--dsw-alias-bg-layer-2)',borderRadius:'6px'}},
          jsxRuntime.jsx('div', {style:{display:'flex',gap:'16px',flexWrap:'wrap',alignItems:'flex-end'}},
            jsxRuntime.jsx('div', null,
              jsxRuntime.jsx('label', {style:{display:'block',fontSize:'12px',color:'var(--dsw-alias-label-secondary)',marginBottom:'2px'}}, zh.pollInterval),
              jsxRuntime.jsx('input', {type:'number',min:'500',step:'500',value:pollInterval,onChange:function(e){var n=parseInt(e.target.value); if(!isNaN(n)&&n>=500) setPollInterval(n);},style:{padding:'3px 8px',borderRadius:'4px',border:'1px solid var(--dsw-alias-border-l3)',width:'100px'}})
            ),
            jsxRuntime.jsx('div', {style:{flex:'1 1 240px',minWidth:0}},
              jsxRuntime.jsx('label', {style:{display:'block',fontSize:'12px',color:'var(--dsw-alias-label-secondary)',marginBottom:'2px'}}, zh.repoDir),
              jsxRuntime.jsx('code', {style:{fontFamily:'monospace',fontSize:'12px',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, repoDir)
            )
          )
        ),
        jsxRuntime.jsx('table', {style:{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}},
          jsxRuntime.jsx('thead', null,
            jsxRuntime.jsx('tr', {style:{borderBottom:'1px solid var(--dsw-alias-border-l2)'}},
              jsxRuntime.jsx('th', {style:{padding:'5px 4px',width:'32px'}}, jsxRuntime.jsx('input', {type:'checkbox',checked:selected.size===plugins.length&&plugins.length>0,onChange:function(e){e.target.checked?setSelected(new Set(plugins.map(function(p){return p.name;}))):setSelected(new Set());}})),
              jsxRuntime.jsx('th', {style:{padding:'5px 6px',textAlign:'left',width:'22%'}}, 'Plugin'),
              jsxRuntime.jsx('th', {style:{padding:'5px 6px',textAlign:'left'}}, zh.description),
              jsxRuntime.jsx('th', {style:{padding:'5px 6px',textAlign:'left',width:'96px'}}, 'Version'),
              jsxRuntime.jsx('th', {style:{padding:'5px 6px',textAlign:'center',width:'76px'}}, 'Status'),
              jsxRuntime.jsx('th', {style:{padding:'5px 6px',textAlign:'right',width:'152px'}}, 'Action')
            )
          ),
          jsxRuntime.jsx('tbody', null, plugins.map(function(plugin) {
            return jsxRuntime.jsx('tr', {key:plugin.name,style:{borderBottom:'1px solid var(--dsw-alias-border-l3)'}},
              jsxRuntime.jsx('td', {style:{padding:'6px 4px',textAlign:'center'}}, jsxRuntime.jsx('input', {type:'checkbox',checked:selected.has(plugin.name),onChange:function(){toggle(plugin.name);}})),
              jsxRuntime.jsx('td', {style:{padding:'6px',verticalAlign:'top'}},
                jsxRuntime.jsx('div', {style:{fontWeight:500}}, plugin.name),
                jsxRuntime.jsx('div', {style:{fontSize:'11px',color:'var(--dsw-alias-label-tertiary)',lineHeight:1.4}}, plugin.source==='installed-only' ? '仓库中已不存在' : plugin.repoDirName)
              ),
              // 描述列：两行截断 + title 悬停看全文（与 React 源同款行为）
              jsxRuntime.jsx('td', {style:{padding:'6px',verticalAlign:'top'}},
                plugin.description
                  ? jsxRuntime.jsx('span', {title:plugin.description, style:{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',fontSize:'12px',lineHeight:1.4,color:'var(--dsw-alias-label-secondary)'}}, plugin.description)
                  : jsxRuntime.jsx('span', {style:{fontSize:'12px',color:'var(--dsw-alias-label-tertiary)'}}, '—')
              ),
              jsxRuntime.jsx('td', {style:{padding:'6px',color:'var(--dsw-alias-label-tertiary)',verticalAlign:'top',fontSize:'12px'}},
                plugin.version || '—',
                plugin.installed && plugin.installedVersion && plugin.installedVersion !== plugin.version && jsxRuntime.jsx('div', {style:{fontSize:'11px'}}, 'Installed: ' + plugin.installedVersion),
                plugin.installed && plugin.hasUpdate && jsxRuntime.jsx('div', {style:{display:'inline-block',marginTop:'2px',padding:'0 5px',borderRadius:'8px',fontSize:'11px',background:'var(--dsw-alias-state-warning-bg, #fff7e6)',color:'var(--dsw-alias-state-warning-primary, #b26b00)'}}, 'Update available')
              ),
              jsxRuntime.jsx('td', {style:{padding:'6px',textAlign:'center',verticalAlign:'top'}},
                plugin.installed
                  ? jsxRuntime.jsx('span', {style:{
                      display:'inline-block',padding:'1px 7px',borderRadius:'10px',fontSize:'12px',whiteSpace:'nowrap',
                      background: plugin.hasUpdate ? 'var(--dsw-alias-state-warning-bg, #fff7e6)' : 'var(--dsw-alias-state-success-bg)',
                      color: plugin.hasUpdate ? 'var(--dsw-alias-state-warning-primary, #b26b00)' : 'var(--dsw-alias-state-success-primary)'
                    }, children: plugin.hasUpdate ? 'Update available' : zh.installed})
                  : jsxRuntime.jsx('span', {style:{color:'var(--dsw-alias-label-tertiary)',fontSize:'12px'}, children: zh.notInstalled})
              ),
              jsxRuntime.jsx('td', {style:{padding:'6px',textAlign:'right',verticalAlign:'top',whiteSpace:'nowrap'}},
                !plugin.installed && !actionLoading ? jsxRuntime.jsx('button', {onClick:function(){setConfirm({type:'install',name:plugin.name});},style:{padding:'4px 10px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer',fontSize:'13px'}}, zh.install)
                : actionLoading === plugin.name ? jsxRuntime.jsx('span', {style:{color:'var(--dsw-alias-label-tertiary)',fontSize:'12px'}, children: zh.installing})
                : plugin.installed ? [
                    plugin.hasUpdate && jsxRuntime.jsx('button', {key:'u', onClick:function(){setConfirm({type:'update',name:plugin.name});},style:{padding:'4px 10px',marginRight:'4px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'var(--dsw-alias-state-warning-bg, #fff7e6)',color:'var(--dsw-alias-state-warning-primary, #b26b00)',cursor:'pointer',fontSize:'13px'}}, 'Update'),
                    jsxRuntime.jsx('button', {key:'d', onClick:function(){setConfirm({type:'uninstall',name:plugin.name});},style:{padding:'4px 10px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'var(--dsw-alias-state-error-bg)',color:'var(--dsw-alias-state-error-primary)',cursor:'pointer',fontSize:'13px'}}, zh.uninstall)
                  ] : null
              )
            );
          }))
        ),
        confirm && jsxRuntime.jsx('div', {style:{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}},
          jsxRuntime.jsx('div', {style:{background:'var(--dsw-alias-bg-layer-3)',padding:'18px 20px',borderRadius:'10px',maxWidth:'400px',width:'90%'}},
            jsxRuntime.jsx('h3', {style:{margin:'0 0 10px',fontSize:'15px'}}, confirm.type==='uninstall' ? zh.confirmUninstall : zh.confirmInstall),
            jsxRuntime.jsx('p', {style:{margin:'0 0 16px',fontSize:'13px',lineHeight:1.5}}, (confirm.type==='uninstall' ? zh.confirmUninstallMsg : zh.confirmInstallMsg).replace('{{name}}', confirm.name)),
            jsxRuntime.jsx('div', {style:{display:'flex',gap:'8px',justifyContent:'flex-end'}},
              jsxRuntime.jsx('button', {onClick:function(){setConfirm(null);},style:{padding:'5px 14px',borderRadius:'5px',border:'1px solid var(--dsw-alias-border-l3)',background:'transparent',cursor:'pointer',fontSize:'13px'}}, 'Cancel'),
              jsxRuntime.jsx('button', {onClick:function(){confirm.type==='uninstall'?uninstall(confirm.name):install(confirm.name);},style:{padding:'5px 14px',borderRadius:'5px',border:'none',background:confirm.type==='uninstall'?'var(--dsw-alias-state-error-primary)':'var(--dsw-alias-state-success-primary)',color:'white',cursor:'pointer',fontSize:'13px'}}, 'Confirm')
            )
          )
        )
      );
    }

    // 内联 SVG 图标（package / 箱子）。
    // 不用宿主提供的 icon 名：名字写错时宿主**不报错**，只静默显示空白，
    // 属于「看着像没问题、其实没生效」的失效。自绘 SVG 不依赖宿主图标集，
    // currentColor 还能自动跟随侧边栏深浅色主题。
    function PackageIcon(props) {
      var size = (props && props.size) || 20;
      return jsxRuntime.jsx('svg', {
        width: size, height: size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', focusable: 'false',
        children: [
          jsxRuntime.jsx('path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', key: 'box' }),
          jsxRuntime.jsx('path', { d: 'm3.3 7 8.7 5 8.7-5', key: 'lid' }),
          jsxRuntime.jsx('path', { d: 'M12 22V12', key: 'edge' })
        ]
      });
    }

    // Apply
    function apply(ctx) {
      var NS = 'settings.pluginRepo';
      var SIDEBAR_SLOT_ID = 'plugin-repo-btn';
      var TAB_SLOT_ID = 'plugin-repo';
      var config = (ctx.get && ctx.get('pluginRepoConfig')) || {};
      var pollInterval = config.pollInterval || 3000;
      var repoDir = config.repoDir || '/vol1/1000/AI/DSHPlugin/skills';
      var skillsDir = config.skillsDir || '';
      // 默认 true：配置缺失时保持旧行为，不能因为宿主没注入配置就把按钮弄丢。
      var showSidebarButton = config.showSidebarButton !== false;
      var sidebarTitle = config.sidebarTitle || '';

      ctx.effect(function() { return ctx.locale && ctx.locale.register(NS, {zh:zh, en:en}); }, 'dsh-plugin-repo-manager: dictionaries');
      var t = ctx.locale && ctx.locale.bind ? ctx.locale.bind(NS) : function(k) { return zh[k] || k; };
      var title = sidebarTitle || t('sidebar');

      if (ctx.slots && ctx.slots.inject) {
        ctx.slots.inject('settings.plugins.tab', function() {
          return ctx.slots.register(
            { name:'settings.plugins.tab', id:TAB_SLOT_ID, order:20, label:function(){return t('tab');}, locale:NS },
            function(props) { return jsxRuntime.jsx(PluginRepoPanel, {apiBase:'/api/plugin-repo', pollInterval:pollInterval, repoDir:repoDir, skillsDir:skillsDir}); }
          );
        });
      }

      // 主界面侧边栏（图标按钮）。
      // false 时整个**不注册**，而不是「注册后渲染 null」—— 渲染 null 仍会占位，
      // 仍可能被宿主画出分隔线或引起布局抖动，只有不注册才是真正拿掉。
      if (showSidebarButton && ctx.slots && ctx.slots.inject) {
        ctx.slots.inject('sidebar', function() {
          return ctx.slots.register(
            { name:'sidebar', id:SIDEBAR_SLOT_ID, order:100, icon:'package', label:function(){return title;} },
            function(props) {
              return jsxRuntime.jsx('button', {
                type: 'button',
                title: title,
                'aria-label': title,
                onClick: function(){ if(props.navigateTo) props.navigateTo('settings.plugins.tab.' + TAB_SLOT_ID); },
                style: { display:'flex', alignItems:'center', justifyContent:'center', width:'100%', padding:'6px', border:'none', background:'transparent', color:'inherit', cursor:'pointer', borderRadius:'5px' }
              }, jsxRuntime.jsx(PackageIcon, {}));
            }
          );
        });
      }
    }

    module.exports = { apply: apply, PluginRepoPanel: PluginRepoPanel };
  }
});