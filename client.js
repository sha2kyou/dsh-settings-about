window.__ModuleLoader__.load({
  id: 'dsh-settings-about',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const NS = 'settings.about'
    const zh = {
      nav: '关于',
      title: '关于',
      loading: '正在读取运行时信息…',
      error: '无法读取 About 信息',
      retry: '重试',
      copy: '复制诊断信息',
      copied: '已复制',
      copyFailed: '复制失败',
      notes: '未解析项',
      links: '链接',
      empty: '没有可展示的字段（宿主未能解析运行中的 dsh）。',
      plugins: '已安装插件',
      pluginsEmpty: '当前没有可列出的 Loader 插件条目。',
      colId: 'ID',
      colModule: '模块',
      colVersion: '版本',
      colEnabled: '启用',
      colPhase: '状态',
      enabledYes: '是',
      enabledNo: '否',
      phaseNull: '—',
      versionNull: '—',
    }
    const en = {
      nav: 'About',
      title: 'About',
      loading: 'Loading runtime info…',
      error: 'Could not load About info',
      retry: 'Retry',
      copy: 'Copy diagnostics',
      copied: 'Copied',
      copyFailed: 'Copy failed',
      notes: 'Unresolved',
      links: 'Links',
      empty: 'No fields to show (host could not resolve the running dsh).',
      plugins: 'Installed Plugins',
      pluginsEmpty: 'No Loader plugin entries to list.',
      colId: 'ID',
      colModule: 'Module',
      colVersion: 'Version',
      colEnabled: 'Enabled',
      colPhase: 'Phase',
      enabledYes: 'yes',
      enabledNo: 'no',
      phaseNull: '—',
      versionNull: '—',
    }

    const css = `
.dshAbout_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex}
.dshAbout_title{margin:0;font-size:16px;font-weight:500;line-height:24px}
.dshAbout_subtitle{margin:0;font-size:14px;font-weight:500;line-height:22px}
.dshAbout_status,.dshAbout_notes li{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dshAbout_error{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex;font-size:13px;line-height:20px}
.dshAbout_error button,.dshAbout_actions button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}
.dshAbout_dl{grid-template-columns:140px minmax(0,1fr);gap:8px 14px;margin:0;display:grid}
.dshAbout_dl div{display:contents}
.dshAbout_dl dt{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshAbout_dl dd{overflow-wrap:anywhere;min-width:0;margin:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;font-family:var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)}
.dshAbout_links{flex-direction:column;gap:6px;display:flex;margin:0;padding:0;list-style:none}
.dshAbout_links a{color:var(--dsw-alias-state-business-primary);font-size:13px;line-height:20px}
.dshAbout_notes{margin:0;padding-left:18px}
.dshAbout_actions{display:flex;gap:8px;align-items:center}
.dshAbout_hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshAbout_plugins{flex-direction:column;gap:8px;display:flex}
.dshAbout_tableWrap{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:auto;max-height:min(360px,50vh)}
.dshAbout_table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px}
.dshAbout_table th{text-align:left;color:var(--dsw-alias-label-tertiary);font-weight:500;padding:8px 10px;background:var(--dsw-alias-bg-layer-1);position:sticky;top:0}
.dshAbout_table td{padding:7px 10px;border-top:1px solid var(--dsw-alias-border-l2);vertical-align:top;overflow-wrap:anywhere;font-family:var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)}
.dshAbout_phase[data-phase=active]{color:var(--dsw-alias-state-success-primary)}
.dshAbout_phase[data-phase=failed]{color:var(--dsw-alias-state-error-primary)}
.dshAbout_phase[data-phase=loading],.dshAbout_phase[data-phase=pending]{color:var(--dsw-alias-state-business-primary)}
`.trim()

    const tagId = 'dsh-settings-about/AboutSection.css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-settings-about'
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function AboutSection(props) {
      const t = props.t
      const [state, setState] = React.useState({ status: 'loading' })
      const [copyState, setCopyState] = React.useState('idle')

      const load = React.useCallback(async () => {
        setState({ status: 'loading' })
        try {
          const response = await fetch('/dsh-about/info', { cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          if (data === null || typeof data !== 'object' || !Array.isArray(data.fields)) {
            throw new Error('invalid snapshot shape')
          }
          setState({ status: 'ready', data })
        } catch (error) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      const onCopy = React.useCallback(async () => {
        if (state.status !== 'ready' || typeof state.data.diagnostics !== 'string') return
        try {
          await navigator.clipboard.writeText(state.data.diagnostics)
          setCopyState('copied')
          setTimeout(() => setCopyState('idle'), 1500)
        } catch {
          setCopyState('failed')
          setTimeout(() => setCopyState('idle'), 2000)
        }
      }, [state])

      if (state.status === 'loading') {
        return React.createElement('div', { className: 'dshAbout_section' },
          React.createElement('h2', { className: 'dshAbout_title' }, t('title')),
          React.createElement('p', { className: 'dshAbout_status' }, t('loading')),
        )
      }

      if (state.status === 'error') {
        return React.createElement('div', { className: 'dshAbout_section' },
          React.createElement('h2', { className: 'dshAbout_title' }, t('title')),
          React.createElement('div', { className: 'dshAbout_error' },
            React.createElement('span', null, `${t('error')}: ${state.message}`),
            React.createElement('button', { type: 'button', onClick: () => void load() }, t('retry')),
          ),
        )
      }

      const { fields, links, notes, plugins } = state.data
      const fieldRows = Array.isArray(fields) ? fields : []
      const linkRows = Array.isArray(links) ? links : []
      const noteRows = Array.isArray(notes) ? notes : []
      const pluginRows = Array.isArray(plugins) ? plugins : []

      return React.createElement('div', { className: 'dshAbout_section' },
        React.createElement('h2', { className: 'dshAbout_title' }, t('title')),
        fieldRows.length === 0
          ? React.createElement('p', { className: 'dshAbout_status' }, t('empty'))
          : React.createElement('dl', { className: 'dshAbout_dl' },
            ...fieldRows.map((row) =>
              React.createElement('div', { key: row.key },
                React.createElement('dt', null, row.label),
                React.createElement('dd', null, row.value),
              ),
            ),
          ),
        React.createElement('div', { className: 'dshAbout_plugins' },
          React.createElement('h3', { className: 'dshAbout_subtitle' }, t('plugins')),
          pluginRows.length === 0
            ? React.createElement('p', { className: 'dshAbout_status' }, t('pluginsEmpty'))
            : React.createElement('div', { className: 'dshAbout_tableWrap' },
              React.createElement('table', { className: 'dshAbout_table' },
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', null, t('colId')),
                    React.createElement('th', null, t('colModule')),
                    React.createElement('th', null, t('colVersion')),
                    React.createElement('th', null, t('colEnabled')),
                    React.createElement('th', null, t('colPhase')),
                  ),
                ),
                React.createElement('tbody', null,
                  ...pluginRows.map((row) =>
                    React.createElement('tr', { key: row.entryId },
                      React.createElement('td', null, row.entryId),
                      React.createElement('td', null, row.moduleName),
                      React.createElement('td', null, row.version ?? t('versionNull')),
                      React.createElement('td', null, row.enabled ? t('enabledYes') : t('enabledNo')),
                      React.createElement('td', {
                        className: 'dshAbout_phase',
                        'data-phase': row.fiberPhase ?? '',
                      }, row.fiberPhase ?? t('phaseNull')),
                    ),
                  ),
                ),
              ),
            ),
        ),
        linkRows.length > 0
          ? React.createElement(React.Fragment, null,
            React.createElement('h3', { className: 'dshAbout_subtitle' }, t('links')),
            React.createElement('ul', { className: 'dshAbout_links' },
              ...linkRows.map((link) =>
                React.createElement('li', { key: link.url },
                  React.createElement('a', { href: link.url, target: '_blank', rel: 'noreferrer' }, link.label),
                  React.createElement('span', { className: 'dshAbout_hint' }, ` — ${link.url}`),
                ),
              ),
            ),
          )
          : null,
        noteRows.length > 0
          ? React.createElement(React.Fragment, null,
            React.createElement('h3', { className: 'dshAbout_subtitle' }, t('notes')),
            React.createElement('ul', { className: 'dshAbout_notes' },
              ...noteRows.map((note, index) =>
                React.createElement('li', { key: String(index) }, note),
              ),
            ),
          )
          : null,
        React.createElement('div', { className: 'dshAbout_actions' },
          React.createElement('button', { type: 'button', onClick: () => void onCopy() }, t('copy')),
          copyState === 'copied'
            ? React.createElement('span', { className: 'dshAbout_hint' }, t('copied'))
            : copyState === 'failed'
              ? React.createElement('span', { className: 'dshAbout_hint' }, t('copyFailed'))
              : null,
        ),
      )
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-settings-about: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'about',
            order: 100,
            label: () => t('nav'),
            locale: NS,
            inject: () => ({ t }),
          },
          AboutSection,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
