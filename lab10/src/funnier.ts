import {
    Module as BaseModule,
    FunctionDef as BaseFunctionDef,
    ParameterDef,
    Statement,
    Condition,
    Expr
} from '../../lab08/src/funny';

// Расширяем базовые типы
export interface AnnotatedModule extends BaseModule {
    formulas: FormulaDef[];
    functions: AnnotatedFunctionDef[];
}

export interface AnnotatedFunctionDef extends BaseFunctionDef {
    requires: Predicate | null;
    ensures: Predicate | null;
}

// ДОБАВЛЯЕМ типы для верификации
export type Predicate =
    | Quantifier
    | FormulaRefPredicate
    | TrueCond
    | FalseCond
    | ComparisonCond
    | NotPred
    | AndPred
    | OrPred
    | ParenPred;

export interface Quantifier {
    kind: "quantifier";
    quant: "forall" | "exists";
    varName: string;
    varType: "int" | "int[]";
    body: Predicate;
}

export interface FormulaRefPredicate {
    kind: "formula";
    name: string;
    args: Expr[];
}

export interface FormulaDef {
    type: 'formula';
    name: string;
    parameters: ParameterDef[];
    body: Predicate;
}

export interface NotPred {
    kind: "not";
    predicate: Predicate;
}

export interface AndPred {
    kind: "and";
    left: Predicate;
    right: Predicate;
}

export interface OrPred {
    kind: "or";
    left: Predicate;
    right: Predicate;
}

export interface ParenPred {
    kind: "paren";
    inner: Predicate;
}

export interface TrueCond {
    kind: "true";
}

export interface FalseCond {
    kind: "false";
}

export interface ComparisonCond {
    kind: "comparison";
    left: Expr;
    op: "==" | "!=" | ">" | "<" | ">=" | "<=";
    right: Expr;
}
