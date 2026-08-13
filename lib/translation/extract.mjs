/**
 * Extract translation keys from blueprint source (t() calls and JSON schema ui:* strings).
 * Writes .po files under locales/{lang}/{entrypoint}.po, preserving existing translations.
 */
/* eslint-disable */
import * as path from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import * as stream from 'stream'
import { pipeline } from 'stream/promises'
import vfs from 'vinyl-fs'
import { transform as i18nTransform } from 'i18next-parser'
import { i18nextToPo, gettextToI18next } from 'i18next-conv'

import { conversionOptions, extractOptions } from './config.mjs'
import { resolveAllEntrypointModules } from './resolve-entrypoint-modules.mjs'

function resolveLocales(blueprintMap) {
	if (blueprintMap.BlueprintTranslationLocales?.length) return blueprintMap.BlueprintTranslationLocales
	return extractOptions.locales
}

function resolveSourceGlobs(entryPointName, sourcePath, scanPaths) {
	if (scanPaths[entryPointName]?.length) {
		return scanPaths[entryPointName]
	}

	// Legacy layout: only the entrypoint directory (TypeScript only).
	const entryPointRoot = path.parse(sourcePath).dir.split(path.sep).join('/')
	return [`${entryPointRoot}/**/*.ts`]
}

class JsonToPoTransform extends stream.Transform {
	constructor() {
		super({ objectMode: true })
	}

	_transform(file, encoding, callback) {
		const language = file.dirname.split(/[/|\\]/).pop()

		i18nextToPo(
			language,
			file.contents.toString(),
			Object.assign({}, conversionOptions, {
				language,
				skipUntranslated: false, // when extracting no keys will have translations yet :)
			})
		)
			.then((poContent) => {
				file.contents = Buffer.from(poContent)
				file.extname = '.po'

				callback(null, file)
			})
			.catch(callback)
	}
}

class MergeExistingTranslationsTransform extends stream.Transform {
	constructor(statsCallback) {
		super({ objectMode: true })
		this.statsCallback = statsCallback
	}

	_transform(file, encoding, callback) {
		const poPath = path.format({
			dir: file.dirname,
			name: file.stem,
			ext: '.po',
		})

		readFile(poPath, 'utf-8')
			.then(
				(existingFile) => existingFile,
				() => null
			)
			.then((existingFile) => {
				if (!existingFile) {
					return null
				}

				const language = file.dirname.split(/[/|\\]/).pop()
				return gettextToI18next(
					language,
					existingFile,
					Object.assign({}, conversionOptions, {
						language,
						// Keys with no value will fall back to default bundle, and eventually the key itself will
						// be used as value if no values are found. Since we use the string as key, this means
						// untranslated keys will be represented by their original (English) text. This is not great
						// but better than inserting empty strings everywhere.
						skipUntranslated: true,
					})
				)
			})
			.then((existingTranslations) => {
				if (existingTranslations) {
					existingTranslations = JSON.parse(existingTranslations)
				}

				const language = file.dirname.split(/[/|\\]/).pop()
				const currentKeys = Object.keys(JSON.parse(file.contents.toString()))
				const keysExtracted = currentKeys.length

				if (!existingTranslations) {
					this.statsCallback({
						keysExtracted,
						language,
						keysMerged: 0,
						keysRemoved: 0,
					})
					return callback(null, file)
				}

				const existingTranslationKeyCount = Object.keys(existingTranslations).length
				let keysMerged = 0

				const mergedTranslations = {}

				for (const key of currentKeys) {
					const existingValue = existingTranslations[key]
					if (existingValue) {
						mergedTranslations[key] = existingValue
						keysMerged++
					} else {
						mergedTranslations[key] = ''
					}
				}
				file.contents = Buffer.from(JSON.stringify(mergedTranslations))

				this.statsCallback({
					keysExtracted,
					language,
					keysMerged,
					keysRemoved: existingTranslationKeyCount - keysMerged,
				})
				return callback(null, file)
			})
			.catch((err) => {
				callback(err)
			})
	}
}

/** Remove stale keys when a namespace no longer has any translatable strings. */
async function clearNamespacePoFiles(entryPointName, locales) {
	for (const language of locales) {
		const poDir = path.join('locales', language)
		await mkdir(poDir, { recursive: true })
		const poPath = path.join(poDir, `${entryPointName}.po`)
		const poContent = await i18nextToPo(
			language,
			'{}',
			Object.assign({}, conversionOptions, { language, skipUntranslated: false })
		)
		await writeFile(poPath, poContent)
	}
	console.info(`\tCleared stale ${entryPointName}.po files`)
}

async function extractFromSources(entryPointName, sourceFilesOrGlobs, parserOptions, { useFileList = false } = {}) {
	const start = Date.now()
	if (useFileList) {
		console.info(`\nExtracting keys for ${entryPointName} from ${sourceFilesOrGlobs.length} reachable files`)
	} else {
		console.info(`\nExtracting keys for ${entryPointName} from:`)
		for (const glob of sourceFilesOrGlobs) {
			console.info(`  ${glob}`)
		}
	}

	let extractionStats = { keysExtracted: 0, locales: [] }

	await pipeline(
		vfs.src(sourceFilesOrGlobs, { allowEmpty: true }),
		new i18nTransform(Object.assign({}, parserOptions, { defaultNamespace: entryPointName })).on(
			'warning:variable',
			console.log
		),
		new MergeExistingTranslationsTransform((stats) => {
			const { language, keysExtracted, keysMerged, keysRemoved } = stats
			extractionStats.keysExtracted = keysExtracted
			extractionStats.locales.push({ language, keysMerged, keysRemoved })
		}),
		new JsonToPoTransform(),
		vfs.dest('./')
	)

	const taskDuration = Date.now() - start
	const { keysExtracted, locales } = extractionStats
	if (keysExtracted) {
		console.info(`=> OK, ${keysExtracted || 0} keys extracted in ${taskDuration} ms`)
		for (const locale of locales) {
			const { language, keysMerged, keysRemoved } = locale
			console.info(
				`\t${language}: added ${
					keysExtracted - keysMerged
				} new keys, merged ${keysMerged} existing translations, removed ${keysRemoved} obsolete keys`
			)
		}
	} else {
		console.info(`=> No keys found in ${taskDuration}ms`)
		await clearNamespacePoFiles(entryPointName, parserOptions.locales)
	}
}

/**
 * @param {Record<string, string> | {
 *   BlueprintEntrypoints: Record<string, string>,
 *   BlueprintTranslationSources?: Record<string, string[]>,
 *   BlueprintTranslationLocales?: string[],
 *   BlueprintTranslationTsconfig?: string,
 * }} blueprintMapOrEntrypoints
 */
export async function extractTranslations(blueprintMapOrEntrypoints) {
	const isBlueprintMap = Boolean(blueprintMapOrEntrypoints.BlueprintEntrypoints)
	const entrypoints = isBlueprintMap
		? blueprintMapOrEntrypoints.BlueprintEntrypoints
		: blueprintMapOrEntrypoints
	const scanPaths = isBlueprintMap ? blueprintMapOrEntrypoints.BlueprintTranslationSources ?? {} : {}
	const tsconfigPath = isBlueprintMap ? blueprintMapOrEntrypoints.BlueprintTranslationTsconfig : undefined

	const locales = isBlueprintMap ? resolveLocales(blueprintMapOrEntrypoints) : extractOptions.locales
	const parserOptions = { ...extractOptions, locales }

	console.info(`Locales: ${locales.join(', ')}`)

	const moduleSets = isBlueprintMap ? resolveAllEntrypointModules(entrypoints, tsconfigPath) : null

	for (const [entryPointName, sourcePath] of Object.entries(entrypoints)) {
		if (isBlueprintMap && scanPaths[entryPointName]?.length) {
			await extractFromSources(entryPointName, scanPaths[entryPointName], parserOptions)
		} else if (isBlueprintMap) {
			const sourceFiles = moduleSets[entryPointName] ?? []
			await extractFromSources(entryPointName, sourceFiles, parserOptions, { useFileList: true })
		} else {
			await extractFromSources(entryPointName, resolveSourceGlobs(entryPointName, sourcePath, scanPaths), parserOptions)
		}
	}
}
