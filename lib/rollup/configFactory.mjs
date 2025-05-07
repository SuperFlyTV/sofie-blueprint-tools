// @ts-check

import pluginTypescript from '@rollup/plugin-typescript'
import pluginJson from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import pluginCommonjs from '@rollup/plugin-commonjs'
import replacePlugin from '@rollup/plugin-replace'
import { getTranslations } from '../translation/bundle.mjs'
import { urlPluginExt } from './urlPlugin.mjs'
import { uploadPlugin } from './uploadPlugin.mjs'
import path from 'node:path'
import { execSync } from 'node:child_process'

// We have to do this as multiple configs, otherwise rollup will do code splitting which we do not want https://github.com/rollup/rollup/issues/2756
/** @return {Promise<import('rollup').RollupOptions[]>} */
export async function RollupConfigFactory(sources, distDir, server, development) {
	const pkg = (
		await import(path.join(process.cwd(), './package.json'), {
			assert: { type: 'json' },
		})
	).default

	// TODO - will these imports work reliably once packaged?
	// @ts-ignore
	const { default: pkgIntegration } = await import('@sofie-automation/blueprints-integration/package.json', {
		assert: { type: 'json' },
	})

	// @ts-ignore
	const { TMP_TSR_VERSION } = await import('@sofie-automation/blueprints-integration')

	let versionStrFactory
	if (!development) {
		const gitVersion = execSync('git describe --always --tags').toString().trim()

		versionStrFactory = () => JSON.stringify(pkg.version + '+' + gitVersion)
	} else {
		versionStrFactory = () => {
			const now = new Date()
			const year = now.getFullYear()
			const month = String(now.getMonth() + 1).padStart(2, '0')
			const day = String(now.getDate()).padStart(2, '0')
			const hours = String(now.getHours()).padStart(2, '0')
			const minutes = String(now.getMinutes()).padStart(2, '0')

			return JSON.stringify(pkg.version + '+dev-' + year + month + day + '-' + hours + minutes)
		}
	}

	const versionTSRTypes = TMP_TSR_VERSION
	const versionIntegration = pkgIntegration.version

	if (!versionTSRTypes) throw Error('timeline-state-resolver-types version missing!')
	if (!versionIntegration) throw Error('@sofie-automation/blueprints-integration version missing!')

	console.log(`Found versions:`)
	console.log(`timeline-state-resolver-types: ${versionTSRTypes}`)
	console.log(`@sofie-automation/blueprints-integration: ${versionIntegration}`)

	return Promise.all(
		Object.entries(sources).map(async ([id, def]) => {
			const translations = await getTranslations({ [id]: def })

			/** @type {import('rollup').RollupOptions} */
			const config = {
				input: def,
				preserveEntrySignatures: 'strict',
				output: {
					file: path.join(distDir, `${id}-bundle.js`),
					sourcemap: 'inline',

					// this is a mess, but is backwards compatibile with sofie
					name: 'blueprint',
					format: 'iife',
					banner: `null; `,
					footer: `; blueprint = { default: blueprint };`,

					generatedCode: 'es2015',

					plugins: [server ? uploadPlugin(server, id) : undefined],
				},

				plugins: [
					replacePlugin({
						preventAssignment: true,
						values: {
							__VERSION__: versionStrFactory,
							__VERSION_TSR__: JSON.stringify(versionTSRTypes),
							__VERSION_INTEGRATION__: JSON.stringify(versionIntegration),
							__TRANSLATION_BUNDLES__: JSON.stringify(translations),
						},
					}),
					pluginTypescript(),
					pluginCommonjs(),
					nodeResolve(),
					pluginJson(),
					urlPluginExt(`${id}-assets`),
				],
			}

			return config
		})
	)
}
