// @ts-check
import fs from 'node:fs/promises'

/**
 * Plugin to upload the built blueprint to a server after bundling
 * This also writes out a json file of the assets, which is needed for the bundling process
 * @returns {import('rollup').OutputPlugin}
 */
export const uploadPlugin = (server, bundleId, development, userHeaders) => {
	return {
		name: 'upload',
		async writeBundle(options, bundle) {
			// console.log(options, bundle)
			// console.log('Writing bundle', this.getModuleIds())

			const assetsBundle = {}

			const reducedHeaders = userHeaders.reduce((prev, curr) => {
				const idx = curr.indexOf(':')
				if (idx !== -1) {
					const key = curr.slice(0, idx).trim()
					const value = curr.slice(idx + 1).trim()
					prev[key] = value
				}
				return prev
			}, {})

			const headers = {
				'Content-Type': 'text/javascript',
				...reducedHeaders,
			}

			for (const [id, item] of Object.entries(bundle)) {
				console.log(`Writing ${item.type}: ${id}`)
				if (item.type === 'asset') {
					assetsBundle[item.fileName] = Buffer.from(item.source).toString('base64')
				} else if (item.type === 'chunk') {
					if (!item.isEntry) throw new Error(`Expected a single code chunk: ${id}`)

					if (server) {
						try {
							const res = await fetch(
								server + '/api/private/blueprints/restore/' + bundleId + (development ? '?developmentMode=1' : ''),
								{
									method: 'POST',
									body: item.code,
									headers,
								}
							)
							if (!res.ok) {
								throw new Error(`HTTP ${res.status}: ${await res.text()}`)
							}
							console.log(`Blueprints '${id}' uploaded`)
						} catch (e) {
							console.error(`Blueprints '${id}' upload failed:`, e.toString(), e.stack)
						}
					}
				} else {
					// @ts-expect-error
					throw new Error(`Unknown bundle type ${item.type}`)
				}
			}

			if (Object.keys(assetsBundle).length > 0) {
				fs.writeFile(`dist/${bundleId}-assets.json`, JSON.stringify(assetsBundle)).catch((e) => {
					console.error(`Failed to write assets bundle to disk:`, e.toString(), e.stack)
				})
				if (server) {
					try {
						const res = await fetch(server + '/api/private/blueprints/assets', {
							method: 'POST',
							body: JSON.stringify(assetsBundle),
							headers,
						})
						if (!res.ok) {
							throw new Error(`HTTP ${res.status}: ${await res.text()}`)
						}
						console.log(`Blueprints assets uploaded`)
					} catch (e) {
						console.error(`Blueprints assets upload failed:`, e.toString(), e.stack)
					}
				}
			} else {
				fs.rm(`dist/${bundleId}-assets.json`).catch(() => {
					// Ignore, likely doesn't exist
				})
			}
		},
	}
}
