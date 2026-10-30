// TS Ast

export type TypeDecl = {
	name: string;
	params: string[];
	tp: TypeExpr;
	leadingComments: string[];
	trailingComments: string[];
};

export const enum TypeExprKind {
	Ref,
	Array,
	Union,
	Intersection,
	Object,
	Raw,
}

export type RefType = { kind: TypeExprKind.Ref; name: string; args: TypeExpr[] };
export type RawType = { kind: TypeExprKind.Raw; text: string };
export type ArrayType = { kind: TypeExprKind.Array; tp: TypeExpr };
export type UnionType = { kind: TypeExprKind.Union; members: TypeExpr[] };
export type IntersectionType = { kind: TypeExprKind.Intersection; members: CommentedTypeExpr[] };
export type ObjectType = { kind: TypeExprKind.Object; fields: Field[]; endComments: string[] };

export type TypeExpr =
	| RefType
	| ArrayType
	| UnionType
	| IntersectionType
	| ObjectType
	| RawType;

export type CommentedTypeExpr = {
	leadingComments: string[];
	tp: TypeExpr;
	trailingComments: string[];
};

export type Field = {
	name: string;
	optional: boolean;
	tp: TypeExpr;
	leadingComments: string[];
	trailingComments: string[];
};
