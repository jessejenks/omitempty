import { assertEquals, assertThrows } from "@std/assert";
import { FieldKind, TypeExprKind } from "../src/ast.ts";
import { Parser } from "../src/parser.ts";

Deno.test("Parser", async function (t) {
	const parser = new Parser();

	await t.step("json tags", function () {
		parser.lexer.setInput('`json:"field_name"`');
		assertEquals(parser.parseTag(), { raw: '`json:"field_name"`', name: "field_name", options: [] });
		parser.lexer.setInput('`json:"field_name,omitempty"`');
		assertEquals(parser.parseTag(), {
			raw: '`json:"field_name,omitempty"`',
			name: "field_name",
			options: ["omitempty"],
		});
		parser.lexer.setInput("nontag");
		assertEquals(parser.parseTag(), null);
	});

	await t.step("field declaration", async function (t) {
		await t.step("struct fields", function () {
			parser.lexer.setInput("Name string");
			assertEquals(parser.parseFieldDeclaration(["leading comment"]), {
				kind: FieldKind.Struct,
				leadingComments: ["leading comment"],
				names: ["Name"],
				tp: { kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
				tag: null,
				trailingComments: [],
			});
			parser.lexer.setInput("a, b, c string");
			assertEquals(parser.parseFieldDeclaration([]), {
				kind: FieldKind.Struct,
				leadingComments: [],
				names: ["a", "b", "c"],
				tp: { kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
				tag: null,
				trailingComments: [],
			});
			parser.lexer.setInput('Name map[string][]int `json:"_real_name"`');
			assertEquals(parser.parseFieldDeclaration([]), {
				kind: FieldKind.Struct,
				leadingComments: [],
				names: ["Name"],
				tp: {
					kind: TypeExprKind.Map,
					key: { kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
					value: { kind: TypeExprKind.Slice, tp: { kind: TypeExprKind.Named, pkg: null, name: "int", args: [] } },
				},
				tag: { raw: '`json:"_real_name"`', name: "_real_name", options: [] },
				trailingComments: [],
			});
		});

		await t.step("embedded field", function () {
			parser.lexer.setInput("*Name");
			assertEquals(parser.parseFieldDeclaration([]), {
				kind: FieldKind.Embedded,
				leadingComments: [],
				isPointer: true,
				name: { kind: TypeExprKind.Named, pkg: null, name: "Name", args: [] },
				tag: null,
				trailingComments: [],
			});

			parser.lexer.setInput("Name\n");
			assertEquals(parser.parseFieldDeclaration([]), {
				kind: FieldKind.Embedded,
				leadingComments: [],
				isPointer: false,
				name: { kind: TypeExprKind.Named, pkg: null, name: "Name", args: [] },
				tag: null,
				trailingComments: [],
			});

			// equivalent to above
			parser.lexer.setInput("Name;");
			assertEquals(parser.parseFieldDeclaration([]), {
				kind: FieldKind.Embedded,
				leadingComments: [],
				isPointer: false,
				name: { kind: TypeExprKind.Named, pkg: null, name: "Name", args: [] },
				tag: null,
				trailingComments: [],
			});

			parser.lexer.setInput("Name }");
			assertEquals(parser.parseFieldDeclaration([]), {
				kind: FieldKind.Embedded,
				leadingComments: [],
				isPointer: false,
				name: { kind: TypeExprKind.Named, pkg: null, name: "Name", args: [] },
				tag: null,
				trailingComments: [],
			});

			parser.lexer.setInput("foo.Name");
			assertEquals(parser.parseFieldDeclaration([]), {
				kind: FieldKind.Embedded,
				leadingComments: [],
				isPointer: false,
				name: { kind: TypeExprKind.Named, pkg: "foo", name: "Name", args: [] },
				tag: null,
				trailingComments: [],
			});

			parser.lexer.setInput('Name `json:"sub_object"`');
			assertEquals(parser.parseFieldDeclaration([]), {
				kind: FieldKind.Embedded,
				leadingComments: [],
				isPointer: false,
				name: { kind: TypeExprKind.Named, pkg: null, name: "Name", args: [] },
				tag: { raw: '`json:"sub_object"`', name: "sub_object", options: [] },
				trailingComments: [],
			});
		});
	});

	await t.step("type expressions", async function (t) {
		await t.step("named type", function () {
			parser.lexer.setInput("uint8");
			assertEquals(parser.parseNamedType(), { kind: TypeExprKind.Named, pkg: null, name: "uint8", args: [] });
			parser.lexer.setInput("time.Duration");
			assertEquals(parser.parseNamedType(), { kind: TypeExprKind.Named, pkg: "time", name: "Duration", args: [] });
			parser.lexer.setInput("orderedmap.Map[string, int]");
			assertEquals(parser.parseNamedType(), {
				kind: TypeExprKind.Named,
				pkg: "orderedmap",
				name: "Map",
				args: [
					{ kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
					{ kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
				],
			});
		});

		await t.step("slice type", function () {
			parser.lexer.setInput("[]uint8");
			assertEquals(parser.parseSliceType(), {
				kind: TypeExprKind.Slice,
				tp: { kind: TypeExprKind.Named, pkg: null, name: "uint8", args: [] },
			});
			parser.lexer.setInput("[]time.Duration");
			assertEquals(parser.parseSliceType(), {
				kind: TypeExprKind.Slice,
				tp: { kind: TypeExprKind.Named, pkg: "time", name: "Duration", args: [] },
			});
			parser.lexer.setInput("[]orderedmap.Map[string, int]");
			assertEquals(parser.parseSliceType(), {
				kind: TypeExprKind.Slice,
				tp: {
					kind: TypeExprKind.Named,
					pkg: "orderedmap",
					name: "Map",
					args: [
						{ kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
						{ kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
					],
				},
			});
			parser.lexer.setInput("[]*foo.Bar");
			assertEquals(parser.parseSliceType(), {
				kind: TypeExprKind.Slice,
				tp: {
					kind: TypeExprKind.Pointer,
					tp: { kind: TypeExprKind.Named, pkg: "foo", name: "Bar", args: [] },
				},
			});
		});

		await t.step("pointer type", function () {
			parser.lexer.setInput("*uint8");
			assertEquals(parser.parsePointerType(), {
				kind: TypeExprKind.Pointer,
				tp: { kind: TypeExprKind.Named, pkg: null, name: "uint8", args: [] },
			});
			parser.lexer.setInput("*time.Duration");
			assertEquals(parser.parsePointerType(), {
				kind: TypeExprKind.Pointer,
				tp: { kind: TypeExprKind.Named, pkg: "time", name: "Duration", args: [] },
			});
			parser.lexer.setInput("*orderedmap.Map[string, int]");
			assertEquals(parser.parsePointerType(), {
				kind: TypeExprKind.Pointer,
				tp: {
					kind: TypeExprKind.Named,
					pkg: "orderedmap",
					name: "Map",
					args: [
						{ kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
						{ kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
					],
				},
			});
			parser.lexer.setInput("*[]foo.Bar");
			assertEquals(parser.parsePointerType(), {
				kind: TypeExprKind.Pointer,
				tp: {
					kind: TypeExprKind.Slice,
					tp: { kind: TypeExprKind.Named, pkg: "foo", name: "Bar", args: [] },
				},
			});
		});

		await t.step("map type", function () {
			parser.lexer.setInput("map[uint8]string");
			assertEquals(parser.parseMapType(), {
				kind: TypeExprKind.Map,
				key: { kind: TypeExprKind.Named, pkg: null, name: "uint8", args: [] },
				value: { kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
			});
			parser.lexer.setInput("map[string]*time.Duration");
			assertEquals(parser.parseMapType(), {
				kind: TypeExprKind.Map,
				key: { kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
				value: {
					kind: TypeExprKind.Pointer,
					tp: { kind: TypeExprKind.Named, pkg: "time", name: "Duration", args: [] },
				},
			});
			parser.lexer.setInput("map[orderedmap.Map[string, bool]][]map[uint]*time.Duration");
			assertEquals(parser.parseMapType(), {
				kind: TypeExprKind.Map,
				key: {
					kind: TypeExprKind.Named,
					pkg: "orderedmap",
					name: "Map",
					args: [
						{ kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
						{ kind: TypeExprKind.Named, pkg: null, name: "bool", args: [] },
					],
				},
				value: {
					kind: TypeExprKind.Slice,
					tp: {
						kind: TypeExprKind.Map,
						key: { kind: TypeExprKind.Named, pkg: null, name: "uint", args: [] },
						value: {
							kind: TypeExprKind.Pointer,
							tp: { kind: TypeExprKind.Named, pkg: "time", name: "Duration", args: [] },
						},
					},
				},
			});
		});
		parser.lexer.setInput("(((map[orderedmap.Map[string, int]][]map[int]*time.Duration)))");
		assertEquals(parser.parseType(), {
			kind: TypeExprKind.Map,
			key: {
				kind: TypeExprKind.Named,
				pkg: "orderedmap",
				name: "Map",
				args: [
					{ kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
					{ kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
				],
			},
			value: {
				kind: TypeExprKind.Slice,
				tp: {
					kind: TypeExprKind.Map,
					key: { kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
					value: {
						kind: TypeExprKind.Pointer,
						tp: { kind: TypeExprKind.Named, pkg: "time", name: "Duration", args: [] },
					},
				},
			},
		});

		await t.step("struct type", function () {
			parser.lexer.setInput("struct {}");
			assertEquals(parser.parseStructType(), {
				kind: TypeExprKind.Struct,
				fields: [],
				endComments: [],
			});
			parser.lexer.setInput("struct {// empty with comment\n}");
			assertEquals(parser.parseStructType(), {
				kind: TypeExprKind.Struct,
				fields: [],
				endComments: ["empty with comment"],
			});
			parser.lexer.setInput("struct { X int }");
			assertEquals(parser.parseStructType(), {
				kind: TypeExprKind.Struct,
				fields: [{
					kind: FieldKind.Struct,
					leadingComments: [],
					names: ["X"],
					tp: { kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
					tag: null,
					trailingComments: [],
				}],
				endComments: [],
			});
			parser.lexer.setInput("struct { // captured by X\n  X int // captured by X\n  // end comments \n}");
			assertEquals(parser.parseStructType(), {
				kind: TypeExprKind.Struct,
				fields: [{
					kind: FieldKind.Struct,
					leadingComments: ["captured by X"],
					names: ["X"],
					tp: { kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
					tag: null,
					trailingComments: ["captured by X"],
				}],
				endComments: ["end comments"],
			});
			parser.lexer.setInput(
				"struct { // captured by X\n  X int\n  // captured by Y\n  Y string // captured by Y \n}",
			);
			assertEquals(parser.parseStructType(), {
				kind: TypeExprKind.Struct,
				fields: [{
					kind: FieldKind.Struct,
					leadingComments: ["captured by X"],
					names: ["X"],
					tp: { kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
					tag: null,
					trailingComments: [],
				}, {
					kind: FieldKind.Struct,
					leadingComments: ["captured by Y"],
					names: ["Y"],
					tp: { kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
					tag: null,
					trailingComments: ["captured by Y"],
				}],
				endComments: [],
			});
			parser.lexer.setInput(`\
				struct {
					X int
					Y
					Z string \`json:"z,omitempty"\`
					W \`json:"w"\`
				}`);
			assertEquals(parser.parseStructType(), {
				kind: TypeExprKind.Struct,
				fields: [{
					kind: FieldKind.Struct,
					leadingComments: [],
					names: ["X"],
					tp: { kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
					tag: null,
					trailingComments: [],
				}, {
					kind: FieldKind.Embedded,
					leadingComments: [],
					isPointer: false,
					name: { kind: TypeExprKind.Named, pkg: null, name: "Y", args: [] },
					tag: null,
					trailingComments: [],
				}, {
					kind: FieldKind.Struct,
					leadingComments: [],
					names: ["Z"],
					tp: { kind: TypeExprKind.Named, pkg: null, name: "string", args: [] },
					tag: { raw: '`json:"z,omitempty"`', name: "z", options: ["omitempty"] },
					trailingComments: [],
				}, {
					kind: FieldKind.Embedded,
					leadingComments: [],
					isPointer: false,
					name: { kind: TypeExprKind.Named, pkg: null, name: "W", args: [] },
					tag: { raw: '`json:"w"`', name: "w", options: [] },
					trailingComments: [],
				}],
				endComments: [],
			});
		});
	});

	await t.step("type declarations", function () {
		assertEquals(
			parser.parse(`\
// DO NOT EDIT
// Copyright 2026

// Foo is used for XYZ purpose
type Foo struct{} // this is attached to this declaration

// but this is not
type Bar []uintptr

type Baz map[foo.Bar]struct{ X; Y int; Z; foo.W }

type Alias = Bar
	`),
			[{
				leadingComments: ["Foo is used for XYZ purpose"],
				name: "Foo",
				params: [],
				isAlias: false,
				tp: { kind: TypeExprKind.Struct, fields: [], endComments: [] },
				trailingComments: ["this is attached to this declaration"],
			}, {
				leadingComments: ["but this is not"],
				name: "Bar",
				params: [],
				isAlias: false,
				tp: { kind: TypeExprKind.Slice, tp: { kind: TypeExprKind.Named, pkg: null, name: "uintptr", args: [] } },
				trailingComments: [],
			}, {
				leadingComments: [],
				name: "Baz",
				params: [],
				isAlias: false,
				tp: {
					kind: TypeExprKind.Map,
					key: { kind: TypeExprKind.Named, pkg: "foo", name: "Bar", args: [] },
					value: {
						kind: TypeExprKind.Struct,
						fields: [
							{
								kind: FieldKind.Embedded,
								leadingComments: [],
								isPointer: false,
								name: { kind: TypeExprKind.Named, pkg: null, name: "X", args: [] },
								tag: null,
								trailingComments: [],
							},
							{
								kind: FieldKind.Struct,
								leadingComments: [],
								names: ["Y"],
								tp: { kind: TypeExprKind.Named, pkg: null, name: "int", args: [] },
								tag: null,
								trailingComments: [],
							},
							{
								kind: FieldKind.Embedded,
								leadingComments: [],
								isPointer: false,
								name: { kind: TypeExprKind.Named, pkg: null, name: "Z", args: [] },
								tag: null,
								trailingComments: [],
							},
							{
								kind: FieldKind.Embedded,
								leadingComments: [],
								isPointer: false,
								name: { kind: TypeExprKind.Named, pkg: "foo", name: "W", args: [] },
								tag: null,
								trailingComments: [],
							},
						],
						endComments: [],
					},
				},
				trailingComments: [],
			}, {
				leadingComments: [],
				name: "Alias",
				params: [],
				isAlias: true,
				tp: { kind: TypeExprKind.Named, pkg: null, name: "Bar", args: [] },
				trailingComments: [],
			}],
		);
	});

	await t.step("parse errors", function () {
		// unsupported syntax
		assertThrows(() => parser.parse("type ( Foo int )"));
		assertThrows(() => parser.parse("type Foo[S ~[]E, E any] = int"));

		assertThrows(
			() => {
				parser.parse("type struct");
			},
			Error,
			"Parse: expected <identifier> but got 'struct' @",
		);

		assertThrows(
			() => {
				parser.parse("type Foo ( int");
			},
			Error,
			"Parse: unclosed parentheses @",
		);

		assertThrows(
			() => {
				parser.parse("type Foo type");
			},
			Error,
			"Parse: unexpected keyword 'type' @",
		);

		assertThrows(
			() => {
				parser.parse("type Foo )");
			},
			Error,
			"Parse: expected type expression @",
		);

		assertThrows(
			() => {
				parser.parse("type Foo\n");
			},
			Error,
			"Parse: expected type expression @",
		);

		assertThrows(
			() => {
				parser.parse("type Foo struct { *bar) }");
			},
			Error,
			"Parse: expected an embedded field @",
		);

		assertThrows(
			() => {
				parser.parse('type Foo struct { X int `bigquery:",nullable"`) }');
			},
			Error,
			"Parse: field tag was not a json field tag '`bigquery:\",nullable\"`' @",
		);

		assertThrows(
			() => {
				parser.lexer.setInput("map[int]string");
				parser.parseStructType();
			},
			Error,
			"Parse: expected 'struct' but got 'map' @",
		);

		assertThrows(
			() => {
				parser.lexer.setInput("struct { }");
				parser.parseMapType();
			},
			Error,
			"Parse: expected 'map' but got 'struct' @",
		);
	});
});
