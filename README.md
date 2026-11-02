# Omitempty

![Tests](https://github.com/jessejenks/omitempty/actions/workflows/test.yml/badge.svg)

Tool to migrate go type definitions to TS types.

This tool currently only handles types that could be converted to JSON. So this will fail on non-empty interface types,
function types, or non-json struct tags.

## Running

running as normal deno script

```sh
deno run --allow-read main.ts [input.go] [--spaces n] [--config config.json] [--sub from=to]*
```

or as node/commonjs script

```sh
deno task bundle
# alias for
deno bundle main.ts --minify --format cjs -o omitempty.cjs
```

## Example

You can convert go type declarations and even specify substitutions for named types.

In this example, we have two type declarations, and we want to replace `time.Time` with `string`. Numeric types are
already automatically substituted, e.g. `byte` becomes `number`.

```go
// The type Foo is for XYZ
// it has this doc comment
type Foo []map[byte]*time.Time // trailing comment

type Bar struct {
	// X is for XYZ
	X bool `json:"field_name,omitempty"`

	Y string `json:"-"` // this field is ignored

	// First embedded type
	Embedded1

	// Second embedded type
	Embedded2 // it's for XYZ

	// This comment comes at the end
}
```

Substitutions can be given as command line arguments (can provide multiple)

```sh
omitempty example.go --sub "time.Time=string"
```

```ts
/*
 * Generated with omitempty v1.2.0
 */

// The type Foo is for XYZ
// it has this doc comment
export type Foo = Record<number, string | null>[]; // trailing comment

export type Bar =
	& {
		// X is for XYZ
		field_name?: boolean;
		// This comment comes at the end
	}
	// First embedded type
	& Embedded1
	// Second embedded type
	& Embedded2; // it's for XYZ
```

Or you can pass a config file like to specify substitutions.

```json
{
	"substitutions": {
		"time.Time": "string"
	}
}
```

```sh
deno run --allow-read main.ts example.go --config config.json
```

Note that command line substitutions will override config substitutions.

## Configuration

A general configuration file looks like this

```json
{
	"docComment": ["My Name", "Copyright 2026"],
	"preamble": ["import * as foo from \"./bar\";"],
	"skip": ["Skipped"],
	"replacements": {
		"Replaced": [
			"{",
			"\t// can be passed as lines",
			"\tkey: string | null;",
			"}"
		]
	},
	"substitutions": {
		"time.Time": "string"
	}
}
```

Each of `docComment`, `preamble`, and `skip` may be a string or array of strings.

On this input

```go
type Foo []char

type Bar struct {
	X int
	Y bool
}

// This is not included in the final output
type Skipped = alias.Skipped

// This is included, but the declaration is replaced
type Replaced = pkg.Foo
```

```sh
omitempty example.go --config config.json
```

produces

```ts
/*
 * Generated with omitempty v1.2.0
 * My Name
 * Copyright 2026
 */

import * as foo from "./bar";

export type Foo = char[];

export type Bar = {
	X: number;
	Y: boolean;
};

// This is included, but the declaration is replaced
export type Replaced = {
	// can be passed as lines
	key: string | null;
};
```

## Command Line Usage

Every config field has a corresponding command line option. So the previous example could have been done without a
config file with this invocation.

```sh
omitempty example.go \
	--doc-comment "My Name" \
	--doc-comment "Copyright 2026" \
	--preamble "import * as foo from \"./bar\";" \
	--skip Skipped \
	--rep $'Replaced={\n\t// can be passed as lines\n\tkey: string | null;\n}' \
	--sub "time.Time=string"
```

The first line `"Generated with omitempty v1.2.0"` is always included by default. This can be removed with the
`--no-version-number` flag.
