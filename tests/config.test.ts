import { assertEquals, assertThrows } from "@std/assert";
import { Config, parseConfig } from "../src/config.ts";

Deno.test("Config", async function (t) {
	const empty: Config = { docComment: [], preamble: [], skip: [], substitutions: {} };

	await t.step("valid", function () {
		assertEquals(parseConfig("{}", empty), {
			docComment: [],
			preamble: [],
			skip: [],
			substitutions: {},
		});
		assertEquals(
			parseConfig("{}", {
				docComment: ["default doc"],
				preamble: ["default preamble"],
				skip: ["default skip"],
				substitutions: { "default": "sub" },
			}),
			{
				docComment: ["default doc"],
				preamble: ["default preamble"],
				skip: ["default skip"],
				substitutions: { "default": "sub" },
			},
		);
		assertEquals(
			parseConfig('{"docComment":"additional comment"}', {
				...empty,
				docComment: ["required doc", "lines"],
			}),
			{
				...empty,
				docComment: ["required doc", "lines", "additional comment"],
			},
		);
		assertEquals(
			parseConfig('{"docComment":["additional comment"]}', {
				...empty,
				docComment: ["required doc", "lines"],
			}),
			{
				...empty,
				docComment: ["required doc", "lines", "additional comment"],
			},
		);
		assertEquals(
			parseConfig('{"preamble":"replacement preamble"}', {
				...empty,
				preamble: ["default preamble"],
			}),
			{
				...empty,
				preamble: ["replacement preamble"],
			},
		);
		assertEquals(
			parseConfig('{"preamble":["replacement preamble"]}', {
				...empty,
				preamble: ["default preamble"],
			}),
			{
				...empty,
				preamble: ["replacement preamble"],
			},
		);
		assertEquals(
			parseConfig('{"skip":"replacement skip"}', {
				...empty,
				skip: ["default skip"],
			}),
			{
				...empty,
				skip: ["replacement skip"],
			},
		);
		assertEquals(
			parseConfig('{"skip":["replacement skip"]}', {
				...empty,
				skip: ["default skip"],
			}),
			{
				...empty,
				skip: ["replacement skip"],
			},
		);
		assertEquals(
			parseConfig('{ "substitutions": { "time.Duration": "number", "Local": " string | null " } }', empty),
			{
				docComment: [],
				preamble: [],
				skip: [],
				substitutions: { "time.Duration": "number", "Local": "string | null" },
			},
		);
	});

	await t.step("invalid", function () {
		assertThrows(() => parseConfig("not json", empty));
		assertThrows(() => parseConfig("[]", empty), Error, "expected a JSON object");
		assertThrows(
			() => parseConfig('{ "docComment": 3 }', empty),
			Error,
			`"docComment" must be a string or array of strings`,
		);
		assertThrows(
			() => parseConfig('{ "skip": ["foo", 3] }', empty),
			Error,
			`"skip" must be a string or array of strings`,
		);
		assertThrows(() => parseConfig('{ "substitutions": [] }', empty), Error, `"substitutions" must be an object`);
		assertThrows(() => parseConfig('{ "substitutions": { "Foo": 1 } }', empty), Error, `substitutions["Foo"]`);
		assertThrows(() => parseConfig('{ "substitutions": { "Foo": "" } }', empty), Error, `substitutions["Foo"]`);
		assertThrows(() => parseConfig('{ "substitutions": { "Foo": "a\\nb" } }', empty), Error, `substitutions["Foo"]`);
	});
});
