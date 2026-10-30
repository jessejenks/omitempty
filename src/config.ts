import { LowerOptions } from "./lower.ts";

export type Config = LowerOptions;

export function parseConfig(text: string): Config {
	const json: unknown = JSON.parse(text);
	if (typeof json !== "object" || json === null || Array.isArray(json)) {
		throw new Error("Config error: expected a JSON object");
	}
	const substitutions: Record<string, string> = {};
	if ("substitutions" in json) {
		const subs = json.substitutions;
		if (typeof subs !== "object" || subs === null || Array.isArray(subs)) {
			throw new Error(`Config error: "substitutions" must be an object`);
		}
		for (let [goType, tsType] of Object.entries(subs)) {
			if (typeof tsType !== "string") {
				throw new Error(
					`Config error: substitutions["${goType}"] must be a non-empty, single-line string`,
				);
			}
			tsType = tsType.trim();
			if (tsType === "" || tsType.includes("\n")) {
				throw new Error(
					`Config error: substitutions["${goType.replaceAll("\n", "\\n")}"] must be a non-empty, single-line string`,
				);
			}
			substitutions[goType] = tsType;
		}
	}
	return { substitutions };
}
