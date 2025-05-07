// @ts-check
import { createFilter } from '@rollup/pluginutils'
import { createHash } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'

/**
 * This is inspired by @rollup/plugin-url, but is modified so that it emits files in a way that lets us detect that it did.
 * In the process of this, it has been refactored and simplified a lot.
 * @returns {import('rollup').Plugin}
 */
export const urlPluginExt = (destDir) => {
	const include = ['**/*.svg', '**/*.png']
	const sourceDir = null // TODO?
	const fileName = '[hash][extname]'

	const filter = createFilter(include)

	const copies = Object.create(null)

	return {
		name: 'url-custom',
		load(id) {
			if (!filter(id)) {
				return null
			}
			this.addWatchFile(id)
			return fs.readFile(id).then((buffer) => {
				const hash = createHash('sha1').update(buffer).digest('hex').substr(0, 16)
				const ext = path.extname(id)
				const name = path.basename(id, ext)
				// Determine the directory name of the file based
				// on either the relative path provided in options,
				// or the parent directory
				const relativeDir = sourceDir
					? path.relative(sourceDir, path.dirname(id))
					: path.dirname(id).split(path.sep).pop()

				// Generate the output file name based on some string
				// replacement parameters
				const outputFileName = fileName
					.replace(/\[hash\]/g, hash)
					.replace(/\[extname\]/g, ext)
					// use `sep` for windows environments
					.replace(/\[dirname\]/g, relativeDir === '' ? '' : `${relativeDir}${path.sep}`)
					.replace(/\[name\]/g, name)
				// Windows fix - exports must be in unix format
				const data = `${outputFileName.split(path.sep).join(path.posix.sep)}`
				copies[id] = outputFileName

				// Emit the file so that it gets copied and our bundler plugin detects it
				this.emitFile({
					name: data,
					fileName: path.join(destDir, data),
					originalFileName: id,
					source: buffer,
					type: 'asset',
				})

				return `export default "${data}"`
			})
		},
	}
}
