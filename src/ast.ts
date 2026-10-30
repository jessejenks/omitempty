// subset of Go AST for type declarations

export type Tag = { raw: string; name: string; options: string[] };

export type BaseField = {
	tag: Tag | null;
	leadingComments: string[];
	trailingComments: string[];
};

export const enum FieldKind {
	Struct,
	Embedded,
}

export type StructField = {
	kind: FieldKind.Struct;
	names: string[];
	tp: TypeExpr;
} & BaseField;

export type EmbeddedField = {
	kind: FieldKind.Embedded;
	isPointer: boolean;
	name: NamedType;
} & BaseField;

export type Field = StructField | EmbeddedField;

export const enum TypeExprKind {
	Interface,
	Named,
	Pointer,
	Slice,
	Map,
	Struct,
}

export type InterfaceType = { kind: TypeExprKind.Interface };
export type NamedType = {
	kind: TypeExprKind.Named;
	pkg: string | null;
	name: string;
	args: TypeExpr[];
};
export type PointerType = { kind: TypeExprKind.Pointer; tp: TypeExpr };
export type SliceType = { kind: TypeExprKind.Slice; tp: TypeExpr };
export type MapType = { kind: TypeExprKind.Map; key: TypeExpr; value: TypeExpr };
export type StructType = { kind: TypeExprKind.Struct; fields: Field[]; endComments: string[] };

export type TypeExpr =
	| InterfaceType
	| NamedType
	| PointerType
	| SliceType
	| MapType
	| StructType;

export type TypeDecl = {
	leadingComments: string[];
	name: string;
	params: string[]; // placeholder
	isAlias: boolean;
	tp: TypeExpr;
	trailingComments: string[];
};
