// @ts-check
import https from 'node:https'
import fs from 'node:fs/promises'


/** A version of fetch that ignores TLS errors. Use with caution. 
 * @param {URL | RequestInfo} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
const insecureFetch = async (input, init) => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const response = await fetch(input, init)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1'
  return response
}

/**
 * @returns {import('rollup').OutputPlugin}
 */
export const uploadPlugin = (server, bundleId, development) => {
	return {
		name: 'upload',
		async writeBundle(options, bundle) {
			// console.log(options, bundle)
			// console.log('Writing bundle', this.getModuleIds())

			const assetsBundle = {}

			for (const [id, item] of Object.entries(bundle)) {
				console.log(`Writing ${item.type}: ${id}`)
				if (item.type === 'asset') {
					assetsBundle[item.fileName] = Buffer.from(item.source).toString('base64')
				} else if (item.type === 'chunk') {
					if (!item.isEntry) throw new Error(`Expected a single code chunk: ${id}`)

					try {
						const res = await insecureFetch(
							server + '/api/private/blueprints/restore/' + bundleId + (development ? '?developmentMode=1' : ''),
							{
								method: 'POST',
								body: item.code,
								headers: {
									'Content-Type': 'text/javascript',
								},
							}
						)
						if (!res.ok) {
							throw new Error(`HTTP ${res.status}: ${await res.text()}`)
						}
						console.log(`Blueprints '${id}' uploaded`)
					} catch (e) {
						console.error(`Blueprints '${id}' upload failed:`, e.toString(), e.stack)
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
				try {
					const res = await insecureFetch(server + '/api/private/blueprints/assets', {
						method: 'POST',
						body: JSON.stringify(assetsBundle),
						headers: {
							'Content-Type': 'application/json',
						},
					})
					if (!res.ok) {
						throw new Error(`HTTP ${res.status}: ${await res.text()}`)
					}
					console.log(`Blueprints assets uploaded`)
				} catch (e) {
					console.error(`Blueprints assets upload failed:`, e.toString(), e.stack)
				}
			} else {
				fs.rm(`dist/${bundleId}-assets.json`).catch(() => {
					// Ignore, likely doesn't exist
				})
			}
		},
	}
}
