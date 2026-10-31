#!/usr/bin/env node
import denojson from "./deno.json" with { type: "json" };
import { parseArgs } from "@std/cli/parse-args";
import fs from "node:fs";
import process from "node:process";
import { parseConfig } from "./src/config.ts";
import { lower, LowerOptions } from "./src/lower.ts";
import { Parser } from "./src/parser.ts";
import { Printer, Writer } from "./src/print.ts";

function version() {
	console.error(`v${denojson.version}`);
}

function help() {
	console.error(`omitempty v${denojson.version}`);
	console.error("  <input.go>                input go file");
	console.error("  --spaces   [n]            output with indentation of n spaces instead of tab characters");
	console.error("  --config   <config.json>  optional config file");
	console.error("  --sub      [from=to]      inline named type substitutions, can be passed multiple times");
}

function usage() {
	console.error(
		"Usage: omitempty <input.go> [--config <config.json>] [--spaces n] [--sub from=to]+",
	);
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
		usage();
		process.exit(1);
	}
	if (!Number.isFinite(tabWidth) || Number.isNaN(tabWidth)) {
		usage();
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
			usage();
			process.exit(1);
		}
		overrides[splt[0].trim()] = splt[1].trim();
	}
	return overrides;
}

const args = parseArgs(process.argv.slice(2), {
	boolean: ["help", "version"],
	string: ["config", "spaces", "sub"],
	collect: ["sub"],
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
	usage();
	process.exit(1);
}
const { useTabs, tabWidth } = getIndentOptions(args.spaces);
const config = args.config === undefined ? { substitutions: {} } : parseConfig(fs.readFileSync(args.config, "utf8"));
const overrides = getSubstitutionOverrides(args.sub);
config.substitutions = {
	...config.substitutions,
	...overrides,
};
const input = fs.readFileSync(inputPath, "utf8");
try {
	const decls = new Parser().parse(input);
	console.log(new Printer(new Writer(useTabs, tabWidth)).printDeclarations(lower(decls, config)));
} catch (e) {
	console.error(String(e));
	process.exit(1);
}
