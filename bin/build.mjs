#!/usr/bin/env node

// @ts-check

import meow from 'meow'
import path from 'path'
import { fileURLToPath } from 'url'
import { rollup, watch as rollupWatch } from 'rollup'
import { RollupConfigFactory } from '../lib/rollup/configFactory.mjs'

const cli = meow(
	`
	Tool to build blueprints into a Sofie compatible bundle

	Usage
		$ blueprint-build <config-file>

	Examples
		$ blueprint-build ./blueprint-map.mjs
`,
	{
		importMeta: import.meta,
		flags: {
			server: {
				type: 'string',
				default: '',
				// alias: 's',
				description: 'Server to upload to',
			},
			development: {
				type: 'boolean',
				default: false,
				// alias: 'd',
				description: 'Development mode',
			},
			watch: {
				type: 'boolean',
				default: false,
				// alias: 'w',
				description: 'Watch for changes and rebuild',
			},
		},
	}
)

const mapFilePath = cli.input[0]
const watch = cli.flags.watch
const development = cli.flags.development

if (!mapFilePath) {
	cli.showHelp()
	process.exit(1)
}

const absolutePath = path.resolve(process.cwd(), mapFilePath)
const mapFile = await import(absolutePath)

// Determine the blueprints that are being built
let sources = mapFile.BlueprintEntrypoints
if (process.env.bundle && process.env.bundle !== 'all') {
	const bundle = mapFile.BlueprintBundles[process.env.bundle]
	if (bundle) {
		throw new Error(`Bundle ${process.env.bundle} not found`)
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

// const __dirname = fileURLToPath(new URL('.', import.meta.url))
// const rollupConfigPath = path.join(__dirname, '../lib/rollup/rollup.config.mjs')

// await concurrently([
// 	{
// 		name: 'build',
// 		command: ['rollup', '-c', `"${rollupConfigPath}"`, '--config-server=http://localhost:3000'].join(' '),
// 		cwd: process.cwd(),
// 	},
// ]).result

const rollupConfig = await RollupConfigFactory(sources, cli.flags.server, development)
console.log(`Found ${rollupConfig.length} sources to build`)

if (watch) {
	// Start the watcher, this will keep running in the background
	rollupWatch(rollupConfig)
} else {
	await Promise.all(rollupConfig.map(rollup))
}
