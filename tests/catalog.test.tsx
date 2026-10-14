import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const OPTIONS = {
  notionDatabase: 'https://app.notion.com/p/catalogue',
  indexArtifact: 'https://claude.ai/artifact/INDEX0000000000000000a',
  categories: '公司, 客戶, 其他',
  language: 'zh-Hant',
}

// The engine's own band beneath the plugin: an empty row.
const quietBand = (on: On) =>
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

const published = (url: string, version: number) =>
  `Published report.html at ${url} (Version ${version}, version id 1-ab) Icon: "chart".`

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a new artifact is offered, and Add asks Claude to file it`, { options: OPTIONS }, async ($, on) => {
    quietBand(on)
    on('tool.call', { tool: 'Artifact' }, () => ({
      result: {} as never,
      text: published('https://claude.ai/artifact/NEWPAGE000000000000000a', 1),
    }))
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })

    await $.tool.call({ tool: 'Artifact', file_path: 'report.html', title: 'Q3 報告', icon: 'chart' })

    const ui = await $.ui.mount({ plugin: 'artifact-catalog', surface, component: 'AbovePrompt', props: BAND })
    expect(JSON.stringify(await ui.drawn())).toContain('Q3 報告')
    expect((await ui.find({ key: 'add' }))?.text).toBe('收錄')

    await ui.press({ key: 'add' })
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toContain('https://claude.ai/artifact/NEWPAGE000000000000000a')
    expect(submitted[0]).toContain('https://app.notion.com/p/catalogue')
    expect(submitted[0]).toContain('doc_id "NEWPAGE000000000000000a"')
    expect(submitted[0]).toContain('公司, 客戶, 其他')

    await ui.redraw(BAND)
    expect(await ui.find({ key: 'add' })).toBeUndefined()
  })

  test(`${surface}: redeploys, updates and the index itself are not offered`, { options: OPTIONS }, async ($, on) => {
    quietBand(on)
    on('tool.call', { tool: 'Artifact' }, (_$, e) => ({
      result: {} as never,
      text: e.url
        ? published(e.url, 3)
        : e.file_path === 'index.html'
          ? published(OPTIONS.indexArtifact, 1)
          : published('https://claude.ai/artifact/OLDPAGE000000000000000a', 2),
    }))

    await $.tool.call({ tool: 'Artifact', file_path: 'report.html' })
    await $.tool.call({ tool: 'Artifact', file_path: 'report.html', url: 'https://claude.ai/artifact/OLDPAGE000000000000000a' })
    await $.tool.call({ tool: 'Artifact', file_path: 'index.html' })

    const ui = await $.ui.mount({ plugin: 'artifact-catalog', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ key: 'add' })).toBeUndefined()
  })

  test(`${surface}: Skip clears the offer without a prompt`, { options: OPTIONS }, async ($, on) => {
    quietBand(on)
    on('tool.call', { tool: 'Artifact' }, () => ({
      result: {} as never,
      text: published('https://claude.ai/artifact/SKIPPED00000000000000a', 1),
    }))
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })

    await $.tool.call({ tool: 'Artifact', file_path: 'notes.html' })
    const ui = await $.ui.mount({ plugin: 'artifact-catalog', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ key: 'skip' })).toBeDefined()

    await ui.press({ key: 'skip' })
    await ui.redraw(BAND)
    expect(await ui.find({ key: 'add' })).toBeUndefined()
    expect(submitted).toHaveLength(0)
  })

  test(`${surface}: nothing shows while a turn is running`, { options: OPTIONS }, async ($, on) => {
    quietBand(on)
    on('tool.call', { tool: 'Artifact' }, () => ({
      result: {} as never,
      text: published('https://claude.ai/artifact/BUSYPAGE0000000000000a', 1),
    }))
    await $.tool.call({ tool: 'Artifact', file_path: 'busy.html' })

    const ui = await $.ui.mount({
      plugin: 'artifact-catalog',
      surface,
      component: 'AbovePrompt',
      props: { ...BAND, isWorking: true },
    })
    expect(await ui.find({ key: 'add' })).toBeUndefined()
  })

  test(`${surface}: a Claude Docs document made through the connector is offered as a doc`, { options: OPTIONS }, async ($, on) => {
    quietBand(on)
    on('tool.call', () => ({
      result: {} as never,
      text: 'created.bound:true — https://claude.ai/artifact/DOCDOC000000000000000a',
    }))
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })

    await $.tool.call({ tool: 'mcp__docs__batch', container: { kind: 'project', create: { name: '季度計劃' } }, batch: [] } as never)

    const ui = await $.ui.mount({ plugin: 'artifact-catalog', surface, component: 'AbovePrompt', props: BAND })
    expect(JSON.stringify(await ui.drawn())).toContain('季度計劃')
    await ui.press({ key: 'add' })
    expect(submitted[0]).toContain('kind ("doc")')
  })

  test(`${surface}: the band and the reply follow the language option`, { options: { language: 'ja' } }, async ($, on) => {
    quietBand(on)
    on('tool.call', { tool: 'Artifact' }, () => ({
      result: {} as never,
      text: published('https://claude.ai/artifact/JAPAGE00000000000000000a', 1),
    }))
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })

    await $.tool.call({ tool: 'Artifact', file_path: 'plan.html' })
    const ui = await $.ui.mount({ plugin: 'artifact-catalog', surface, component: 'AbovePrompt', props: BAND })
    expect((await ui.find({ key: 'add' }))?.text).toBe('追加')

    await ui.press({ key: 'add' })
    expect(submitted[0]).toContain('Reply in Japanese')
    expect(submitted[0]).toContain('ask me where artifacts should be filed')
  })
}
