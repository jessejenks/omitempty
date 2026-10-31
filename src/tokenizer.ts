export const enum KeywordKind {
	Type,
	Struct,
	Map,
	Interface,
}

function keywordFromIdentifier(identifier: string): KeywordKind | null {
	switch (identifier) {
		case "type":
			return KeywordKind.Type;
		case "struct":
			return KeywordKind.Struct;
		case "map":
			return KeywordKind.Map;
		case "interface":
			return KeywordKind.Interface;
	}
	return null;
}

const KEYWORD_NAME: Record<KeywordKind, string> = {
	[KeywordKind.Type]: "'type'",
	[KeywordKind.Struct]: "'struct'",
	[KeywordKind.Map]: "'map'",
	[KeywordKind.Interface]: "'interface'",
};

export function keywordKindToString(kind: KeywordKind) {
	return KEYWORD_NAME[kind];
}

export const enum TokenKind {
	EOF,
	LParen,
	RParen,
	LBrace,
	RBrace,
	LBracket,
	RBracket,
	Star,
	Dot,
	Comma,
	Semi,
	Equal,
	LineComment,
	BlockComment,
	StringLiteral,
	Identifier,
	Keyword,
}

export type Identifier = { kind: TokenKind.Identifier; value: string; start: number };
export type LineComment = { kind: TokenKind.LineComment; value: string; start: number };
export type BlockComment = { kind: TokenKind.BlockComment; value: string; start: number };
export type StringLiteral = { kind: TokenKind.StringLiteral; value: string; start: number };
export type Keyword = { kind: TokenKind.Keyword; keyword: KeywordKind; start: number };
export type Semi = { kind: TokenKind.Semi; start?: number }; // start is undefined when automatically inserted
export type GeneralToken = {
	kind: Exclude<
		TokenKind,
		| TokenKind.Identifier
		| TokenKind.LineComment
		| TokenKind.BlockComment
		| TokenKind.StringLiteral
		| TokenKind.Keyword
		| TokenKind.Semi
	>;
} & { start: number };
export type Token = Identifier | LineComment | BlockComment | StringLiteral | Keyword | Semi | GeneralToken;

const TOKEN_KIND_NAME: Record<TokenKind, string> = {
	[TokenKind.EOF]: "<eof>",
	[TokenKind.LParen]: "'('",
	[TokenKind.RParen]: "')'",
	[TokenKind.LBrace]: "'{'",
	[TokenKind.RBrace]: "'}'",
	[TokenKind.LBracket]: "'['",
	[TokenKind.RBracket]: "']'",
	[TokenKind.Star]: "'*'",
	[TokenKind.Dot]: "'.'",
	[TokenKind.Comma]: "','",
	[TokenKind.Semi]: "';'",
	[TokenKind.Equal]: "'='",
	[TokenKind.LineComment]: "<line comment>",
	[TokenKind.BlockComment]: "<block comment>",
	[TokenKind.StringLiteral]: "<string literal>",
	[TokenKind.Identifier]: "<identifier>",
	[TokenKind.Keyword]: "<keyword>",
};

export function tokenKindToString(kind: TokenKind): string {
	return TOKEN_KIND_NAME[kind];
}

export function tokenToString(token: Token): string {
	switch (token.kind) {
		case TokenKind.Keyword:
			return KEYWORD_NAME[token.keyword];
		case TokenKind.Identifier:
		case TokenKind.LineComment:
		case TokenKind.StringLiteral:
			return token.value;
		default:
			return TOKEN_KIND_NAME[token.kind];
	}
}

export class Tokenizer {
	protected index: number = 0;
	protected currToken: Token | null = null;
	protected lastKind: TokenKind | null = null;
	protected input: string = "";

	setInput(input: string) {
		this.index = 0;
		this.currToken = null;
		this.lastKind = null;
		this.input = input;
	}

	setIndex(index: number) {
		this.index = index;
		this.currToken = null;
		this.lastKind = null;
	}

	getIndex(): number {
		return this.index;
	}

	hasBlankLine(from: number, to: number): boolean {
		return /\n[ \t\r]*\n/.test(this.input.slice(from, to));
	}

	peek(): Token {
		if (this.currToken === null) {
			this.currToken = this.getNextToken();
		}
		return this.currToken;
	}

	next(): Token {
		if (this.currToken === null) {
			return this.getNextToken();
		}
		const node = this.currToken;
		this.currToken = null;
		return node;
	}

	protected getNextToken(): Token {
		const token = this.scanNextToken();
		if (token.kind !== TokenKind.LineComment) {
			this.lastKind = token.kind;
		}
		return token;
	}

	protected scanNextToken(): Token {
		if (this.skipWhiteSpace()) {
			return { kind: TokenKind.Semi }; // inserted
		}

		if (this.index >= this.input.length) {
			return { kind: TokenKind.EOF, start: this.input.length };
		}

		const start = this.index;
		switch (this.char()) {
			case "(":
				this.index++;
				return { kind: TokenKind.LParen, start };
			case ")":
				this.index++;
				return { kind: TokenKind.RParen, start };
			case "{":
				this.index++;
				return { kind: TokenKind.LBrace, start };
			case "}":
				this.index++;
				return { kind: TokenKind.RBrace, start };
			case "[":
				this.index++;
				return { kind: TokenKind.LBracket, start };
			case "]":
				this.index++;
				return { kind: TokenKind.RBracket, start };
			case "*":
				this.index++;
				return { kind: TokenKind.Star, start };
			case ".":
				this.index++;
				return { kind: TokenKind.Dot, start };
			case ",":
				this.index++;
				return { kind: TokenKind.Comma, start };
			case ";":
				this.index++;
				return { kind: TokenKind.Semi, start };
			case "=":
				this.index++;
				return { kind: TokenKind.Equal, start };
			case "/":
				if (this.charPeek() === "/") {
					return this.lineComment(start);
				} else if (this.charPeek() === "*") {
					return this.blockComment(start);
				}
				break;
			case '"':
				return this.stringLiteral('"', start);
			case "'":
				return this.stringLiteral("'", start);
			case "`":
				return this.stringLiteral("`", start);
		}

		return this.identifierOrKeyword(start);
	}

	protected lineComment(start: number): LineComment {
		this.index += 2;
		while (
			this.index < this.input.length && this.char() !== "\n"
		) {
			this.index++;
		}
		return {
			kind: TokenKind.LineComment,
			value: this.input.slice(start, this.index),
			start,
		};
	}

	protected blockComment(start: number): BlockComment {
		this.index += 2;
		while (
			this.index < this.input.length
		) {
			if (this.char() === "*" && this.charPeek() === "/") {
				this.index += 2;
				break;
			}
			this.index++;
		}
		return {
			kind: TokenKind.BlockComment,
			value: this.input.slice(start, this.index),
			start,
		};
	}

	protected stringLiteral(quote: string, start: number): Token {
		this.index++;
		while (this.index < this.input.length) {
			switch (this.char()) {
				case "\\":
					this.index++;
					this.index++;
					break;
				case quote:
					this.index++;
					return {
						kind: TokenKind.StringLiteral,
						value: this.input.slice(start, this.index),
						start,
					};
				default:
					this.index++;
					break;
			}
		}
		this.croak("Tokenizer", "unterminated string literal", start);
	}

	protected identifierOrKeyword(start: number): Token {
		let c = this.char();
		if (("A" <= c && c <= "Z") || ("a" <= c && c <= "z") || c === "_") {
			this.index++;
			c = this.char();
			while (
				("A" <= c && c <= "Z") || ("a" <= c && c <= "z") ||
				("0" <= c && c <= "9") || c === "_"
			) {
				this.index++;
				c = this.char();
			}
			const value = this.input.slice(start, this.index);
			const keyword = keywordFromIdentifier(value);
			if (keyword === null) {
				return { kind: TokenKind.Identifier, value, start };
			}
			return { kind: TokenKind.Keyword, keyword, start };
		}
		this.croak("Tokenizer", `unrecognized character '${c}'`, start);
	}

	protected skipWhiteSpace(): boolean {
		while (this.index < this.input.length) {
			switch (this.char()) {
				case "\n":
					if (this.needsSemicolon()) {
						this.index++;
						return true;
					}
					/* falls through */
				case " ":
				case "\t":
				case "\r":
					this.index++;
					break;
				default:
					return false;
			}
		}
		return this.needsSemicolon();
	}

	protected needsSemicolon(): boolean {
		switch (this.lastKind) {
			case TokenKind.Identifier:
			case TokenKind.StringLiteral:
			case TokenKind.RParen:
			case TokenKind.RBracket:
			case TokenKind.RBrace:
				return true;
			default:
				return false;
		}
	}

	protected char(): string {
		return this.input[this.index];
	}

	protected charPeek(): string {
		return this.input[this.index + 1];
	}

	messageAt(msg: string, start: number, before = 0, after = 0): string {
		start = Math.min(Math.max(0, start), this.input.length - 1);
		let currentLineStartPos = 0;
		let firstLineStartPos = 0;
		let beforeCount = 0;
		for (let i = start - 1; i >= 0; i--) {
			if (this.input[i] === "\n") {
				firstLineStartPos = i + 1;
				if (beforeCount === 0) {
					currentLineStartPos = firstLineStartPos;
				}
				if (beforeCount < before) {
					firstLineStartPos = 0;
					beforeCount++;
					continue;
				}
				break;
			}
		}
		let currentLineEndPos = this.input.length;
		let lastLineEndPos = this.input.length;
		let afterCount = 0;
		for (let i = start; i < this.input.length; i++) {
			if (this.input[i] === "\n") {
				lastLineEndPos = i;
				if (afterCount === 0) {
					currentLineEndPos = lastLineEndPos;
				}
				if (afterCount < after) {
					afterCount++;
					lastLineEndPos = this.input.length;
					continue;
				}
				break;
			}
		}
		const lines: string[] = [
			`${msg} @ ${start}`,
		];
		if (firstLineStartPos < currentLineStartPos) {
			lines.push(this.input.slice(firstLineStartPos, currentLineStartPos - 1));
		}
		lines.push(
			this.input.slice(currentLineStartPos, Math.max(0, currentLineEndPos)),
			this.input.slice(currentLineStartPos, start).replaceAll(/[^\t]/g, " ") + "^", // todo proper width calculation
		);
		if (currentLineEndPos < lastLineEndPos) {
			lines.push(this.input.slice(currentLineEndPos + 1, lastLineEndPos));
		}
		return lines.join("\n");
	}

	croak(prefix: string, msg: string, start: number): never {
		throw new Error(this.messageAt(`${prefix}: ${msg}`, start));
	}
}
