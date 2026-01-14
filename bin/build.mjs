#!/usr/bin/env node

// @ts-check

import meow from 'meow'
import path from 'path'
import { rollup, watch as rollupWatch } from 'rollup'
import { RollupConfigFactory } from '../lib/rollup/configFactory.mjs'

const cli = meow(
	`
	Tool to build blueprints into a Sofie compatible bundle

	Usage
		$ blueprint-build <config-file> <dist-dir>

	Options
		--server          Server to upload to
		--development     Development mode. Uses a dev version number and instructs sofie to auto-apply config changes
		--watch, -w       Watch for changes and rebuild
		--bundle          Bundle to build, or "all" for all bundles (default: "all")
		--header          Additional headers to add to the upload, can be set multiple times (E.G. --header=clientId:myClient --header=api-key:mySecretKey)

	Examples
		$ blueprint-build ./blueprint-map.mjs ./dist
		$ blueprint-build ./blueprint-map.mjs ./dist --watch --development --header=api-key:mySecretKey
		$ blueprint-build ./blueprint-map.mjs ./dist --bundle=core
`,
	{
		importMeta: import.meta,
		flags: {
			server: {
				type: 'string',
				default: '',
				description: 'Server to upload to',
			},
			development: {
				type: 'boolean',
				default: false,
				description: 'Development mode',
			},
			watch: {
				type: 'boolean',
				default: false,
				shortFlag: 'w',
				description: 'Watch for changes and rebuild',
			},
			bundle: {
				type: 'string',
				default: 'all',
				description: 'Bundle to build, or "all" for all bundles',
			},
			headers: {
				type: 'string',
				isMultiple: true,
				default: [],
			}
		},
	}
)

const mapFilePath = cli.input[0]
const distDirPath = cli.input[1]
const watch = cli.flags.watch
const development = cli.flags.development

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

const rollupConfig = await RollupConfigFactory(sources, distDir, cli.flags.server, development, cli.flags.headers)
console.log(`Found ${rollupConfig.length} sources to build`)

if (watch) {
	// Start the watcher, this will keep running in the background
	rollupWatch(rollupConfig)
} else {
	await Promise.all(rollupConfig.map((conf) => rollup(conf).then((bundle) => bundle.write(conf.output))))
}
