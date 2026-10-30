import { assertEquals, assertThrows } from "@std/assert";
import { TypeExprKind } from "../src/ir.ts";
import { lower, LowerOptions } from "../src/lower.ts";
import { Parser } from "../src/parser.ts";

Deno.test("Lower", async function (t) {
	const parser = new Parser();
	// gets type of first declaration
	const lowerType = (input: string) => lower(parser.parse(input))[0].tp;

	await t.step("interface type", function () {
		assertEquals(lowerType("type Foo interface{}"), {
			kind: TypeExprKind.Ref,
			name: "any",
			args: [],
		});
	});

	await t.step("pointer types", function () {
		assertEquals(lowerType("type Foo *bar.Baz"), {
			kind: TypeExprKind.Union,
			members: [
				{
					kind: TypeExprKind.Ref,
					name: "bar.Baz",
					args: [],
				},
				{
					kind: TypeExprKind.Ref,
					name: "null",
					args: [],
				},
			],
		});
		// flattens null union
		assertEquals(lowerType("type Foo **bar.Baz"), {
			kind: TypeExprKind.Union,
			members: [
				{
					kind: TypeExprKind.Ref,
					name: "bar.Baz",
					args: [],
				},
				{
					kind: TypeExprKind.Ref,
					name: "null",
					args: [],
				},
			],
		});
		assertEquals(lowerType("type Foo []*bar.Baz"), {
			kind: TypeExprKind.Array,
			tp: {
				kind: TypeExprKind.Union,
				members: [
					{
						kind: TypeExprKind.Ref,
						name: "bar.Baz",
						args: [],
					},
					{
						kind: TypeExprKind.Ref,
						name: "null",
						args: [],
					},
				],
			},
		});
		assertEquals(lowerType("type Foo *[]bar.Baz"), {
			kind: TypeExprKind.Union,
			members: [
				{
					kind: TypeExprKind.Array,
					tp: {
						kind: TypeExprKind.Ref,
						name: "bar.Baz",
						args: [],
					},
				},
				{
					kind: TypeExprKind.Ref,
					name: "null",
					args: [],
				},
			],
		});
	});

	await t.step("map types", function () {
		assertEquals(lowerType("type Foo map[orderedmap.Map[string, bool]][]map[uint]*time.Duration"), {
			kind: TypeExprKind.Ref,
			name: "Record",
			args: [
				{
					kind: TypeExprKind.Ref,
					name: "orderedmap.Map",
					args: [
						{ kind: TypeExprKind.Ref, name: "string", args: [] },
						{ kind: TypeExprKind.Ref, name: "boolean", args: [] }, // converted
					],
				},
				{
					kind: TypeExprKind.Array,
					tp: {
						kind: TypeExprKind.Ref,
						name: "Record",
						args: [
							{ kind: TypeExprKind.Ref, name: "number", args: [] }, // converted
							{
								kind: TypeExprKind.Union,
								members: [
									{ kind: TypeExprKind.Ref, name: "time.Duration", args: [] },
									{ kind: TypeExprKind.Ref, name: "null", args: [] },
								],
							},
						],
					},
				},
			],
		});
	});

	await t.step("struct types", async function (t) {
		await t.step("embedded only struct", function () {
			assertEquals(lowerType("type Foo struct { Embedded }"), {
				kind: TypeExprKind.Ref,
				name: "Embedded",
				args: [],
			});
			assertEquals(lowerType("type Foo struct { E1; E2 }"), {
				kind: TypeExprKind.Intersection,
				members: [
					{ leadingComments: [], tp: { kind: TypeExprKind.Ref, name: "E1", args: [] }, trailingComments: [] },
					{ leadingComments: [], tp: { kind: TypeExprKind.Ref, name: "E2", args: [] }, trailingComments: [] },
				],
			});
			assertEquals(lowerType("type Foo []struct{ Embedded }"), {
				kind: TypeExprKind.Array,
				tp: { kind: TypeExprKind.Ref, name: "Embedded", args: [] },
			});
		});

		await t.step("embedded only struct with comments", function () {
			assertEquals(lowerType("type Foo struct {\n// about Embedded\nEmbedded\n}"), {
				kind: TypeExprKind.Intersection,
				members: [{
					leadingComments: ["// about Embedded"],
					tp: { kind: TypeExprKind.Ref, name: "Embedded", args: [] },
					trailingComments: [],
				}],
			});
			assertEquals(lowerType("type Foo struct {\nEmbedded // trailing\n}"), {
				kind: TypeExprKind.Intersection,
				members: [{
					leadingComments: [],
					tp: { kind: TypeExprKind.Ref, name: "Embedded", args: [] },
					trailingComments: ["// trailing"],
				}],
			});
			assertEquals(lowerType("type Foo struct {\nEmbedded\n// end\n}"), {
				kind: TypeExprKind.Intersection,
				members: [
					{
						leadingComments: [],
						tp: { kind: TypeExprKind.Object, fields: [], endComments: ["// end"] },
						trailingComments: [],
					},
					{ leadingComments: [], tp: { kind: TypeExprKind.Ref, name: "Embedded", args: [] }, trailingComments: [] },
				],
			});
		});

		await t.step("embedded with fields", function () {
			assertEquals(lowerType("type Foo struct {\nEmbedded\nX int\n}"), {
				kind: TypeExprKind.Intersection,
				members: [
					{
						leadingComments: [],
						tp: {
							kind: TypeExprKind.Object,
							fields: [{
								leadingComments: [],
								name: "X",
								optional: false,
								tp: { kind: TypeExprKind.Ref, name: "number", args: [] },
								trailingComments: [],
							}],
							endComments: [],
						},
						trailingComments: [],
					},
					{ leadingComments: [], tp: { kind: TypeExprKind.Ref, name: "Embedded", args: [] }, trailingComments: [] },
				],
			});
		});

		await t.step("json tag semantics", function () {
			assertEquals(
				lowerType(`\
type Foo struct {
	X int \`json:"_custom_name"\`
	Y int \`json:"-"\` // completely ignored, including comments
	Z \`json:"subobject"\`
	*W \`json:"w"\`
	A int \`json:",omitempty"\`
	B \`json:",omitempty"\`
	*C \`json:",omitempty"\`
	*D \`json:"d,omitempty"\`
}`),
				{
					kind: TypeExprKind.Intersection,
					members: [{
						leadingComments: [],
						trailingComments: [],
						tp: {
							kind: TypeExprKind.Object,
							fields: [{
								leadingComments: [],
								name: "_custom_name",
								optional: false,
								tp: { kind: TypeExprKind.Ref, name: "number", args: [] },
								trailingComments: [],
							}, {
								leadingComments: [],
								name: "subobject",
								optional: false,
								tp: { kind: TypeExprKind.Ref, name: "Z", args: [] },
								trailingComments: [],
							}, {
								leadingComments: [],
								name: "w",
								optional: false,
								tp: {
									kind: TypeExprKind.Union,
									members: [
										{ kind: TypeExprKind.Ref, name: "W", args: [] },
										{ kind: TypeExprKind.Ref, name: "null", args: [] },
									],
								},
								trailingComments: [],
							}, {
								leadingComments: [],
								name: "A",
								optional: true,
								tp: { kind: TypeExprKind.Ref, name: "number", args: [] },
								trailingComments: [],
							}, {
								leadingComments: [],
								name: "d",
								optional: true,
								tp: {
									kind: TypeExprKind.Union,
									members: [
										{ kind: TypeExprKind.Ref, name: "D", args: [] },
										{ kind: TypeExprKind.Ref, name: "null", args: [] },
									],
								},
								trailingComments: [],
							}],
							endComments: [],
						},
					}, {
						leadingComments: [],
						trailingComments: [],
						tp: { kind: TypeExprKind.Ref, name: "B", args: [] },
					}, {
						leadingComments: [],
						trailingComments: [],
						tp: {
							kind: TypeExprKind.Ref,
							name: "Partial",
							args: [{ kind: TypeExprKind.Ref, name: "C", args: [] }],
						},
					}],
				},
			);
		});
	});

	await t.step("substitutions", function () {
		const options: LowerOptions = {
			substitutions: {
				"time.Duration": "number",
				"json.RawMessage": "unknown",
				"int64": "string",
				"Local": "string | null",
				"sql.NullString": "Nullable<string>",
				"toString": "string",
				"opt.Option": "Maybe",
			},
		};
		const lowerWith = (input: string) => lower(parser.parse(input), options)[0].tp;
		assertEquals(lowerWith("type Foo interface{}"), { kind: TypeExprKind.Ref, name: "any", args: [] }); // default
		assertEquals(lowerWith("type Foo time.Duration"), { kind: TypeExprKind.Ref, name: "number", args: [] });
		assertEquals(lowerWith("type Foo json.RawMessage"), { kind: TypeExprKind.Ref, name: "unknown", args: [] });
		assertEquals(lowerWith("type Foo int64"), { kind: TypeExprKind.Ref, name: "string", args: [] });
		assertEquals(lowerWith("type Foo int32"), { kind: TypeExprKind.Ref, name: "number", args: [] });
		assertEquals(lowerWith("type Foo Local"), { kind: TypeExprKind.Raw, text: "string | null" });
		assertEquals(lowerWith("type Foo sql.NullString"), { kind: TypeExprKind.Raw, text: "Nullable<string>" });
		assertEquals(lowerWith("type Foo time.Time"), { kind: TypeExprKind.Ref, name: "time.Time", args: [] });
		assertEquals(lowerWith("type Foo Duration"), { kind: TypeExprKind.Ref, name: "Duration", args: [] });
		assertEquals(lowerWith("type Foo constructor"), { kind: TypeExprKind.Ref, name: "constructor", args: [] });
		assertEquals(lowerWith("type Foo toString"), { kind: TypeExprKind.Ref, name: "string", args: [] });
		assertEquals(lowerWith("type Foo opt.Option[int]"), {
			kind: TypeExprKind.Ref,
			name: "Maybe",
			args: [{ kind: TypeExprKind.Ref, name: "number", args: [] }],
		});
		assertEquals(lowerWith("type Foo opt.Option[time.Duration]"), {
			kind: TypeExprKind.Ref,
			name: "Maybe",
			args: [{ kind: TypeExprKind.Ref, name: "number", args: [] }],
		});
		assertThrows(() => lowerWith("type Foo Local[int]"), Error, `"Local" has type arguments`);

		options.substitutions["interface"] = "unknown";
		assertEquals(lowerWith("type Foo interface{}"), { kind: TypeExprKind.Ref, name: "unknown", args: [] }); // default
	});
});
