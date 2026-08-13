/**
 * Resolve local source files reachable from a blueprint entrypoint via static imports.
 *
 * Uses the TypeScript module resolver (path aliases from tsconfig) so extraction
 * matches the same import graph the Rollup build follows.
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const TRANSLATABLE_EXTENSIONS = new Set(['.ts', '.json'])

/**
 * @param {string} [explicitPath]
 * @returns {string}
 */
export function resolveTsconfigPath(explicitPath) {
	if (explicitPath) return explicitPath

	const projectRoot = process.cwd()
	for (const name of ['tsconfig.build.json', 'tsconfig.json']) {
		if (fs.existsSync(path.join(projectRoot, name))) {
			return name
		}
	}

	throw new Error('No tsconfig.build.json or tsconfig.json found in project root')
}

/**
 * @param {string} [tsconfigPath]
 * @returns {{ projectRoot: string, compilerOptions: ts.CompilerOptions }}
 */
function loadCompilerOptions(tsconfigPath) {
	const projectRoot = process.cwd()
	const tsconfigAbs = path.resolve(projectRoot, resolveTsconfigPath(tsconfigPath))
	const configFile = ts.readConfigFile(tsconfigAbs, ts.sys.readFile)
	if (configFile.error) {
		throw new Error(ts.formatDiagnostic(configFile.error, ts.createCompilerHost({})))
	}

	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigAbs))
	return { projectRoot, compilerOptions: parsed.options }
}

/**
 * @param {string} entryAbs
 * @param {ts.Program} program
 * @param {ts.CompilerOptions} compilerOptions
 * @param {string} projectRoot
 * @returns {string[]}
 */
function collectReachableModules(entryAbs, program, compilerOptions, projectRoot) {
	const visited = new Set()
	const queue = [entryAbs]

	while (queue.length > 0) {
		const fileAbs = queue.shift()
		if (!fileAbs || visited.has(fileAbs)) continue
		visited.add(fileAbs)

		const sourceFile = program.getSourceFile(fileAbs)
		if (!sourceFile) continue

		for (const ref of sourceFile.referencedFiles) {
			const resolved = path.resolve(path.dirname(fileAbs), ref.fileName)
			if (isLocalSource(projectRoot, resolved)) {
				queue.push(resolved)
			}
		}

		const visit = (node) => {
			if (
				(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			) {
				const resolved = resolveModule(compilerOptions, fileAbs, node.moduleSpecifier.text)
				if (resolved && isLocalSource(projectRoot, resolved)) {
					queue.push(resolved)
				}
			}
			ts.forEachChild(node, visit)
		}
		visit(sourceFile)
	}

	return [...visited]
		.filter((fileAbs) => TRANSLATABLE_EXTENSIONS.has(path.extname(fileAbs)))
		.map((fileAbs) => path.relative(projectRoot, fileAbs))
		.sort()
}

/**
 * @param {string} entryPoint Path to the blueprint entry file (e.g. ./src/studio0/index.ts)
 * @param {string} [tsconfigPath] Path to tsconfig used for path aliases
 * @returns {string[]} Project-relative paths of reachable .ts / .json files
 */
export function resolveEntrypointModules(entryPoint, tsconfigPath) {
	const { projectRoot, compilerOptions } = loadCompilerOptions(tsconfigPath)
	const entryAbs = path.resolve(projectRoot, entryPoint)
	const program = ts.createProgram([entryAbs], compilerOptions)
	return collectReachableModules(entryAbs, program, compilerOptions, projectRoot)
}

/**
 * @param {Record<string, string>} entrypoints
 * @param {string} [tsconfigPath]
 * @returns {Record<string, string[]>}
 */
export function resolveAllEntrypointModules(entrypoints, tsconfigPath) {
	const { projectRoot, compilerOptions } = loadCompilerOptions(tsconfigPath)
	const rootNames = Object.values(entrypoints).map((entry) => path.resolve(projectRoot, entry))
	const program = ts.createProgram(rootNames, compilerOptions)

	/** @type {Record<string, string[]>} */
	const result = {}
	for (const [name, entry] of Object.entries(entrypoints)) {
		const entryAbs = path.resolve(projectRoot, entry)
		result[name] = collectReachableModules(entryAbs, program, compilerOptions, projectRoot)
	}
	return result
}

function resolveModule(compilerOptions, containingFile, moduleName) {
	const result = ts.resolveModuleName(moduleName, containingFile, compilerOptions, ts.sys)
	const resolved = result.resolvedModule?.resolvedFileName
	if (!resolved || resolved.endsWith('.d.ts')) return null
	return path.normalize(resolved)
}

function isLocalSource(projectRoot, fileAbs) {
	const relative = path.relative(projectRoot, fileAbs)
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false
	if (relative.includes('node_modules')) return false
	const posixRelative = relative.split(path.sep).join('/')
	if (posixRelative.includes('/__tests__/') || posixRelative.includes('/__mocks__/')) return false
	return TRANSLATABLE_EXTENSIONS.has(path.extname(relative))
}
