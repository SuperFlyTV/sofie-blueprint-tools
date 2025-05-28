# Sofie: The Modern TV News Studio Automation System

When making blueprints for Sofie, they need to be packaged and uploaded in a certain way.  
This includes steps such as transforming the json-schema used for the configuration, and extracting strings to be translated.

This library is a collection of tooling needed by all blueprints to prepare them into the format that Sofie expects.

You can see a reference blueprint implementation which utilises this tooling at https://github.com/SuperFlyTV/sofie-demo-blueprints  
If wanting to make your own blueprints, we recommend starting from that repository instead of building from scratch.

## Available scripts

All of these scripts need to know the names and paths of the blueprints in your project. This is done with the `blueprint-map.mjs` file provided to each command.

A simple example of this file is:

```js
// This is each blueprint that you have
export const BlueprintEntrypoints = {
	demoshowstyle: './src/main/showstyle/index.ts',
	demostudio: './src/main/studio/index.ts',
	system: './src/system/index.ts',
}

// You can optionally define bundles, so that you can easily produce a smaller bundle containing a subset of the blueprints in the project
export const BlueprintBundles = {
	show: ['demoshowstyle', 'demostudio', 'system'],
}
```

### blueprint-build

This is the core build script. It will consume your typescript source code, and prepare a self contained js file for each blueprint. Optionally, it can auto-upload the built code to your sofie installation (very useful for development)

```
	Tool to build blueprints into a Sofie compatible bundle

	Usage
		$ blueprint-build <config-file> <dist-dir>

	Options
		--server       Server to upload to
		--development  Development mode
		--watch, -w    Watch for changes and rebuild
		--bundle       Bundle to build, or "all" for all bundles (default: "all")

	Examples
		$ blueprint-build ./blueprint-map.mjs ./dist
		$ blueprint-build ./blueprint-map.mjs ./dist --watch --development
		$ blueprint-build ./blueprint-map.mjs ./dist --bundle=core
```

### blueprint-bundle

This is a helper build script to combine the built blueprints into a single json bundle. This allows them to be uploaded to sofie with a single POST to `http://localhost:3000/api/private/blueprints/restore`.

```
	Tool to bundle built blueprints into a json bundle for easier bulk uploading

	Usage
		$ blueprint-bundle <config-file> <dist-dir>

	Options
		--bundle           Bundle name to process, or "all" for all bundles (default: "all")

	Examples
		$ blueprint-bundle ./blueprint-map.mjs ./dist/
		$ blueprint-bundle ./blueprint-map.mjs ./dist/ -b core
```

### blueprint-schema-types

Sofie expects your available blueprint configuration fields to be defined with JSON schema. This tool will convert the same schema into typescript interfaces and enums which you can use in your code.

```
	Tool to generate typescript types from blueprint config schemas

	Usage
		$ blueprint-schema-types <search-path> <output-path>

	Examples
		$ blueprint-schema-types ./src/$schemas/generated ./src/generated/types
```

### blueprint-extract-translations

If you need to provide translations for various text from your blueprints into multiple languages, you can utilise this to generate `po` files for the strings that need translating.

```
	Tool to extract translations from the TypeScript sourcecode, and associated json schemas

	Usage
		$ blueprint-extract-versions <config-file>

	Examples
		$ blueprint-extract-versions ./blueprint-map.mjs
```

## Contributing

Any contributions to this are welcome. We hope that the tools here can be utilised for all Sofie blueprints no matter how complex. There are likely bits of configuration that have not been exposed, and are happy to expose more as needed.
