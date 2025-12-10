#!/usr/bin/env node

// @ts-check

import meow from 'meow'
import path from 'path'
import { readFile, writeFile } from 'fs/promises'

const cli = meow(
	`
	Tool to bundle built blueprints into a json bundle for easier bulk uploading

	Usage
		$ blueprint-bundle <config-file> <dist-dir>

	Options
		--bundle           Bundle name to process, or "all" for all bundles (default: "all")

	Examples
		$ blueprint-bundle ./blueprint-map.mjs ./dist/
		$ blueprint-bundle ./blueprint-map.mjs ./dist/ -b core
`,
	{
		importMeta: import.meta,
		flags: {
			bundle: {
				type: 'string',
				default: 'all',
				description: 'Bundle name to process, or "all" for all bundles',
			},
		},
	}
)

const mapFilePath = cli.input[0]
const distDirPath = cli.input[1]

if (!mapFilePath || !distDirPath) {
	cli.showHelp()
	process.exit(1)
}

const distDir = path.resolve(process.cwd(), distDirPath)
let mapFilePathAbs = path.resolve(process.cwd(), mapFilePath)
if (process.platform === 'win32') mapFilePathAbs = 'file://' + mapFilePathAbs // On Windows, absolute paths must be valid file:// URLs
const mapFile = await import(mapFilePathAbs)

// Determine the blueprints that are being built
let sources = mapFile.BlueprintEntrypoints
if (cli.flags.bundle !== 'all') {
	const bundle = mapFile.BlueprintBundles[cli.flags.bundle]
	if (!bundle) {
		throw new Error(`Bundle ${cli.flags.bundle} not found`)
	}

	sources = {}
	for (const name of bundle) {
		if (mapFile.BlueprintEntrypoints[name]) {
			sources[name] = mapFile.BlueprintEntrypoints[name]
		} else {
			throw new Error(`Entrypoint ${name} not found`)
		}
	}
}

const blueprints = {
	blueprints: {},
	assets: {},
}

for (const name of Object.keys(sources)) {
	const [jsFile, assetFile] = await Promise.all([
		readFile(path.join(distDir, `${name}-bundle.js`), 'utf8'),
		readFile(path.join(distDir, `${name}-assets.json`), 'utf8').catch((e) => {
			if (e.code !== 'ENOENT') {
				throw e
			}
			return null
		}),
	])

	blueprints.blueprints[name] = jsFile
	if (assetFile) {
		Object.assign(blueprints.assets, JSON.parse(assetFile))
	}
}

const manifestStr = JSON.stringify(blueprints, undefined, 4)
await writeFile(`dist/bundle${cli.flags.bundle !== 'all' ? '-' + cli.flags.bundle : ''}.json`, manifestStr)
