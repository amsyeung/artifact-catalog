/** A newly published artifact waiting for the person to file it or skip it. */
export type Pending = { url: string; title: string; kind: "page" | "doc" }

declare module 'claude-code' {
  interface PluginState {
    'artifact-catalog': { pending: Pending[] }
  }
}
