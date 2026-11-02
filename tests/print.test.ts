import { assertEquals } from "@std/assert";
import { lower } from "../src/lower.ts";
import { Parser } from "../src/parser.ts";
import { Printer, Writer } from "../src/print.ts";
import { Config } from "../src/config.ts";

Deno.test("Writer", async function (t) {
	const writer = new Writer(false, 2);

	await t.step("basic", function () {
		writer.reset();
		writer.write("foo");
		writer.write(" ");
		writer.write("bar");
		assertEquals(writer.toString(), "foo bar");
	});

	await t.step("indentation", function () {
		writer.reset();
		writer.write("foo [");
		writer.indented(() => {
			writer.newline();
			writer.write("bar [");
			writer.indented(() => {
				writer.newline();
				writer.write("baz");
			});
			writer.ensureNewline();
			writer.write("]");
		});
		writer.ensureNewline();
		writer.write("]");

		assertEquals(writer.toString(), "foo [\n  bar [\n    baz\n  ]\n]");
	});

	await t.step("deferred", function () {
		writer.reset();
		writer.write("hello");
		writer.writeDeferred(" # deferred 1");
		writer.write(";");
		writer.indented(() => {
			writer.newline();
			writer.writeDeferred(" # deferred 2");
			writer.write("baz");
			writer.writeDeferred(" deferred 3");
			writer.write(";");
		});
		writer.ensureNewline();
		writer.writeDeferred("# deferred 4");
		writer.newline();
		writer.writeDeferred("# deferred 5");
		assertEquals(writer.toString(), "hello; # deferred 1\n  baz; # deferred 2 deferred 3\n# deferred 4\n# deferred 5");
	});
});

Deno.test("Printer", async function (t) {
	const parser = new Parser();
	const printer = new Printer({ docComment: [], preamble: [], skip: [], substitutions: {} }, new Writer());
	const print = (input: string) => printer.printDeclarations(lower(parser.parse(input)));

	const lines = (...lines: string[]) => lines.join("\n");

	await t.step("named types", function () {
		assertEquals(print("type Foo int"), lines("export type Foo = number;"));
		assertEquals(print("type Foo bool"), lines("export type Foo = boolean;"));
		assertEquals(print("type Foo string"), lines("export type Foo = string;"));
		assertEquals(print("type Foo Bar"), lines("export type Foo = Bar;"));
		assertEquals(print("type Foo = Bar"), lines("export type Foo = Bar;"));
		assertEquals(print("type Foo bar.Baz"), lines("export type Foo = bar.Baz;"));
		assertEquals(print("type Foo Bar[int, string]"), lines("export type Foo = Bar<number, string>;"));
		assertEquals(print("type Foo map[string][]int"), lines("export type Foo = Record<string, number[]>;"));
	});

	await t.step("struct fields", function () {
		assertEquals(print("type Foo struct{}"), lines("export type Foo = {};"));
		assertEquals(
			print("type Foo struct { X int }"),
			lines(
				"export type Foo = {",
				"\tX: number;",
				"};",
			),
		);
		assertEquals(
			print('type Foo struct { X int `json:"x"` }'),
			lines(
				"export type Foo = {",
				"\tx: number;",
				"};",
			),
		);
		assertEquals(
			print('type Foo struct { X int `json:"x,omitempty"` }'),
			lines(
				"export type Foo = {",
				"\tx?: number;",
				"};",
			),
		);
		assertEquals(
			print('type Foo struct { X int `json:",omitempty"` }'),
			lines(
				"export type Foo = {",
				"\tX?: number;",
				"};",
			),
		);
		assertEquals(print('type Foo struct { X int `json:"-"` }'), lines("export type Foo = {};"));
		assertEquals(
			print("type Foo struct { A, B int }"),
			lines(
				"export type Foo = {",
				"\tA: number;",
				"\tB: number;",
				"};",
			),
		);
		assertEquals(
			print('type Foo struct { X int `json:"$x_1"` }'),
			lines(
				"export type Foo = {",
				"\t$x_1: number;",
				"};",
			),
		);
		assertEquals(
			print('type Foo struct { X int `json:"f-g"` }'),
			lines(
				"export type Foo = {",
				'\t"f-g": number;',
				"};",
			),
		);
		assertEquals(
			print('type Foo struct { X int `json:"1x"` }'),
			lines(
				"export type Foo = {",
				'\t"1x": number;',
				"};",
			),
		);
		assertEquals(
			print('type Foo struct { Bar `json:"bar"` }'),
			lines(
				"export type Foo = {",
				"\tbar: Bar;",
				"};",
			),
		);
		assertEquals(
			print('type Foo struct { *Bar `json:"bar"` }'),
			lines(
				"export type Foo = {",
				"\tbar: Bar | null;",
				"};",
			),
		);
	});

	await t.step("nested structs", function () {
		assertEquals(
			print(lines(
				"type Foo struct {",
				"  A struct {",
				'    B int `json:"b"`',
				'  } `json:"a"`',
				"}",
			)),
			lines(
				"export type Foo = {",
				"\ta: {",
				"\t\tb: number;",
				"\t};",
				"};",
			),
		);
		assertEquals(
			print(lines(
				"type Foo struct {",
				"  A []struct {",
				'    B int `json:"b"`',
				'  } `json:"a"`',
				"}",
			)),
			lines(
				"export type Foo = {",
				"\ta: {",
				"\t\tb: number;",
				"\t}[];",
				"};",
			),
		);
	});

	await t.step("comments", function () {
		assertEquals(
			print(lines(
				"// Foo doc",
				"type Foo int",
			)),
			lines(
				"// Foo doc",
				"export type Foo = number;",
			),
		);
		assertEquals(print("type Foo int // Foo trailing"), lines("export type Foo = number; // Foo trailing"));
		assertEquals(
			print(lines(
				"type Foo struct {",
				"  // X doc",
				"  X int // X trailing",
				"}",
			)),
			lines(
				"export type Foo = {",
				"\t// X doc",
				"\tX: number; // X trailing",
				"};",
			),
		);
		assertEquals(
			print(lines(
				"type Foo struct {",
				"  X int",
				"  // end",
				"}",
			)),
			lines(
				"export type Foo = {",
				"\tX: number;",
				"\t// end",
				"};",
			),
		);
		assertEquals(
			print(lines(
				"type Foo struct {",
				"// empty",
				"}",
			)),
			lines(
				"export type Foo = {",
				"\t// empty",
				"};",
			),
		);
		assertEquals(
			print(lines(
				"type Foo struct {",
				"  A, B int // shared",
				"}",
			)),
			lines(
				"export type Foo = {",
				"\tA: number;",
				"\tB: number; // shared",
				"};",
			),
		);
	});

	await t.step("multiple declarations", function () {
		assertEquals(
			print(lines(
				"// Foo doc",
				"type Foo int",
				"",
				"type Bar string",
			)),
			lines(
				"// Foo doc",
				"export type Foo = number;",
				"",
				"export type Bar = string;",
			),
		);
	});

	await t.step("writer options", function () {
		const spaces = new Printer({ docComment: [], preamble: [], skip: [], substitutions: {} }, new Writer(false, 2));
		assertEquals(
			spaces.printDeclarations(lower(parser.parse(lines(
				"type Foo struct {",
				"A struct { B int }",
				"}",
			)))),
			lines(
				"export type Foo = {",
				"  A: {",
				"    B: number;",
				"  };",
				"};",
			),
		);
	});

	await t.step("config", function () {
		const printWith = (options: Config, input: string) =>
			new Printer(options, new Writer()).printDeclarations(lower(parser.parse(input), options));

		assertEquals(
			printWith({
				docComment: ["first line", "second line"],
				preamble: [],
				skip: [],
				substitutions: {},
			}, ""),
			lines(
				"/*",
				" * first line",
				" * second line",
				" */",
			),
		);
		assertEquals(
			printWith({
				docComment: ["first line", "second line"],
				preamble: [],
				skip: [],
				substitutions: {},
			}, "type Foo int"),
			lines(
				"/*",
				" * first line",
				" * second line",
				" */",
				"",
				"export type Foo = number;",
			),
		);

		assertEquals(
			printWith({
				docComment: [],
				preamble: ['import * as foo from "foo.ts";'],
				skip: [],
				substitutions: {},
			}, "type Foo = foo.Foo"),
			lines(
				'import * as foo from "foo.ts";',
				"",
				"export type Foo = foo.Foo;",
			),
		);

		assertEquals(
			printWith({
				docComment: ["first line", "second line"],
				preamble: ['import * as foo from "foo.ts";'],
				skip: [],
				substitutions: {},
			}, "type Foo = foo.Foo"),
			lines(
				"/*",
				" * first line",
				" * second line",
				" */",
				"",
				'import * as foo from "foo.ts";',
				"",
				"export type Foo = foo.Foo;",
			),
		);
	});

	await t.step("substitutions", function () {
		const options: Config = {
			docComment: [],
			preamble: [],
			skip: [],
			substitutions: { "time.Duration": "number", "Local": "string | null", "opt.Option": "Maybe" },
		};
		const printWith = (input: string) => printer.printDeclarations(lower(parser.parse(input), options));
		assertEquals(printWith("type Foo []time.Duration"), lines("export type Foo = number[];"));
		assertEquals(printWith("type Foo Local"), lines("export type Foo = string | null;"));
		assertEquals(printWith("type Foo []Local"), lines("export type Foo = (string | null)[];"));
		assertEquals(printWith("type Foo *Local"), lines("export type Foo = (string | null) | null;"));
		assertEquals(printWith("type Foo opt.Option[[]*int]"), lines("export type Foo = Maybe<(number | null)[]>;"));
	});

	await t.step("embedded only struct", function () {
		assertEquals(print("type Foo struct { Embedded }"), lines("export type Foo = Embedded;"));
		assertEquals(print("type Foo struct { E1; E2 }"), lines("export type Foo = E1 & E2;"));
		assertEquals(print("type Foo []struct{ Embedded }"), lines("export type Foo = Embedded[];"));
		assertEquals(
			print(lines(
				"type Foo struct {",
				"  // about Embedded",
				"  Embedded",
				"}",
			)),
			lines(
				"export type Foo =",
				"\t// about Embedded",
				"\t& Embedded;",
			),
		);
		assertEquals(
			print(lines(
				"type Foo struct {",
				"  Embedded",
				"  // end",
				"}",
			)),
			lines(
				"export type Foo = {",
				"\t// end",
				"} & Embedded;",
			),
		);
	});

	await t.step("precedence", function () {
		assertEquals(print("type Foo []*int"), lines("export type Foo = (number | null)[];"));
		assertEquals(print("type Foo [][]*int"), lines("export type Foo = (number | null)[][];"));
		assertEquals(print("type Foo *[]int"), lines("export type Foo = number[] | null;"));
		assertEquals(print("type Foo map[string]*int"), lines("export type Foo = Record<string, number | null>;"));
		assertEquals(
			print(lines(
				"type Foo []struct {",
				"  Embedded",
				'  X int `json:"x"`',
				"}",
			)),
			lines(
				"export type Foo = ({",
				"\tx: number;",
				"} & Embedded)[];",
			),
		);
		assertEquals(
			print(lines(
				"type Foo []struct {",
				"  // about Embedded",
				"  Embedded // trailing",
				'  X int `json:"x"`',
				"}",
			)),
			lines(
				"export type Foo = (",
				"\t& {",
				"\t\tx: number;",
				"\t}",
				"\t// about Embedded",
				"\t& Embedded // trailing",
				")[];",
			),
		);
	});
});
