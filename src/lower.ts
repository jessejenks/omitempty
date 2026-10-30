import * as ast from "./ast.ts";
import * as ir from "./ir.ts";

export type LowerOptions = {
	substitutions: Record<string, string>;
};

const defaultOptions: LowerOptions = {
	substitutions: {},
};

export function lower(decls: ast.TypeDecl[], options = defaultOptions): ir.TypeDecl[] {
	return decls.map((decl) => lowerDeclaration(decl, options));
}

function lowerDeclaration(decl: ast.TypeDecl, options: LowerOptions): ir.TypeDecl {
	return {
		leadingComments: decl.leadingComments,
		name: decl.name,
		params: decl.params,
		tp: lowerType(decl.tp, options),
		trailingComments: decl.trailingComments,
	};
}

function lowerType(tp: ast.TypeExpr, options: LowerOptions): ir.TypeExpr {
	switch (tp.kind) {
		case ast.TypeExprKind.Named:
			return lowerNamedType(tp, options);
		case ast.TypeExprKind.Pointer:
			return lowerPointerType(tp, options);
		case ast.TypeExprKind.Slice:
			return lowerSliceType(tp, options);
		case ast.TypeExprKind.Map:
			return lowerMapType(tp, options);
		case ast.TypeExprKind.Struct:
			return lowerStructType(tp, options);
		case ast.TypeExprKind.Interface: {
			let name = "any";
			if (Object.hasOwn(options.substitutions, "interface")) {
				name = options.substitutions["interface"];
			}
			return { kind: ir.TypeExprKind.Ref, name, args: [] };
		}
	}
}

function convertNamedType(name: string): string {
	switch (name) {
		case "uint":
		case "uint8":
		case "uint16":
		case "uint32":
		case "uint64":
		case "uintptr":
		case "int":
		case "int8":
		case "int16":
		case "int32":
		case "int64":
		case "float":
		case "float32":
		case "float64":
		case "byte":
		case "rune":
			return "number";
		case "bool":
			return "boolean";
		default:
			return name;
	}
}

const SIMPLE_NAME = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

function lowerNamedType(tp: ast.NamedType, options: LowerOptions): ir.TypeExpr {
	const qualified = tp.pkg === null ? tp.name : `${tp.pkg}.${tp.name}`;
	const args = tp.args.map((arg) => lowerType(arg, options));
	if (Object.hasOwn(options.substitutions, qualified)) {
		const text = options.substitutions[qualified];
		if (SIMPLE_NAME.test(text)) {
			return { kind: ir.TypeExprKind.Ref, name: text, args };
		}
		if (args.length > 0) {
			throw new Error(
				`Substitution error: "${qualified}" has type arguments, but its substitute "${text}" is not a type name`,
			);
		}
		return { kind: ir.TypeExprKind.Raw, text };
	}
	return {
		kind: ir.TypeExprKind.Ref,
		name: tp.pkg === null ? convertNamedType(tp.name) : qualified,
		args,
	};
}

const NULL: ir.TypeExpr = {
	kind: ir.TypeExprKind.Ref,
	name: "null",
	args: [],
};

function isNullUnion(tp: ir.TypeExpr): tp is ir.UnionType {
	return tp.kind === ir.TypeExprKind.Union && tp.members.includes(NULL);
}

function lowerPointerType(tp: ast.PointerType, options: LowerOptions): ir.UnionType {
	const inner = lowerType(tp.tp, options);
	if (isNullUnion(inner)) {
		return inner;
	}
	return {
		kind: ir.TypeExprKind.Union,
		members: [inner, NULL],
	};
}

function lowerSliceType(tp: ast.SliceType, options: LowerOptions): ir.ArrayType {
	return {
		kind: ir.TypeExprKind.Array,
		tp: lowerType(tp.tp, options),
	};
}

function lowerMapType(tp: ast.MapType, options: LowerOptions): ir.RefType {
	return {
		kind: ir.TypeExprKind.Ref,
		name: "Record",
		args: [lowerType(tp.key, options), lowerType(tp.value, options)],
	};
}

function lowerStructType(tp: ast.StructType, options: LowerOptions): ir.TypeExpr {
	const intersectWith: ir.CommentedTypeExpr[] = [];
	const fields: ir.Field[] = [];
	for (const field of tp.fields) {
		if (field.tag !== null && field.tag.name === "-" && field.tag.options.length === 0) {
			continue;
		}
		switch (field.kind) {
			case ast.FieldKind.Struct: {
				const tp = lowerType(field.tp, options);
				// TODO multiples names and a tag should warn
				for (let i = 0; i < field.names.length; i++) {
					fields.push({
						leadingComments: i === 0 ? field.leadingComments : [],
						name: (field.tag !== null && field.tag.name) ? field.tag.name : field.names[i],
						optional: field.tag !== null && field.tag.options.includes("omitempty"),
						tp,
						trailingComments: i === field.names.length - 1 ? field.trailingComments : [],
					});
				}
				break;
			}
			case ast.FieldKind.Embedded: {
				const goType: ast.TypeExpr = field.isPointer ? { kind: ast.TypeExprKind.Pointer, tp: field.name } : field.name;
				if (field.tag === null || field.tag.name === "") {
					let tp = lowerNamedType(field.name, options);
					if (field.isPointer) {
						tp = { kind: ir.TypeExprKind.Ref, name: "Partial", args: [tp] };
					}
					intersectWith.push({
						leadingComments: field.leadingComments,
						tp,
						trailingComments: field.trailingComments,
					});
				} else {
					fields.push({
						leadingComments: field.leadingComments,
						name: field.tag.name,
						optional: field.tag.options.includes("omitempty"),
						tp: lowerType(goType, options),
						trailingComments: field.trailingComments,
					});
				}
				break;
			}
		}
	}
	const struct: ir.TypeExpr = {
		kind: ir.TypeExprKind.Object,
		fields,
		endComments: tp.endComments,
	};
	if (intersectWith.length === 0) {
		return struct;
	}
	const members = fields.length === 0 && tp.endComments.length === 0
		? intersectWith
		: [{ leadingComments: [], tp: struct, trailingComments: [] }, ...intersectWith];
	if (members.length === 1 && members[0].leadingComments.length === 0 && members[0].trailingComments.length === 0) {
		return members[0].tp;
	}
	return {
		kind: ir.TypeExprKind.Intersection,
		members,
	};
}
