#!/usr/bin/env node

import { extractTranslations } from '../lib/translation/extract.mjs'
import meow from 'meow'
import path from 'path'
import { pathToFileURL } from 'url'

const cli = meow(
	`
	Tool to extract translations from the TypeScript sourcecode, and associated json schemas

	Usage
		$ blueprint-extract-versions <config-file>

	Examples
		$ blueprint-extract-versions ./blueprint-map.mjs
`,
	{
		importMeta: import.meta,
	}
)

const mapFilePath = cli.input[0]

if (!mapFilePath) {
	cli.showHelp()
	process.exit(1)
}

const absolutePath = path.resolve(process.cwd(), mapFilePath)
const mapFile = await import(absolutePath)
if (!mapFile) {
	console.error(`Failed to load map file: ${absolutePath}`)
	process.exit(1)
}

if (!mapFile.BlueprintEntrypoints) {
	console.error(`Map file does not contain BlueprintEntrypoints: ${mapFilePath}`)
	process.exit(1)
}

await extractTranslations(mapFile.BlueprintEntrypoints)
