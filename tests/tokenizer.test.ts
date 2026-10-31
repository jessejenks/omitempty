import { assertEquals, assertThrows } from "@std/assert";
import { KeywordKind, Semi, Token, Tokenizer, TokenKind } from "../src/tokenizer.ts";

Deno.test("Tokenizer", async function (t) {
	const tokenizer = new Tokenizer();

	await t.step("tokenizes", function () {
		tokenizer.setInput(`\
	() {} [] * . , ; // comment (){}[]*.,;
	// another comment
	"arbitrary string \\" with escapes"
	'arbitrary string \\' with escapes'
	\`arbitrary string \\\` with escapes\`
	\`json:""\`
	\`json:"field_tag"\`
	\`json:"field_tag,omitempty"\`
	type
	struct
	map
	interface
	identifier
	identifier123_foo
	// trailing comment
	/*
	 * block
	 * comment
	 */
`);

		const expected: Token[] = [
			{ kind: TokenKind.LParen, start: 1 },
			{ kind: TokenKind.RParen, start: 2 },
			{ kind: TokenKind.LBrace, start: 4 },
			{ kind: TokenKind.RBrace, start: 5 },
			{ kind: TokenKind.LBracket, start: 7 },
			{ kind: TokenKind.RBracket, start: 8 },
			{ kind: TokenKind.Star, start: 10 },
			{ kind: TokenKind.Dot, start: 12 },
			{ kind: TokenKind.Comma, start: 14 },
			{ kind: TokenKind.Semi, start: 16 },
			{ kind: TokenKind.LineComment, value: "// comment (){}[]*.,;", start: 18 },
			{ kind: TokenKind.LineComment, value: "// another comment", start: 41 },
			{ kind: TokenKind.StringLiteral, value: `"arbitrary string \\" with escapes"`, start: 61 },
			{ kind: TokenKind.Semi }, // inserted
			{ kind: TokenKind.StringLiteral, value: `'arbitrary string \\' with escapes'`, start: 97 },
			{ kind: TokenKind.Semi }, // inserted
			{ kind: TokenKind.StringLiteral, value: "`arbitrary string \\` with escapes`", start: 133 },
			{ kind: TokenKind.Semi }, // inserted
			{ kind: TokenKind.StringLiteral, value: '`json:""`', start: 169 },
			{ kind: TokenKind.Semi }, // inserted
			{ kind: TokenKind.StringLiteral, value: '`json:"field_tag"`', start: 180 },
			{ kind: TokenKind.Semi }, // inserted
			{ kind: TokenKind.StringLiteral, value: '`json:"field_tag,omitempty"`', start: 200 },
			{ kind: TokenKind.Semi }, // inserted
			{ kind: TokenKind.Keyword, keyword: KeywordKind.Type, start: 230 },
			{ kind: TokenKind.Keyword, keyword: KeywordKind.Struct, start: 236 },
			{ kind: TokenKind.Keyword, keyword: KeywordKind.Map, start: 244 },
			{ kind: TokenKind.Keyword, keyword: KeywordKind.Interface, start: 249 },
			{ kind: TokenKind.Identifier, value: "identifier", start: 260 },
			{ kind: TokenKind.Semi }, // inserted
			{ kind: TokenKind.Identifier, value: "identifier123_foo", start: 272 },
			{ kind: TokenKind.Semi }, // inserted
			{ kind: TokenKind.LineComment, value: "// trailing comment", start: 291 },
			{ kind: TokenKind.BlockComment, value: "/*\n\t * block\n\t * comment\n\t */", start: 312 },
			{ kind: TokenKind.EOF, start: 342 },
			{ kind: TokenKind.EOF, start: 342 },
			{ kind: TokenKind.EOF, start: 342 },
		];

		const actual = new Array<Token>(expected.length);
		for (let i = 0; i < expected.length; i++) {
			assertEquals(tokenizer.peek(), expected[i]);
			actual[i] = tokenizer.next();
		}
		assertEquals(actual, expected);
	});

	await t.step("reports errors", function () {
		tokenizer.setInput(`\
type PerfectlyValid struct {
\t123invalid
"unterminated
/ not a comment
}`);
		const expected: Token[] = [
			{ kind: TokenKind.Keyword, keyword: KeywordKind.Type, start: 0 },
			{ kind: TokenKind.Identifier, value: "PerfectlyValid", start: 5 },
			{ kind: TokenKind.Keyword, keyword: KeywordKind.Struct, start: 20 },
			{ kind: TokenKind.LBrace, start: 27 },
		];
		for (let i = 0; i < expected.length; i++) {
			assertEquals(tokenizer.next(), expected[i]);
		}
		assertThrows(() => tokenizer.next(), "Tokenizer: unrecognized character '1' @");

		tokenizer.setIndex(40);
		assertThrows(() => tokenizer.next(), "Tokenizer: unterminated string literal @");

		tokenizer.setIndex(54);
		assertThrows(() => tokenizer.next(), "Tokenizer: unrecognized character '/' @");
	});

	await t.step("error message formatting", function () {
		tokenizer.setInput([
			"tok1 // comment",
			"  /* first",
			"   * second",
			"   */",
			"  tok2 { tok3 } \ttok4",
			"\ttok5",
			" \t tok6",
		].join("\n"));
		const tokens: Exclude<Token, Semi>[] = [];
		while (tokenizer.peek().kind !== TokenKind.EOF) {
			const tok = tokenizer.next();
			if (tok.kind === TokenKind.Semi) {
				continue;
			}
			tokens.push(tok);
		}

		assertEquals(
			tokenizer.messageAt("message", tokens[0].start, 0, 0),
			[
				"message @ 0",
				"tok1 // comment",
				"^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[1].start, 0, 0),
			[
				"message @ 5",
				"tok1 // comment",
				"     ^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[2].start, 0, 0),
			[
				"message @ 18",
				"  /* first",
				"  ^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[2].start + 14, 1, 1),
			[
				"message @ 32",
				"  /* first",
				"   * second",
				"     ^",
				"   */",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[3].start, 0, 0),
			[
				"message @ 47",
				"  tok2 { tok3 } \ttok4",
				"  ^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[4].start, 0, 0),
			[
				"message @ 52",
				"  tok2 { tok3 } \ttok4",
				"       ^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[5].start, 0, 0),
			[
				"message @ 54",
				"  tok2 { tok3 } \ttok4",
				"         ^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[6].start, 0, 0),
			[
				"message @ 59",
				"  tok2 { tok3 } \ttok4",
				"              ^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[7].start, 0, 0),
			[
				"message @ 62",
				"  tok2 { tok3 } \ttok4",
				"                \t^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[8].start, 0, 0),
			[
				"message @ 68",
				"\ttok5",
				"\t^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[9].start, 0, 0),
			[
				"message @ 76",
				" \t tok6",
				" \t ^",
			].join("\n"),
		);
		assertEquals(
			tokenizer.messageAt("message", tokens[9].start + 20, 0, 0),
			[
				"message @ 79",
				" \t tok6",
				" \t    ^",
			].join("\n"),
		);
	});
});
