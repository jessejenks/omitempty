import { assertEquals, assertThrows } from "@std/assert";
import { parseConfig } from "../src/config.ts";

Deno.test("Config", async function (t) {
	await t.step("valid", function () {
		assertEquals(parseConfig("{}"), { substitutions: {} });
		assertEquals(
			parseConfig('{ "substitutions": { "time.Duration": "number", "Local": " string | null " } }'),
			{ substitutions: { "time.Duration": "number", "Local": "string | null" } },
		);
	});

	await t.step("invalid", function () {
		assertThrows(() => parseConfig("not json"));
		assertThrows(() => parseConfig("[]"), Error, "expected a JSON object");
		assertThrows(() => parseConfig('{ "substitutions": [] }'), Error, `"substitutions" must be an object`);
		assertThrows(() => parseConfig('{ "substitutions": { "Foo": 1 } }'), Error, `substitutions["Foo"]`);
		assertThrows(() => parseConfig('{ "substitutions": { "Foo": "" } }'), Error, `substitutions["Foo"]`);
		assertThrows(() => parseConfig('{ "substitutions": { "Foo": "a\\nb" } }'), Error, `substitutions["Foo"]`);
	});
});
