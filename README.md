# artifact-catalog

A Claude Code mod that keeps your Claude artifacts from getting lost.

Each time Claude publishes a **new** artifact, a row appears above the prompt once the turn ends:

```
New artifact "Q3 pricing review" — add it to your catalogue?   [Add]  [Skip]
```

Press **Add** and Claude files it:

- picks a category from your list and writes a one-line summary,
- adds a row to your **Notion database** (optional),
- adds an entry to your **index artifact**, a pinned page that lists everything by category (optional),
- renames the artifact to `Category｜Title` (optional).

Redeploys, edits of an existing artifact and the index page itself are never offered. Claude Docs documents count too, whether they were made through the Artifact tool or the Claude Docs connector.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install artifact-catalog --marketplace amsyeung/artifact-catalog
```

Answer `y` to add the marketplace, then pick a scope (user scope is the usual choice). The install screen asks for the options below; all of them can stay empty and be set later.

Tested with Claude Code 2.1.295. The mod needs a build that runs hooks modules (mods).

## Options

| Option | What it does | Default |
| --- | --- | --- |
| `notionDatabase` | URL of a Notion database to add a row to. Needs the Notion connector in claude.ai. | empty (skip) |
| `indexArtifact` | URL of your index artifact (see below). | empty (skip) |
| `categories` | Comma-separated categories Claude picks from. | `Work, Clients, Personal, Other` |
| `prefixTitles` | Rename the artifact to `Category｜Title`. | `true` |
| `language` | Language of the prompt row and of Claude's reply: `en`, `zh-Hant`, `zh-Hans`, `ja`, `ko`. | `en` |

With neither `notionDatabase` nor `indexArtifact` set, pressing **Add** makes Claude ask where you want artifacts filed.

Change options in `/config`, or in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "artifact-catalog": {
      "options": {
        "indexArtifact": "https://claude.ai/artifact/…",
        "categories": "Work, Clients, YouTube, Side projects, Other",
        "language": "en"
      }
    }
  }
}
```

## Setting up the catalogue

### Index artifact (recommended)

[`templates/index.html`](templates/index.html) is a ready-made index page. It reads its entries from the artifact's own database, so new entries appear without republishing the page. Ask Claude:

> Publish templates/index.html from github.com/amsyeung/artifact-catalog as a new artifact with the `db` capability, and pin it.

Put the URL it gives you into `indexArtifact`. To fix the order of your categories on the page, list them in the `ORDER` array near the bottom of the template before publishing.

### Notion database (optional)

Any database with a title column works. Claude fills whichever columns fit, so these are a good start:

| Column | Type |
| --- | --- |
| Name | Title |
| Category | Select (same values as `categories`) |
| Summary | Text |
| Link | URL |
| Updated | Date |

Put the database URL into `notionDatabase`.

## How it works

- A `tool.call` hook watches the Artifact tool. A publish counts as new when it has no `url` and the result says *Version 1*, or when it creates an artifact from a type.
- A second hook watches the Claude Docs connector's `batch` calls that create a document.
- New artifacts wait in session state. When Claude isn't working, an `AbovePrompt` band shows the oldest one.
- **Add** sends Claude a prompt that names only the destinations you configured. **Skip** drops it.

Nothing leaves your machine except what Claude itself writes to Notion or to your artifact when you press **Add**.

## Develop

```
claude plugin validate .
claude plugin test .
```

The tests cover the terminal and desktop surfaces. To try local changes in a session, start Claude Code with `claude --plugin-dir <this folder>`.

## License

MIT
