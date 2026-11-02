import { LowerOptions } from "./lower.ts";

export type Config = {
	docComment: string[];
	preamble: string[];
} & LowerOptions;

function parseStringOrStringArray(key: string, value: unknown): string[] {
	const values: string[] = [];
	if (typeof value === "string") {
		values.push(value);
	} else if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			if (typeof value[i] !== "string") {
				throw new Error(
					`Config error: "${key}" must be a string or array of strings, found ${key}[${i}] ${typeof value[i]}`,
				);
			}
			values.push(value[i]);
		}
	} else {
		throw new Error(`Config error: "${key}" must be a string or array of strings`);
	}
	return values;
}

export function parseConfig(text: string, defaultConfig: Config): Config {
	const json: unknown = JSON.parse(text);
	if (typeof json !== "object" || json === null || Array.isArray(json)) {
		throw new Error("Config error: expected a JSON object");
	}

	const docComment: string[] = defaultConfig.docComment;
	if ("docComment" in json) {
		docComment.push(...parseStringOrStringArray("docComment", json.docComment));
	}

	let preamble: string[] = defaultConfig.preamble;
	if ("preamble" in json) {
		preamble = parseStringOrStringArray("preamble", json.preamble);
	}

	let skip: string[] = defaultConfig.skip;
	if ("skip" in json) {
		skip = parseStringOrStringArray("skip", json.skip);
	}

	let replacements: Record<string, string> = defaultConfig.replacements;
	if ("replacements" in json) {
		const reps = json.replacements;
		if (typeof reps !== "object" || reps === null || Array.isArray(reps)) {
			throw new Error(`Config error: "replacements" must be an object`);
		}
		replacements = {};
		for (let [goType, tsType] of Object.entries(reps)) {
			if (typeof tsType !== "string" && !Array.isArray(tsType)) {
				throw new Error(
					`Config error: replacements["${goType}"] must be a string, OR an array of strings`,
				);
			}
			if (Array.isArray(tsType)) {
				tsType = tsType.join("\n");
			}
			tsType = tsType.trim();
			if (tsType === "") {
				throw new Error(
					`Config error: replacements["${goType}"] must be non-empty`,
				);
			}
			replacements[goType] = tsType;
		}
	}

	let substitutions: Record<string, string> = defaultConfig.substitutions;
	if ("substitutions" in json) {
		const subs = json.substitutions;
		if (typeof subs !== "object" || subs === null || Array.isArray(subs)) {
			throw new Error(`Config error: "substitutions" must be an object`);
		}
		substitutions = {};
		for (let [goType, tsType] of Object.entries(subs)) {
			if (typeof tsType !== "string") {
				throw new Error(
					`Config error: substitutions["${goType}"] must be a non-empty, single-line string`,
				);
			}
			tsType = tsType.trim();
			if (tsType === "" || tsType.includes("\n")) {
				throw new Error(
					`Config error: substitutions["${goType}"] must be a non-empty, single-line string`,
				);
			}
			substitutions[goType] = tsType;
		}
	}
	return {
		docComment,
		preamble,
		skip,
		replacements,
		substitutions,
	};
}
