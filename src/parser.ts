import {
	EmbeddedField,
	Field,
	FieldKind,
	InterfaceType,
	MapType,
	NamedType,
	PointerType,
	SliceType,
	StructType,
	Tag,
	TypeDecl,
	TypeExpr,
	TypeExprKind,
} from "./ast.ts";
import {
	Identifier,
	KeywordKind,
	keywordKindToString,
	Token,
	Tokenizer,
	TokenKind,
	tokenKindToString,
	tokenToString,
} from "./tokenizer.ts";

export class Parser {
	input: string = "";
	lexer: Tokenizer = new Tokenizer();

	protected expect<K extends TokenKind>(kind: K, msg?: string): Token & { kind: K } {
		const tok = this.lexer.next();
		if (tok.kind !== kind) {
			this.lexer.croak(
				"Parse",
				msg ?? `expected ${tokenKindToString(kind)} but got ${tokenToString(tok)}`,
				tok.start ?? this.lexer.getIndex(),
			);
		}
		return tok as Token & { kind: K };
	}

	protected expectKeyword<K extends KeywordKind>(
		kw: K,
	): Token & { kind: TokenKind.Keyword; keyword: K } {
		const keywordTok = this.expect(TokenKind.Keyword);
		if (keywordTok.keyword !== kw) {
			this.lexer.croak(
				"Parse",
				`expected ${keywordKindToString(kw)} but got ${keywordKindToString(keywordTok.keyword)}`,
				keywordTok.start,
			);
		}
		return keywordTok as Token & { kind: TokenKind.Keyword; keyword: K };
	}

	protected chompIfNextIs(kind: TokenKind): boolean {
		if (this.lexer.peek().kind === kind) {
			this.lexer.next();
			return true;
		}
		return false;
	}

	protected readIfNextIs<K extends TokenKind>(
		kind: K,
	): (Token & { kind: K }) | undefined {
		if (this.lexer.peek().kind === kind) {
			return this.lexer.next() as (Token & { kind: K });
		}
		return undefined;
	}

	protected captureComments(): string[] {
		let comments: string[] = [];
		let tok = this.lexer.peek();
		while (tok.kind === TokenKind.LineComment || tok.kind === TokenKind.BlockComment) {
			this.lexer.next();
			comments.push(tok.value);
			const end = tok.start + tok.value.length;
			tok = this.lexer.peek();
			// a blank line detaches the comments so far from whatever comes next
			if (tok.start !== undefined && this.lexer.hasBlankLine(end, tok.start)) {
				comments = [];
			}
		}
		return comments;
	}

	parse(input: string): TypeDecl[] {
		this.input = input;
		this.lexer.setInput(input);
		const decls: TypeDecl[] = [];
		const pattern = /^([\t ]*\/\/|type)/gm;
		let match: RegExpExecArray | null = null;
		while ((match = pattern.exec(input)) !== null) {
			this.lexer.setIndex(match.index);
			const leadingComments = this.captureComments();
			const tok = this.lexer.peek();
			if (
				tok.kind === TokenKind.Keyword &&
				tok.keyword === KeywordKind.Type
			) {
				this.lexer.next();
				const peek = this.lexer.peek();
				switch (peek.kind) {
					case TokenKind.LParen:
						decls.push(...this.parseGroupedTypeDeclaration(leadingComments));
						break;
					case TokenKind.Identifier:
						decls.push(this.parseTypeDeclaration(leadingComments));
						break;
					default:
						this.lexer.croak("Parse", `unexpected token ${tokenToString(peek)}`, peek.start!);
				}
				pattern.lastIndex = this.lexer.getIndex();
			}
			continue;
		}
		return decls;
	}

	parseGroupedTypeDeclaration(leadingComments: string[]): TypeDecl[] {
		this.expect(TokenKind.LParen);
		const decls = [this.parseTypeDeclaration(leadingComments)];
		while (this.chompIfNextIs(TokenKind.Semi)) {
			if (this.lexer.peek().kind === TokenKind.RParen) {
				break;
			}
			decls.push(this.parseTypeDeclaration([]));
		}
		this.expect(TokenKind.RParen);
		return decls;
	}

	parseTypeDeclaration(leadingComments: string[]): TypeDecl {
		const name = this.expect(TokenKind.Identifier);
		// params not supported
		const isAlias = this.chompIfNextIs(TokenKind.Equal);
		return {
			leadingComments,
			name: name.value,
			params: [],
			isAlias,
			tp: this.parseType(),
			trailingComments: this.captureComments(),
		};
	}

	parseType(): TypeExpr {
		const tok = this.lexer.peek();
		switch (tok.kind) {
			case TokenKind.Identifier:
				return this.parseNamedType();
			case TokenKind.LBracket:
				return this.parseSliceType();
			case TokenKind.Star:
				return this.parsePointerType();
			// deno-lint-ignore no-fallthrough
			case TokenKind.Keyword:
				switch (tok.keyword) {
					case KeywordKind.Interface:
						return this.parseInterfaceType();
					case KeywordKind.Map:
						return this.parseMapType();
					case KeywordKind.Struct:
						return this.parseStructType();
					case KeywordKind.Type:
						this.lexer.croak("Parse", `unexpected keyword 'type'`, tok.start);
				}
			case TokenKind.LParen: {
				this.lexer.next();
				const inner = this.parseType();
				this.expect(TokenKind.RParen, "unclosed parentheses");
				return inner;
			}
			default:
				this.lexer.croak("Parse", "expected type expression", tok.start ?? this.lexer.getIndex());
		}
	}

	parseNamedType(): NamedType {
		const first = this.expect(TokenKind.Identifier);
		if (this.lexer.peek().kind === TokenKind.Dot) {
			this.lexer.next();
			const second = this.expect(TokenKind.Identifier);
			return {
				kind: TypeExprKind.Named,
				pkg: first.value,
				name: second.value,
				args: this.parseTypeArgs(),
			};
		}
		return {
			kind: TypeExprKind.Named,
			pkg: null,
			name: first.value,
			args: this.parseTypeArgs(),
		};
	}

	parseSliceType(): SliceType {
		this.expect(TokenKind.LBracket);
		this.expect(TokenKind.RBracket);
		return { kind: TypeExprKind.Slice, tp: this.parseType() };
	}

	parsePointerType(): PointerType {
		this.expect(TokenKind.Star);
		return { kind: TypeExprKind.Pointer, tp: this.parseType() };
	}

	parseInterfaceType(): InterfaceType {
		this.expectKeyword(KeywordKind.Interface);
		this.expect(TokenKind.LBrace);
		this.expect(TokenKind.RBrace);
		return { kind: TypeExprKind.Interface };
	}

	parseMapType(): MapType {
		this.expectKeyword(KeywordKind.Map);
		this.expect(TokenKind.LBracket);
		const kType = this.parseType();
		this.expect(TokenKind.RBracket);
		const vType = this.parseType();
		return {
			kind: TypeExprKind.Map,
			key: kType,
			value: vType,
		};
	}

	parseStructType(): StructType {
		const fields: Field[] = [];
		this.expectKeyword(KeywordKind.Struct);
		this.expect(TokenKind.LBrace);
		let endComments: string[] = [];
		while (this.lexer.peek().kind !== TokenKind.RBrace) {
			const leadingComments = this.captureComments();
			if (this.lexer.peek().kind === TokenKind.RBrace) {
				endComments = leadingComments;
				break;
			}
			fields.push(this.parseFieldDeclaration(leadingComments));
			if (!this.chompIfNextIs(TokenKind.Semi)) break;
		}
		this.expect(TokenKind.RBrace);
		return { kind: TypeExprKind.Struct, fields, endComments };
	}

	parseFieldDeclaration(leadingComments: string[]): Field {
		if (this.lexer.peek().kind === TokenKind.Star) {
			return this.parseEmbeddedField(leadingComments);
		}
		const first = this.expect(TokenKind.Identifier);
		switch (this.lexer.peek().kind) {
			case TokenKind.Dot:
			case TokenKind.Semi:
			case TokenKind.RBrace:
			case TokenKind.StringLiteral:
			case TokenKind.LineComment:
			case TokenKind.BlockComment:
				return this.parseEmbeddedField(leadingComments, first);
			default: {
				const names = [first.value];
				while (this.chompIfNextIs(TokenKind.Comma)) {
					names.push(this.expect(TokenKind.Identifier).value);
				}
				return {
					kind: FieldKind.Struct,
					names,
					tp: this.parseType(),
					tag: this.parseTag(),
					leadingComments,
					trailingComments: this.captureComments(),
				};
			}
		}
	}

	parseEmbeddedField(
		leadingComments: string[],
		first?: Identifier,
	): EmbeddedField {
		let isPointer = false;
		if (first === undefined) {
			this.expect(TokenKind.Star);
			isPointer = true;
			first = this.expect(TokenKind.Identifier);
		}
		const tok = this.lexer.peek();
		switch (tok.kind) {
			case TokenKind.Dot: {
				this.lexer.next();
				const second = this.expect(TokenKind.Identifier);
				return {
					kind: FieldKind.Embedded,
					isPointer,
					name: {
						kind: TypeExprKind.Named,
						pkg: first!.value,
						name: second.value,
						args: this.parseTypeArgs(),
					},
					tag: this.parseTag(),
					leadingComments,
					trailingComments: this.captureComments(),
				};
			}
			case TokenKind.Semi:
			case TokenKind.RBrace:
			case TokenKind.StringLiteral:
			case TokenKind.LineComment:
			case TokenKind.BlockComment:
				return {
					kind: FieldKind.Embedded,
					isPointer,
					name: {
						kind: TypeExprKind.Named,
						pkg: null,
						name: first!.value,
						args: this.parseTypeArgs(),
					},
					tag: this.parseTag(),
					leadingComments,
					trailingComments: this.captureComments(),
				};
			default:
				this.lexer.croak("Parse", "expected an embedded field", first!.start);
		}
	}

	parseTag(): Tag | null {
		const tag = this.readIfNextIs(TokenKind.StringLiteral);
		if (!tag) return null;
		const pattern = /json:"([^"]*)"/;
		const match = pattern.exec(tag.value);
		if (!match) {
			this.lexer.croak("Parse", `field tag was not a json field tag '${tag.value.replaceAll("'", "\\'")}'`, tag.start);
		}
		const [name, ...options] = match[1].split(",");
		return { raw: tag.value, name, options };
	}

	parseTypeArgs(): TypeExpr[] {
		if (this.lexer.peek().kind !== TokenKind.LBracket) {
			return [];
		}
		this.lexer.next();
		const args = [this.parseType()];
		while (this.chompIfNextIs(TokenKind.Comma)) {
			args.push(this.parseType());
		}
		this.chompIfNextIs(TokenKind.Comma);
		this.expect(TokenKind.RBracket);
		return args;
	}
}
