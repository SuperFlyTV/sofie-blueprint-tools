/**
 * This script will read and bundle the translations in the project's .po files.
 * It is intended to be used by the Webpack config script.
 */
/* eslint-disable */
import { Transform } from 'stream'
import vfs from 'vinyl-fs'
import { readFile, writeFile } from 'fs/promises'
import { gettextToI18next } from 'i18next-conv'

import { conversionOptions } from './config.mjs'

const reverseHack = !!process.env.GENERATE_REVERSE_ENGLISH

class poToI18nextTransform extends Transform {
	constructor(namespace) {
		super({ objectMode: true })

		this._namespace = namespace
	}

	_transform(file, encoding, callback) {
		const start = Date.now()
		const language = file.dirname.split(/[/|\\]/).pop()
		const namespace = file.stem

		readFile(file.path, 'utf-8')
			.then((poFile) => {
				if (!poFile) {
					return null
				}
				return gettextToI18next(
					language,
					poFile,
					Object.assign({}, conversionOptions, {
						language,
						skipUntranslated: false,
						ns: file.stem,
					})
				)
			})
			.then(JSON.parse)
			.then((data) => {
				for (const [key, value] of Object.entries(data)) {
					if (!value) {
						data[key] = reverseHack && language === 'en' ? key.split('').reverse().join('') : key
					}
				}
				console.info(
					`Processed ${namespace} ${language} (${Object.keys(data).length} keys) (${Date.now() - start} ms)`
				)
				callback(null, {
					type: 'i18next',
					language,
					namespace,
					data,
				})
			})
			.catch(callback)
	}
}

function mergeByLanguage(translations) {
	const languages = {}

	for (const translation of translations) {
		const { language, data } = translation
		if (!languages[language]) {
			languages[language] = data
		} else {
			Object.assign(languages[language], data)
		}
	}

	return Object.keys(languages).map((language) => ({ language, data: languages[language], type: 'i18next' }))
}

export async function getTranslations(bundleId) {
	const namespaceFileNames = [`locales/**/${bundleId}.po`]
	const translations = vfs.src(namespaceFileNames).pipe(new poToI18nextTransform())

	const out = []
	for await (const translation of translations) {
		out.push(translation)
	}

	return mergeByLanguage(out)
}
