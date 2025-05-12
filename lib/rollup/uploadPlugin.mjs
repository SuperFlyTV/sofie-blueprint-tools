// @ts-check
import axios from 'axios'
import https from 'node:https'
import fs from 'node:fs/promises'

const axiosInstance = axios.create({
	httpsAgent: new https.Agent({
		rejectUnauthorized: false,
	}),
})

/**
 * @returns {import('rollup').OutputPlugin}
 */
export const uploadPlugin = (server, bundleId) => {
	return {
		name: 'upload',
		writeBundle(options, bundle) {
			// console.log(options, bundle)
			// console.log('Writing bundle', this.getModuleIds())

			const assetsBundle = {}

			for (const [id, item] of Object.entries(bundle)) {
				console.log(`Writing ${item.type}: ${id}`)
				if (item.type === 'asset') {
					assetsBundle[item.fileName] = Buffer.from(item.source).toString('base64')
				} else if (item.type === 'chunk') {
					if (!item.isEntry) throw new Error(`Expected a single code chunk: ${id}`)

					axiosInstance
						.post(server + '/api/private/blueprints/restore/' + bundleId, item.code, {
							headers: {
								'Content-Type': 'text/javascript',
							},
						})
						.then(() => {
							console.log(`Blueprints '${id}' uploaded`)
						})
						.catch((e) => {
							console.error(`Blueprints '${id}' upload failed:`, e.toString(), e.stack)
						})
				} else {
					// @ts-expect-error
					throw new Error(`Unknown bundle type ${item.type}`)
				}
			}

			if (Object.keys(assetsBundle).length > 0) {
				fs.writeFile(`dist/${bundleId}-assets.json`, JSON.stringify(assetsBundle)).catch((e) => {
					console.error(`Failed to write assets bundle to disk:`, e.toString(), e.stack)
				})
				axiosInstance
					.post(server + '/api/private/blueprints/assets', JSON.stringify(assetsBundle), {
						headers: {
							'Content-Type': 'application/json',
						},
					})
					.then(() => {
						console.log(`Blueprints assets uploaded`)
					})
					.catch((e) => {
						console.error(`Blueprints assets upload failed:`, e.toString(), e.stack)
					})
			} else {
				fs.rm(`dist/${bundleId}-assets.json`).catch(() => {
					// Ignore, likely doesn't exist
				})
			}
		},
	}
}
