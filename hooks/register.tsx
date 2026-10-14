import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pending } from '../types'

const pending = atom({ plugin: 'artifact-catalog', key: 'pending' } as const, [] as Pending[])

const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/
const TITLE_TAG = /<title>([^<]{1,200})<\/title>/i

const TEXT = {
  en: {
    ask: (title: string) => `New artifact "${title}" — add it to your catalogue?`,
    more: (n: number) => ` (+${n} more)`,
    add: 'Add',
    skip: 'Skip',
    reply: 'English',
  },
  'zh-Hant': {
    ask: (title: string) => `新 artifact「${title}」— 收錄到目錄？`,
    more: (n: number) => `（另有 ${n} 個）`,
    add: '收錄',
    skip: '略過',
    reply: 'Traditional Chinese',
  },
  'zh-Hans': {
    ask: (title: string) => `新 artifact「${title}」— 收录到目录？`,
    more: (n: number) => `（另有 ${n} 个）`,
    add: '收录',
    skip: '跳过',
    reply: 'Simplified Chinese',
  },
  ja: {
    ask: (title: string) => `新しい artifact「${title}」— カタログに追加しますか？`,
    more: (n: number) => `（ほか ${n} 件）`,
    add: '追加',
    skip: 'スキップ',
    reply: 'Japanese',
  },
  ko: {
    ask: (title: string) => `새 artifact "${title}" — 카탈로그에 추가할까요?`,
    more: (n: number) => ` (외 ${n}개)`,
    add: '추가',
    skip: '건너뛰기',
    reply: 'Korean',
  },
} as const

type Language = keyof typeof TEXT
const isLanguage = (value: unknown): value is Language => typeof value === 'string' && value in TEXT

type Options = {
  notionDatabase: string
  indexArtifact: string
  categories: string
  prefixTitles: boolean
  language: Language
}

/** The last path segment of an artifact link: its id, the same in /artifact/ and /code/artifact/ links. */
const artifactId = (url: string) => url.replace(/[?#].*$/, '').split('/').pop() ?? ''

const basename = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.[a-z]+$/i, '') ?? path

/** What Claude is asked to do once the person presses Add. Only the destinations they configured. */
export function filingPrompt(item: Pending, o: Options): string {
  const steps: string[] = []
  const id = artifactId(item.url)

  if (o.notionDatabase) {
    steps.push(
      `Add a row to the Notion database ${o.notionDatabase}: its title is the artifact's title, ` +
        `plus the category, a one-line summary, the link and today's date in whichever of its columns fit.`,
    )
  }
  if (o.indexArtifact) {
    steps.push(
      `Add a document to the "artifacts" collection of the index artifact ${o.indexArtifact} ` +
        `(ArtifactData set, doc_id "${id}") with fields title, category, kind ("${item.kind}"), summary, url and updated (today, YYYY-MM-DD).`,
    )
  }
  if (o.prefixTitles) {
    steps.push(`Rename the artifact to "<category>｜<title>" (a Claude Docs document is renamed through the Claude Docs connector).`)
  }
  if (!o.notionDatabase && !o.indexArtifact) {
    steps.push(`No catalogue is configured yet: ask me where artifacts should be filed.`)
  }

  return [
    `File this new artifact in my catalogue.`,
    `- Title: ${item.title}`,
    `- Link: ${item.url}`,
    `Pick its category from: ${o.categories}. Read the artifact if the title alone doesn't tell you. Then:`,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    `Reply in ${TEXT[o.language].reply}, in one or two lines.`,
  ].join('\n')
}

/** Queues an artifact for the band, once per artifact, never the index artifact itself. */
async function remember($: EngineInterface, item: Pending, indexId: string) {
  if (artifactId(item.url) === indexId) return
  await update($, pending, (list) =>
    list.some((p) => artifactId(p.url) === artifactId(item.url)) ? list : [...list, item],
  )
}

export const register: Register = (on, options) => {
  const o: Options = {
    notionDatabase: String(options.notionDatabase ?? '').trim(),
    indexArtifact: String(options.indexArtifact ?? '').trim(),
    categories: String(options.categories ?? 'Work, Clients, Personal, Other'),
    prefixTitles: options.prefixTitles !== false,
    language: isLanguage(options.language) ? options.language : 'en',
  }
  const t = TEXT[o.language]
  const indexId = o.indexArtifact ? artifactId(o.indexArtifact) : ''


  // A page or a typed artifact (Docs, Slides…) published through the Artifact tool.
  on('tool.call', { tool: 'Artifact' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const isPublish = (e.action ?? 'publish') === 'publish' && !e.url && !e.asset
    const text = ran.text ?? ''
    const url = text.match(ARTIFACT_URL)?.[0]
    // A redeploy of a file published earlier also has no `url`; only version 1 is new.
    const isNew = e.type_url !== undefined || /\(Version 1[,)]/.test(text)
    if (!isPublish || !url || !isNew) return ran

    let title = e.title ?? (e.file_path ? basename(e.file_path) : 'Untitled')
    if (e.file_path && !e.title) {
      try {
        const html = await $.fs.read(e.file_path)
        title = html.slice(0, 8192).match(TITLE_TAG)?.[1]?.trim() || title
      } catch {
        // The file can be gone by now; the basename will do.
      }
    }
    await remember($, { url, title, kind: e.type_url ? 'doc' : 'page' }, indexId)
    return ran
  })

  // A Claude Docs document born through the Docs connector's `batch` (container.create).
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!/^mcp__.+__batch$/.test(e.tool) || ran.deny !== undefined || ran.isError) return ran

    const create = (e as unknown as { container?: { create?: { name?: unknown } } }).container?.create
    const url = (ran.text ?? '').match(ARTIFACT_URL)?.[0]
    if (!create || !url) return ran

    await remember($, { url, title: typeof create.name === 'string' ? create.name : 'Untitled', kind: 'doc' }, indexId)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, pending)
    const item = list[0]
    if (e.props.hasSurvey || e.props.isWorking || !item) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const drop = () => update($, pending, (l) => l.filter((p) => p.url !== item.url))

    return (
      <Box>
        <Text>
          {t.ask(item.title)}
          {list.length > 1 ? t.more(list.length - 1) : ''}{' '}
        </Text>
        <Button
          key="add"
          label={t.add}
          onPress={async () => {
            await drop()
            await $.prompt.submit({ text: filingPrompt(item, o) })
          }}
        />
        <Text> </Text>
        <Button key="skip" label={t.skip} onPress={drop} />
      </Box>
    )
  })
}
