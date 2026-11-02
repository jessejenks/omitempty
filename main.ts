#!/usr/bin/env node
import denojson from "./deno.json" with { type: "json" };
import { parseArgs } from "@std/cli/parse-args";
import fs from "node:fs";
import process from "node:process";
import { Config, parseConfig } from "./src/config.ts";
import { lower, LowerOptions } from "./src/lower.ts";
import { Parser } from "./src/parser.ts";
import { Printer, Writer } from "./src/print.ts";

function version() {
	console.error(`v${denojson.version}`);
}

function help() {
	console.error(`omitempty v${denojson.version}`);
	console.error("  <input.go>                   input go file");
	console.error("  -s | --spaces      [n]            output with indentation of n spaces instead of tab characters");
	console.error("  -c | --config      <config.json>  optional config file");
	console.error("  -d | --doc-comment [line]+        doc comment to include at start of file");
	console.error("  -p | --preamble    [line]+        preamble after doc comments");
	console.error("  --skip             [name]+        skip declarations");
	console.error("  --sub              [from=to]+     type substitutions");
	console.error("  --version-comment                 include version number at beginning of doc comments.");
	console.error("                                    default true. use --no-version-comment to disable");
	console.error("A plus after an option indicates that it may be passed multiple times");
}

function getIndentOptions(spaces: string | undefined) {
	const useTabs = spaces === undefined;
	let tabWidth = 4;
	if (spaces === undefined) {
		return { useTabs, tabWidth };
	}
	try {
		tabWidth = Number.parseInt(spaces);
	} catch {
		help();
		process.exit(1);
	}
	if (!Number.isFinite(tabWidth) || Number.isNaN(tabWidth)) {
		help();
		process.exit(1);
	}
	return { useTabs, tabWidth };
}

function getSubstitutionOverrides(subs: string[]): LowerOptions["substitutions"] {
	if (subs === undefined) {
		return {};
	}
	const overrides: LowerOptions["substitutions"] = {};
	for (const s of subs) {
		const splt = s.split("=", 2);
		if (splt.length !== 2) {
			console.error('invalid sub option, must be of the form "name=name"');
			help();
			process.exit(1);
		}
		overrides[splt[0].trim()] = splt[1].trim();
	}
	return overrides;
}

const args = parseArgs(process.argv.slice(2), {
	boolean: ["help", "version", "version-comment"],
	string: ["config", "spaces", "doc-comment", "preamble", "skip", "sub"],
	collect: ["doc-comment", "preamble", "skip", "sub"],
	negatable: ["version-comment"],
	default: { "version-comment": true },
	alias: { "h": "help", "v": "version", "s": "spaces", "c": "config", "d": "doc-comment", "p": "preamble" },
});

if (args.help) {
	help();
	process.exit(0);
}

if (args.version) {
	version();
	process.exit(0);
}

const inputPath = args._[0];
if (typeof inputPath !== "string") {
	console.error("invalid path to input file");
	help();
	process.exit(1);
}
const { useTabs, tabWidth } = getIndentOptions(args.spaces);
const defaultConfig: Config = {
	docComment: args["version-comment"] ? [`Generated with omitempty v${denojson.version}`] : [],
	preamble: [],
	skip: [],
	substitutions: {},
};
let config: Config = args.config === undefined
	? defaultConfig
	: parseConfig(fs.readFileSync(args.config, "utf8"), defaultConfig);
const substitutionOverrides = getSubstitutionOverrides(args.sub);
config = {
	...config,
	docComment: args["doc-comment"].length > 0
		? args["version-comment"]
			? [`Generated with omitempty v${denojson.version}`, ...args["doc-comment"]]
			: args["doc-comment"]
		: config.docComment,
	preamble: args.preamble.length > 0 ? args.preamble : config.preamble,
	skip: args.skip.length > 0 ? args.skip : config.skip,
	substitutions: {
		...config.substitutions,
		...substitutionOverrides,
	},
};
const input = fs.readFileSync(inputPath, "utf8");
try {
	const decls = new Parser().parse(input);
	console.log(new Printer(config, new Writer(useTabs, tabWidth)).printDeclarations(lower(decls, config)));
} catch (e) {
	console.error(String(e));
	process.exit(1);
}
