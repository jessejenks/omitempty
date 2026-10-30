import {
	ArrayType,
	Field,
	IntersectionType,
	ObjectType,
	RefType,
	TypeDecl,
	TypeExpr,
	TypeExprKind,
	UnionType,
} from "./ir.ts";

export class Writer {
	protected depth: number;
	protected cache: Map<number, string>;
	protected atLineStart: boolean;
	protected buffer: string[];
	protected pending: string[];

	constructor(protected useTabs = true, protected tabWidth = 4) {
		this.depth = 0;
		this.cache = new Map();
		this.cache.set(0, "");
		this.atLineStart = true;
		this.buffer = [];
		this.pending = [];
	}

	reset() {
		this.depth = 0;
		this.atLineStart = true;
		this.buffer.length = 0;
		this.pending.length = 0;
	}

	indent(): string {
		if (!this.cache.has(this.depth)) {
			const tab = this.useTabs ? `\t` : " ".repeat(this.tabWidth);
			this.cache.set(this.depth, tab.repeat(this.depth));
		}
		return this.cache.get(this.depth)!;
	}

	indented<T>(fn: () => T): T {
		this.enter();
		try {
			return fn();
		} finally {
			this.exit();
		}
	}

	enter() {
		this.depth++;
	}

	exit() {
		this.depth--;
	}

	write(text: string) {
		if (this.atLineStart) {
			this.buffer.push(this.indent());
			this.atLineStart = false;
		}
		this.buffer.push(text);
	}

	writeDeferred(text: string) {
		this.pending.push(text);
	}

	newline() {
		if (this.buffer.length > 0 && !this.atLineStart) {
			this.buffer[this.buffer.length - 1] = this.buffer[this.buffer.length - 1].trimEnd();
		}
		if (this.pending.length > 0) {
			if (this.atLineStart) {
				this.buffer.push(this.indent());
				this.atLineStart = false;
			}
			for (const p of this.pending) {
				this.buffer.push(p);
			}
			this.pending.length = 0;
		}
		this.buffer.push("\n");
		this.atLineStart = true;
	}

	ensureNewline() {
		if (!this.atLineStart) {
			this.newline();
		}
	}

	toString(): string {
		for (const p of this.pending) {
			this.buffer.push(p);
		}
		this.pending.length = 0;
		return this.buffer.join("");
	}
}

export class Printer {
	constructor(protected writer: Writer) {}

	printDeclarations(decls: TypeDecl[]): string {
		this.writer.reset();
		for (let i = 0; i < decls.length; i++) {
			if (i > 0) {
				this.writer.newline();
				this.writer.newline();
			}
			this.printDeclaration(decls[i]);
		}
		return this.writer.toString();
	}

	printDeclaration(decl: TypeDecl) {
		this.printLeadingComments(decl.leadingComments);
		this.writer.write(`type ${decl.name} = `);
		this.printTypeExpr(decl.tp);
		this.writer.write(";");
		this.printTrailingComments(decl.trailingComments);
	}

	printTypeExpr(tp: TypeExpr, minPrecedence = Precedence.Union) {
		const parens = precedence(tp) < minPrecedence;
		if (parens) {
			this.writer.write("(");
		}
		switch (tp.kind) {
			case TypeExprKind.Ref:
				this.printRefType(tp);
				break;
			case TypeExprKind.Array:
				this.printArrayType(tp);
				break;
			case TypeExprKind.Union:
				this.printUnionType(tp);
				break;
			case TypeExprKind.Intersection:
				this.printIntersectionType(tp);
				break;
			case TypeExprKind.Object:
				this.printObjectType(tp);
				break;
			case TypeExprKind.Raw:
				this.writer.write(tp.text);
				break;
		}
		if (parens) {
			if (isMultiline(tp)) {
				this.writer.ensureNewline();
			}
			this.writer.write(")");
		}
	}

	printRefType(tp: RefType) {
		if (tp.args.length === 0) {
			this.writer.write(tp.name);
			return;
		}
		this.writer.write(`${tp.name}<`);
		for (let i = 0; i < tp.args.length; i++) {
			if (i > 0) {
				this.writer.write(", ");
			}
			this.printTypeExpr(tp.args[i]);
		}
		this.writer.write(`>`);
	}

	printArrayType(tp: ArrayType) {
		this.printTypeExpr(tp.tp, Precedence.Postfix);
		this.writer.write("[]");
	}

	printUnionType(tp: UnionType) {
		for (let i = 0; i < tp.members.length; i++) {
			if (i > 0) {
				this.writer.write(" | ");
			}
			this.printTypeExpr(tp.members[i], Precedence.Intersection);
		}
	}

	printIntersectionType(tp: IntersectionType) {
		if (isMultiline(tp)) {
			this.writer.indented(() => {
				for (const member of tp.members) {
					this.printLeadingComments(member.leadingComments);
					this.writer.ensureNewline();
					this.writer.write("& ");
					this.printTypeExpr(member.tp, Precedence.Postfix);
					this.printTrailingComments(member.trailingComments);
				}
			});
			return;
		}
		for (let i = 0; i < tp.members.length; i++) {
			if (i > 0) {
				this.writer.write(" & ");
			}
			this.printTypeExpr(tp.members[i].tp, Precedence.Postfix);
		}
	}

	printObjectType(tp: ObjectType) {
		if (tp.fields.length === 0 && tp.endComments.length == 0) {
			this.writer.write("{}");
			return;
		}
		this.writer.write("{");
		this.writer.indented(() => {
			for (const field of tp.fields) {
				this.printField(field);
			}
			this.printLeadingComments(tp.endComments);
		});
		this.writer.ensureNewline();
		this.writer.write("}");
	}

	printField(field: Field) {
		this.printLeadingComments(field.leadingComments);
		this.writer.ensureNewline();
		this.writer.write(quote(field.name));
		if (field.optional) {
			this.writer.write("?");
		}
		this.writer.write(": ");
		this.printTypeExpr(field.tp);
		this.writer.write(";");
		this.printTrailingComments(field.trailingComments);
	}

	printLeadingComments(comments: string[]) {
		for (let i = 0; i < comments.length; i++) {
			this.writer.ensureNewline();
			this.writer.write(comments[i]);
			this.writer.newline();
		}
	}

	printTrailingComments(comments: string[]) {
		for (let i = 0; i < comments.length; i++) {
			this.writer.writeDeferred(` ${comments[i]}`);
		}
	}
}

// conservatively quote
const jsIdentifier = /^[a-zA-Z_\$][a-zA-Z0-9_]*$/;
function quote(name: string) {
	if (jsIdentifier.test(name)) {
		return name;
	}
	return `"${name}"`;
}

const enum Precedence {
	Union,
	Intersection,
	Postfix,
	Atom,
}

function precedence(tp: TypeExpr): Precedence {
	switch (tp.kind) {
		case TypeExprKind.Union:
		case TypeExprKind.Raw:
			return Precedence.Union;
		case TypeExprKind.Intersection:
			return Precedence.Intersection;
		case TypeExprKind.Array:
			return Precedence.Postfix;
		case TypeExprKind.Ref:
		case TypeExprKind.Object:
			return Precedence.Atom;
	}
}

function isMultiline(tp: TypeExpr): boolean {
	return tp.kind === TypeExprKind.Intersection &&
		tp.members.some((member) => member.leadingComments.length > 0 || member.trailingComments.length > 0);
}
