/**
 * planning-pane — Hermes desktop plugin
 * Wraps the planning-with-files skill as:
 *   - a routable page at /planning  (the callable surface: ⌘K → "planning")
 *   - an optional right-side pane  (draggable companion)
 *   - a status-bar chip            (presence indicator)
 *
 * Reads task_plan.md / findings.md / progress.md from the workspace cwd
 * and exposes the skill's init / check-complete / attest scripts as buttons.
 *
 * Disk plugin:  ~/.hermes/desktop-plugins/planning-pane/plugin.js
 * Backend:      ~/.hermes/plugins/planning-pane/dashboard/plugin_api.py
 */
import { host, haptic, usePluginI18n, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Textarea, Badge, Tip,
  cn, Codicon, ROUTES_AREA, PANES_AREA, STATUSBAR_AREAS, PALETTE_AREA
} from '@hermes/plugin-sdk'

const ID = 'planning-pane'
let pluginCtx = null

function PlanPage() {
  const t = usePluginI18n(ID)
  const cwd = useValue(host.state.cwd)
  const [active, setActive] = useState('task_plan')
  const [files, setFiles] = useState({ task_plan: '', findings: '', progress: '' })
  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState(null)

  const load = useCallback(async (manual) => {
    if (!cwd) return
    setLoading(true); setActionMsg(null)
    try {
      // dir in the query too, so a build that sends this as GET still resolves.
      const r = await pluginCtx.rest('/files?dir=' + encodeURIComponent(cwd), { method: 'POST', body: { dir: cwd } })
      setFiles((r && typeof r === 'object') ? r : { task_plan: '', findings: '', progress: '' })
    } catch (e) {
      // Auto-load runs on every chat switch: never toast from it, only log.
      if (manual === true) host.notify({ kind: 'error', message: t('loadError', { err: String(e) }) })
      else console.warn('[planning-pane] load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [cwd, t])

  useEffect(() => { load() }, [load])

  const run = async (path, body, msgKey) => {
    if (!cwd) return
    setLoading(true); setActionMsg(null)
    try {
      const result = await pluginCtx.rest('/' + path, { method: 'POST', body: { dir: cwd, ...body } })
      if (result?.ok === false) throw new Error(result.error || result.err || 'Planning action failed')
      await load()
      setActionMsg(msgKey)
      setTimeout(() => setActionMsg(null), 3000)
    } catch (e) {
      host.notify({ kind: 'error', message: t('actionError', { err: String(e) }) })
    } finally {
      setLoading(false)
    }
  }

  const tabs = {
    task_plan:  { label: 'Plan' },
    findings:   { label: 'Findings' },
    progress:   { label: 'Progress' },
  }
  const content = files[active] || ''

  return jsxs('div', {
    className: 'flex h-full min-h-0 w-full flex-col gap-2 p-3 text-sm',
    children: [
      // header
      jsxs('div', { className: 'flex items-center justify-between gap-2', children: [
        jsx('div', { className: 'flex items-center gap-2', children: [
          jsx('span', { className: 'text-lg', children: '📋' }),
          jsx('span', { className: 'font-medium text-(--ui-text-primary)', children: t('pageTitle') }),
        ]}),
        jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => load(true), disabled: loading, children: loading ? t('loading') : t('refresh') }),
      ]}),

      // tabs
      jsx('div', { className: 'flex gap-1', children: Object.entries(tabs).map(([key, { label }]) =>
        jsx(Button, {
          key, size: 'sm', variant: active === key ? 'secondary' : 'ghost',
          onClick: () => { setActive(key); setActionMsg(null) },
          children: label,
        })
      )}),

      // body
      loading
        ? jsx('div', { className: 'flex-1 flex items-center justify-center text-(--ui-text-tertiary)', children: t('loading') })
        : content
            ? jsx(Textarea, {
                value: content, readOnly: true,
                className: 'w-full flex-1 min-h-0 resize-none overflow-auto rounded border bg-(--chrome-base-background) p-3 text-sm leading-relaxed text-(--ui-text-primary) focus:outline-none',
                spellCheck: false,
              })
            : jsx('div', { className: 'flex-1 flex flex-col items-center justify-center gap-2 text-(--ui-text-tertiary)', children: [
                jsx('span', { className: 'text-3xl', children: '📄' }),
                jsx('div', { children: t('noFiles') }),
                jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => run('init', {}, 'initDone'), children: t('createPlan') }),
              ]}),

      // action bar
      jsx('div', { className: 'flex items-center gap-2 pt-2 border-t', children: [
        jsxs(Button, { variant: 'secondary', size: 'sm', onClick: () => run('init', {}, 'initDone'), disabled: loading, children: [
          jsx('span', { className: 'codicon codicon-plus', style: { marginRight: 6 } }),
          t('initSession'),
        ]}),
        jsxs(Button, { variant: 'ghost', size: 'sm', onClick: () => run('check', {}, 'checkDone'), disabled: loading, children: [
          jsx('span', { className: 'codicon codicon-check', style: { marginRight: 6 } }),
          t('check'),
        ]}),
        jsxs(Button, { variant: 'ghost', size: 'sm', onClick: () => run('attest', {}, 'attestDone'), disabled: loading, children: t('attest') }),
        actionMsg ? jsx(Badge, { variant: 'default', children: t(actionMsg) }) : null,
      ]}),
    ]
  })
}

function PlanPane() {
  // Same component, narrower — the draggable right-side companion.
  return jsx(PlanPage, {})
}

function PlanChip() {
  const cwd = useValue(host.state.cwd)
  const t = usePluginI18n(ID)

  return jsx(Tip, {
    label: t('chipLabel'),
    children: jsx('button', {
      type: 'button',
      className: cn(
        'inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem] transition-colors',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      ),
      onClick: () => {
        haptic('tap')
        host.notify({ kind: 'info', message: t('chipTip', { dir: cwd ? cwd.split('/').pop() || cwd : 'no workspace' }) })
      },
      children: '📋 plan',
    })
  })
}

export default {
  id: ID,
  name: 'Planning Pane',
  defaultEnabled: true,
  register(ctx) {
    pluginCtx = ctx
    ctx.i18n.register({
      en: {
        pageTitle: 'Planning',
        chipLabel: 'Planning pane',
        chipTip: ({ dir }) => `Planning files in ${dir}`,
        refresh: 'Refresh',
        loading: 'Loading…',
        noFiles: 'No planning files yet. Click + to create them.',
        createPlan: 'Create planning files',
        initSession: 'New session',
        check: 'Check',
        attest: 'Attest',
        initDone: 'Initialized',
        checkDone: 'Check done',
        attestDone: 'Attested',
        loadError: ({ err }) => `Load failed: ${err}`,
        actionError: ({ err }) => `Action failed: ${err}`,
      }
    })

    // ROUTABLE PAGE — the main callable surface.
    ctx.register({
      id: 'page',
      area: ROUTES_AREA,
      title: 'Planning',
      data: { path: '/planning' },
      render: () => jsx(PlanPage, {}),
    })

    // OPTIONAL SIDEBAR PANE — user can dock it if they want a permanent view.
    ctx.register({
      id: 'pane',
      area: PANES_AREA,
      title: 'Planning',
      data: { placement: 'right', width: '320px' },
      render: () => jsx(PlanPane, {}),
    })

    // STATUS-BAR CHIP — presence indicator + click hint.
    ctx.register({
      id: 'chip',
      area: STATUSBAR_AREAS.right,
      order: 140,
      render: () => jsx(PlanChip, {}),
    })

    // PALETTE COMMAND — ⌘K → "planning".
    ctx.register({
      id: 'open',
      area: PALETTE_AREA,
      data: {
        id: 'planning.open',
        label: 'Open Planning',
        keywords: ['plan', 'planning', 'task'],
        run: () => host.navigate('/planning'),
      }
    })
  }
}
