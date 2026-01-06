import alias from '@rollup/plugin-alias'
import ts from 'typescript'
import path from 'node:path'
import fs from 'node:fs'

function escapeRegExp(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Reimplement a tsconfig-paths plugin for rollup, so that image assets follow the tsconfig paths.
 *
 */
export function tsconfigPathsPlugin() {
	const tsconfigPath = path.join(process.cwd(), 'tsconfig.json')

	if (!fs.existsSync(tsconfigPath)) return null

	const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
	if (read.error) return null

	const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(tsconfigPath))
	const baseUrl = parsed.options.baseUrl || '.'
	const paths = parsed.options.paths || {}

	const absBase = path.resolve(path.dirname(tsconfigPath), baseUrl)

	const entries = []
	for (const [key, targets] of Object.entries(paths)) {
		if (!targets || !targets[0]) continue
		const keyIsWildcard = key.endsWith('/*')
		const target = targets[0]
		const targetIsWildcard = target.endsWith('/*')
		const cleanedKey = keyIsWildcard ? key.slice(0, -2) : key
		const cleanedTarget = targetIsWildcard ? target.slice(0, -2) : target
		const replacementBase = path.join(absBase, cleanedTarget)

		if (keyIsWildcard) {
			entries.push({
				// match imports like '@foo/bar' -> '@foo/(.*)'
				find: new RegExp('^' + escapeRegExp(cleanedKey) + '/(.*)$'),
				replacement: replacementBase + '/$1',
			})
		} else {
			entries.push({
				find: cleanedKey,
				replacement: replacementBase,
			})
		}
	}

	if (entries.length === 0) return null

	return alias({ entries })
}
