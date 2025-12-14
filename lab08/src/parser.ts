import { getExprAst } from '../../lab04';
import * as ast from './funny';
import grammar, { FunnyActionDict } from './funny.ohm-bundle';
import { MatchResult, Semantics } from 'ohm-js';

function collectList<T>(node: any): T[] {
    return node.asIteration().children.map((c: any) => c.parse() as T);
}

export type FunEnv = Record<string, ast.FunctionDef>;
export type VarEnv = Set<string>;

function declareVar(env: VarEnv, name: string, what: string): void {
    if (env.has(name)) {
        throw new Error(`Redeclaration of ${what} "${name}".`);
    }
    env.add(name);
}

function ensureSingleValues(
    counts: number[],
    message: string
): void {
    if (counts.some((c) => c !== 1)) {
        throw new Error(message);
    }
}

function ensureArgCount(
    name: string,
    expected: number,
    actual: number
): void {
    if (actual !== expected) {
        throw new Error(`Function "${name}" expects ${expected} arguments but got ${actual}.`);
    }
}

function ensureDeclared(
    env: VarEnv,
    name: string,
    message: string
): void {
    if (!env.has(name)) {
        throw new Error(`${message} "${name}".`);
    }
}

export function parseOptional<T>(node: any, fallback: T): T {
    return node.children.length > 0
        ? (node.child(0).parse() as T)
        : fallback;
}

export function checkModule(mod: ast.Module): void {
    const funEnv: FunEnv = Object.create(null);

    for (const fn of mod.functions) {
        if (funEnv[fn.name]) {
            throw new Error(`Duplicate function "${fn.name}".`);
        }
        funEnv[fn.name] = fn;
    }

    for (const fn of mod.functions) {
        checkFunction(fn, funEnv);
    }
}

export function checkFunction(fn: ast.FunctionDef, funEnv: FunEnv): void {
    const env: VarEnv = new Set<string>();

    for (const p of fn.parameters) {
        declareVar(env, p.name, "parameter");
    }

    for (const r of fn.returns) {
        declareVar(env, r.name, "return value");
    }

    for (const l of fn.locals) {
        declareVar(env, l.name, "local variable");
    }

    checkStmt(fn.body, env, funEnv);
}

export function checkStmt(stmt: ast.Statement, env: VarEnv, funEnv: FunEnv): void {
    switch (stmt.type) {
        case "assignment": {
            for (const lv of stmt.targets) {
                checkLValue(lv, env, funEnv);
            }

            let produced = 0;
            for (const ex of stmt.exprs) {
                produced += checkExpr(ex, env, funEnv);
            }
            const needed = stmt.targets.length;
            if (produced !== needed) {
                throw new Error(`Assignment arity mismatch: ${needed} target(s) but ${produced} value(s) on right-hand side.`);
            }
            return;
        }

        case "block":
            for (const s of stmt.statements) {
                checkStmt(s, env, funEnv);
            }
            return;

        case "if":
            checkCondition(stmt.condition, env, funEnv);
            checkStmt(stmt.then, env, funEnv);
            if (stmt.else) {
                checkStmt(stmt.else, env, funEnv);
            }
            return;

        case "while":
            checkCondition(stmt.condition, env, funEnv);
            checkStmt(stmt.body, env, funEnv);
            return;

        case "expr":
            checkExpr(stmt.expr, env, funEnv);
            return;
    }
}

export function checkLValue(lv: ast.LValue, env: VarEnv, funEnv: FunEnv): void {
    switch (lv.type) {
        case "lvar":
            ensureDeclared(
                env,
                lv.name,
                "Assignment to undeclared variable"
            );
            return;

        case "larr":
            ensureDeclared(
                env,
                lv.name,
                "Assignment to undeclared array"
            );
            checkExpr(lv.index, env, funEnv);
            return;
    }
}

export function checkFuncCall(
    call: ast.FuncCallExpr,
    env: VarEnv,
    funEnv: FunEnv
): number {
    const { name, args } = call;

    if (name === "length") {
        ensureArgCount("length", 1, args.length);

        const argCount = checkExpr(args[0], env, funEnv);
        ensureSingleValues(
            [argCount],
            "Function arguments must be single-valued."
        );

        return 1;
    }

    const fn = funEnv[name];
    if (!fn) {
        throw new Error(`Call to unknown function "${name}".`);
    }

    ensureArgCount(name, fn.parameters.length, args.length);

    for (const a of args) {
        const c = checkExpr(a, env, funEnv);
        ensureSingleValues(
            [c],
            "Function arguments must be single-valued."
        );
    }

    return fn.returns.length;
}

export function checkExpr(e: ast.Expr, env: VarEnv, funEnv: FunEnv): number {
    const kind = (e as any).kind || (e as any).type;
    switch (kind) {
        case "number":
            return 1;

        case "variable":
        case "var":
            const varName = (e as any).name;
            ensureDeclared(
                env,
                varName,
                "Use of undeclared variable"
            );
            return 1;

        case "unary":
        case "neg":
            const arg = (e as any).argument || (e as any).arg;
            return checkExpr(arg, env, funEnv);

        case "binary":
        case "bin": {
            const left = (e as any).left;
            const right = (e as any).right;
            const lCount = checkExpr(left, env, funEnv);
            const rCount = checkExpr(right, env, funEnv);
            ensureSingleValues(
                [lCount, rCount],
                "Operators can only be applied to single-valued expressions."
            );
            return 1;
        }

        case "funccall":
            return checkFuncCall(e as any, env, funEnv);

        case "arraccess": {
            const arrName = (e as any).name;
            ensureDeclared(
                env,
                arrName,
                "Access to undeclared array"
            );
            const idx = (e as any).index;
            const idxCount = checkExpr(idx, env, funEnv);
            ensureSingleValues(
                [idxCount],
                "Array index expression must produce exactly one value."
            );
            return 1;
        }
        default:
            throw new Error(`Unknown expression kind/type: ${kind} in ${JSON.stringify(e)}`);
    }
}

export function checkCondition(
    cond: ast.Condition,
    env: VarEnv,
    funEnv: FunEnv
): void {
    switch (cond.kind) {
        case "true":
        case "false":
            return;

        case "comparison": {
            const lCount = checkExpr(cond.left, env, funEnv);
            const rCount = checkExpr(cond.right, env, funEnv);
            ensureSingleValues(
                [lCount, rCount],
                "Comparison operands must be single-valued."
            );
            return;
        }

        case "not":
            checkCondition(cond.condition, env, funEnv);
            return;

        case "and":
        case "or":
        case "implies":
            checkCondition(cond.left, env, funEnv);
            checkCondition(cond.right, env, funEnv);
            return;

        case "paren":
            checkCondition(cond.inner, env, funEnv);
            return;
    }
}

export function foldLogicalChain<T>(
    first: any,
    rest: any,
    makeNode: (left: T, right: T) => T
): T {
    let node = first.parse() as T;
    for (const r of rest.children) {
        const rhs = r.parse() as T;
        node = makeNode(node, rhs);
    }
    return node;
}

export function repeatPrefix<T>(
    nots: any,
    base: any,
    makeNode: (inner: T) => T
): T {
    let node = base.parse() as T;
    for (let i = 0; i < nots.children.length; i++) {
        node = makeNode(node);
    }
    return node;
}

function makeComparisonNode(
    leftNode: any,
    rightNode: any,
    op: ast.ComparisonCond["op"]
): ast.ComparisonCond {
    return {
        kind: "comparison",
        left: leftNode.parse() as ast.Expr,
        op,
        right: rightNode.parse() as ast.Expr,
    };
}

export const getFunnyAst = {
    ...(getExprAst as any),

    Module(funcs) {
        const functions = funcs.children.map(
            (f: any) => f.parse() as ast.FunctionDef
        );
        return {
            type: "module",
            functions,
        } as ast.Module;
    },

    Function(name, _lp, params, _rp, retSpec, usesOpt, stmt) {
        return {
            type: "fun",
            name: name.sourceString,
            parameters: params.parse() as ast.ParameterDef[],
            returns: retSpec.parse() as ast.ParameterDef[],
            locals: parseOptional<ast.ParameterDef[]>(usesOpt, []),
            body: stmt.parse() as ast.Statement,
        } as ast.FunctionDef;
    },

    Uses(_uses, params) {
        return params.parse() as ast.ParameterDef[];
    },

    Ret(_returns, params) {
        return params.parse() as ast.ParameterDef[];
    },

    ParameterList(list) {
        if (list.numChildren === 0) {
            return [];
        }
        return collectList<ast.ParameterDef>(list);
    },

    Parameter(name, _colon, type) {
        return {
            type: "param",
            name: name.sourceString,
            paramType: type.sourceString,
        } as ast.ParameterDef;
    },

    Type_array(_int) {
        return "int[]" as const;
    },

    Type_int(_int) {
        return "int" as const;
    },

    ArgList(list) {
        if (list.numChildren === 0) {
            return [];
        }
        return collectList<ast.Expr>(list);
    },

    Block(_lb, stmts, _rb) {
        return {
            type: "block",
            statements: stmts.children.map((s: any) => s.parse() as ast.Statement),
        } as ast.Block;
    },

    Statement_expr(e, _semi) {
        return {
            type: "expr",
            expr: e.parse() as ast.Expr,
        } as ast.ExprStmt;
    },

    While(_while, _lp, cond, _rp, body) {
        return {
            type: "while",
            condition: cond.parse() as ast.Condition,
            body: body.parse() as ast.Statement,
        } as ast.WhileStmt;
    },

    If(_if, _lp, cond, _rp, thenStmt, _elseKwOpt, elseStmtOpt) {
        return {
            type: "if",
            condition: cond.parse() as ast.Condition,
            then: thenStmt.parse() as ast.Statement,
            else: parseOptional<ast.Statement | null>(elseStmtOpt, null),
        } as ast.IfStmt;
    },

    Assignment_tuple(lvalues, _eq, exprs, _semi) {
        return {
            type: "assignment",
            targets: lvalues.parse() as ast.LValue[],
            exprs: exprs.parse() as ast.Expr[],
        } as ast.Assignment;
    },

    Assignment_simple(lvalue, _eq, expr, _semi) {
        return {
            type: "assignment",
            targets: [lvalue.parse() as ast.LValue],
            exprs: [expr.parse() as ast.Expr],
        } as ast.Assignment;
    },

    LValueList(list) {
        return collectList<ast.LValue>(list);
    },

    ExprList(list) {
        if (list.numChildren === 0) {
            return [];
        }
        return collectList<ast.Expr>(list);
    },

    LValue_array(arr) {
        const access = arr.parse() as ast.ArrAccessExpr;
        return {
            type: "larr",
            name: access.name,
            index: access.index,
        } as ast.ArrLValue;
    },

    LValue_var(name) {
        return {
            type: "lvar",
            name: name.sourceString,
        } as ast.VarLValue;
    },

    FunctionCall(name, _lp, argsNode, _rp) {
        return {
            type: "funccall",
            name: name.sourceString,
            args: argsNode.parse() as ast.Expr[],
        } as ast.FuncCallExpr;
    },

    ArrayAccess(name, _lb, index, _rb) {
        return {
            type: "arraccess",
            name: name.sourceString,
            index: index.parse() as ast.Expr,
        } as ast.ArrAccessExpr;
    },

    OrCond(first, _ops, rest) {
        return foldLogicalChain<ast.Condition>(first, rest, (left, right) => ({
            kind: "or",
            left,
            right,
        } as ast.OrCond));
    },

    AndCond(first, _ops, rest) {
        return foldLogicalChain<ast.Condition>(first, rest, (left, right) => ({
            kind: "and",
            left,
            right,
        } as ast.AndCond));
    },

    NotCond(nots, atom) {
        return repeatPrefix<ast.Condition>(nots, atom, (condition) => ({
            kind: "not",
            condition,
        } as ast.NotCond));
    },

    AtomCond_true(_t) {
        return { kind: "true" } as ast.TrueCond;
    },

    AtomCond_false(_f) {
        return { kind: "false" } as ast.FalseCond;
    },

    AtomCond_paren(_lp, cond, _rp) {
        return {
            kind: "paren",
            inner: cond.parse() as ast.Condition,
        } as ast.ParenCond;
    },

    Comparison_eq(left, _op, right) {
        return makeComparisonNode(left, right, "==");
    },

    Comparison_neq(left, _op, right) {
        return makeComparisonNode(left, right, "!=");
    },

    Comparison_ge(left, _op, right) {
        return makeComparisonNode(left, right, ">=");
    },

    Comparison_le(left, _op, right) {
        return makeComparisonNode(left, right, "<=");
    },

    Comparison_gt(left, _op, right) {
        return makeComparisonNode(left, right, ">");
    },

    Comparison_lt(left, _op, right) {
        return makeComparisonNode(left, right, "<");
    }
} satisfies FunnyActionDict<any>;

export const semantics: FunnySemanticsExt = grammar.Funny.createSemantics() as FunnySemanticsExt;
semantics.addOperation("parse()", getFunnyAst);

export interface FunnySemanticsExt extends Semantics {
    (match: MatchResult): FunnyActionsExt;
}
interface FunnyActionsExt {
    parse(): ast.Module;
}

export function parseFunny(source: string): ast.Module {
    const matchResult = grammar.Funny.match(source, "Module");

    if (matchResult.failed()) {
        throw new SyntaxError(matchResult.message);
    }

    const ast_module = semantics(matchResult).parse();
    checkModule(ast_module);
    return ast_module;
}
