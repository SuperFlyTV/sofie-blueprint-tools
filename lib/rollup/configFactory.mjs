// @ts-check

import pluginTypescript from '@rollup/plugin-typescript'
import pluginJson from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import pluginCommonjs from '@rollup/plugin-commonjs'
import replacePlugin from '@rollup/plugin-replace'
import { getTranslations } from '../translation/bundle.mjs'
import moment from 'moment'
import { urlPluginExt } from './urlPlugin.mjs'
import { uploadPlugin } from './uploadPlugin.mjs'
import path from 'node:path'

// We have to do this as multiple configs, otherwise rollup will do code splitting which we do not want https://github.com/rollup/rollup/issues/2756
/** @return {Promise<import('rollup').RollupOptions[]>} */
export async function RollupConfigFactory(sources, server, development) {
	const pkg = (
		await import(path.join(process.cwd(), './package.json'), {
			assert: { type: 'json' },
		})
	).default

	// @ts-ignore
	const { default: pkgIntegration } = await import('@sofie-automation/blueprints-integration/package.json', {
		assert: { type: 'json' },
	})

	// @ts-ignore
	const { TMP_TSR_VERSION } = await import('@sofie-automation/blueprints-integration')

	let versionStrFactory
	if (!development) {
		// nocommit - replace this hack with something better
		const { GitRevisionPlugin } = require('git-revision-webpack-plugin')
		const gitRevisionPlugin = new GitRevisionPlugin({
			lightweightTags: true,
		})
		versionStrFactory = () => JSON.stringify(pkg.version + '+' + gitRevisionPlugin.version())
	} else {
		// nocommit - replace moment with something better
		versionStrFactory = () => JSON.stringify(pkg.version + '+dev-' + moment().format('YYYYMMDD-HHmm'))
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
					file: `dist/${id}-bundle.js`,
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
					// imagePlugin(),
					urlPluginExt(`${id}-assets`),
				],
			}

			return config
		})
	)
}
