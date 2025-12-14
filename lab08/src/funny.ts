import * as arith from "../../lab04";

export interface Module {
    type: 'module';
    functions: FunctionDef[]
}
export interface FunctionDef {
    type: 'fun';
    name: string;
    parameters: ParameterDef[];
    returns: ParameterDef[];
    locals: ParameterDef[];
    body: Statement;
}

export interface ParameterDef {
    type: "param";
    name: string;
    paramType: 'int' | "int[]";
}

export type Statement = Assignment | Block | IfStmt | WhileStmt | ExprStmt;

export type LValue = VarLValue | ArrLValue;

export interface VarLValue {
    type: "lvar";
    name: string;
}

export interface ArrLValue {
    type: "larr";
    name: string;
    index: Expr;
}

export interface Assignment {
    type: 'assignment';
    targets: LValue[];
    exprs: Expr[];
}

export interface Block {
    type: 'block';
    statements: Statement[];
}

export interface IfStmt {
    type: "if";
    condition: Condition;
    then: Statement;
    else: Statement | null;
}

export interface WhileStmt {
    type: "while";
    condition: Condition;
    invariant: Predicate | null;
    body: Statement;
}

export interface ExprStmt {
    type: "expr";
    expr: Expr;
}

export type Expr = arith.Expr | FuncCallExpr | ArrAccessExpr;

export interface FuncCallExpr {
    type: "funccall";
    name: string;
    args: Expr[];
}

export interface ArrAccessExpr {
    type: "arraccess";
    name: string;
    index: Expr;
}

export type Condition =
    | TrueCond
    | FalseCond
    | ComparisonCond
    | NotCond
    | AndCond
    | OrCond
    | ImpliesCond
    | ParenCond;

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

export interface NotCond {
    kind: "not";
    condition: Condition;
}

export interface AndCond {
    kind: "and";
    left: Condition;
    right: Condition;
}

export interface OrCond {
    kind: "or";
    left: Condition;
    right: Condition;
}

export interface ImpliesCond {
    kind: "implies";
    left: Condition;
    right: Condition;
}

export interface ParenCond {
    kind: "paren";
    inner: Condition;
}

export type Predicate =
    | Quantifier
    | FormulaRef
    | FalseCond
    | TrueCond
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

export interface FormulaRef {
    kind: "formula";
    name: string;
    parameters: ParameterDef[];
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
