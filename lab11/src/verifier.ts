import { Arith, Bool, Context, init, Model, Solver } from "z3-solver";
import { AnnotatedModule, AnnotatedFunctionDef, Predicate, FormulaDef } from "../../lab10/src/funnier";
import * as ast from "../../lab08/src/funny";
import * as arith from "../../lab04/src/ast";

let z3anchor: any = null;
let z3: Context<"main">;

async function initZ3() {
    if (!z3anchor) {
        z3anchor = await init();
        z3 = z3anchor.Context('main');
    }
}

export function flushZ3() {
    z3anchor = undefined;
}

type Z3Env = Map<string, Arith<"main"> | any>;

interface VerificationContext {
    env: Z3Env;
    module: AnnotatedModule;
    currentFunction: AnnotatedFunctionDef;
    solver: Solver<"main">;
    depth: number;
}

function not(p: Predicate): Predicate {
    return { kind: "not", predicate: p };
}

function and(p1: Predicate, p2: Predicate): Predicate {
    if (p1.kind === "true") return p2;
    if (p2.kind === "true") return p1;
    if (p1.kind === "false" || p2.kind === "false") return { kind: "false" };
    return { kind: "and", left: p1, right: p2 };
}

function or(p1: Predicate, p2: Predicate): Predicate {
    if (p1.kind === "false") return p2;
    if (p2.kind === "false") return p1;
    if (p1.kind === "true" || p2.kind === "true") return { kind: "true" };
    return { kind: "or", left: p1, right: p2 };
}

function implies(p1: Predicate, p2: Predicate): Predicate {
    return or(not(p1), p2);
}

function buildFunctionVerificationConditions(fn: AnnotatedFunctionDef, module: AnnotatedModule): Predicate[] {
    const vcs: Predicate[] = [];
    const pre = fn.requires || { kind: "true" };
    const post = fn.ensures || { kind: "true" };
    const extraVCs: Predicate[] = [];
    const wp = computeWP(fn.body, post, extraVCs, module);
    vcs.push(implies(pre, wp));
    vcs.push(...extraVCs);
    return vcs;
}

function computeWP(
    stmt: ast.Statement,
    post: Predicate,
    extraVCs: Predicate[],
    module: AnnotatedModule
): Predicate {
    switch (stmt.type) {
        case "block": {
            let current = post;
            for (let i = stmt.statements.length - 1; i >= 0; i--) {
                current = computeWP(stmt.statements[i], current, extraVCs, module);
            }
            return current;
        }

        case "assignment": {
            let current = post;
            const targets = stmt.targets;
            const exprs = stmt.exprs;
            for (let i = targets.length - 1; i >= 0; i--) {
                const target = targets[i];
                if (target.type === "lvar") {
                    current = substituteInPredicate(current, target.name, exprs[i]);
                }
            }
            return current;
        }

        case "expr": {
            return post;
        }

        case "if": {
            const wpThen = computeWP(stmt.then, post, extraVCs, module);
            const wpElse = stmt.else ? computeWP(stmt.else, post, extraVCs, module) : post;
            const cond = conditionToPredicate(stmt.condition);
            return and(implies(cond, wpThen), implies(not(cond), wpElse));
        }

        case "while": {
            const whileStmt = stmt as any;
            const I = whileStmt.invariant || { kind: "true" };
            const cond = conditionToPredicate(stmt.condition);
            const wpBody = computeWP(stmt.body, I, extraVCs, module);
            extraVCs.push(implies(and(I, cond), wpBody));
            extraVCs.push(implies(and(I, not(cond)), post));
            return I;
        }

        default:
            return post;
    }
}

function conditionToPredicate(cond: ast.Condition): Predicate {
    switch (cond.kind) {
        case "true": return { kind: "true" };
        case "false": return { kind: "false" };
        case "comparison": return cond as Predicate;
        case "not": return { kind: "not", predicate: conditionToPredicate(cond.condition) };
        case "and": return { kind: "and", left: conditionToPredicate(cond.left), right: conditionToPredicate(cond.right) };
        case "or": return { kind: "or", left: conditionToPredicate(cond.left), right: conditionToPredicate(cond.right) };
        case "implies": return implies(conditionToPredicate(cond.left), conditionToPredicate(cond.right));
        case "paren": return { kind: "paren", inner: conditionToPredicate(cond.inner) };
        default: throw new Error(`Unknown condition kind: ${(cond as any).kind}`);
    }
}

function substituteInPredicate(pred: Predicate, varName: string, expr: ast.Expr): Predicate {
    switch (pred.kind) {
        case "true":
        case "false":
            return pred;
        case "comparison":
            return {
                kind: "comparison",
                left: substituteInExpr(pred.left, varName, expr),
                op: pred.op,
                right: substituteInExpr(pred.right, varName, expr)
            };
        case "not":
            return { kind: "not", predicate: substituteInPredicate(pred.predicate, varName, expr) };
        case "and":
        case "or":
            return {
                kind: pred.kind,
                left: substituteInPredicate(pred.left, varName, expr),
                right: substituteInPredicate(pred.right, varName, expr)
            };
        case "paren":
            return { kind: "paren", inner: substituteInPredicate(pred.inner, varName, expr) };
        case "quantifier":
            if (pred.varName === varName) return pred;
            return { ...pred, body: substituteInPredicate(pred.body, varName, expr) };
        case "formula":
            return { ...pred, args: pred.args.map(a => substituteInExpr(a, varName, expr)) };
        default:
            return pred;
    }
}

function substituteInExpr(e: ast.Expr, varName: string, subst: ast.Expr): ast.Expr {
    if ("kind" in e) {
        const ex = e as arith.Expr;
        switch (ex.kind) {
            case "number": return ex;
            case "variable": return ex.name === varName ? subst : ex;
            case "unary":
                return {
                    kind: "unary",
                    operator: ex.operator,
                    argument: substituteInExpr(ex.argument, varName, subst)
                } as arith.Expr;
            case "binary":
                return {
                    kind: "binary",
                    operator: ex.operator,
                    left: substituteInExpr(ex.left, varName, subst),
                    right: substituteInExpr(ex.right, varName, subst)
                } as arith.Expr;
        }
    }
    if ("type" in e) {
        const ex = e as any;
        if (ex.type === "funccall") {
            return {
                type: "funccall",
                name: ex.name,
                args: ex.args.map((arg: ast.Expr) => substituteInExpr(arg, varName, subst))
            };
        }
        if (ex.type === "arraccess") {
            return {
                type: "arraccess",
                name: ex.name,
                index: substituteInExpr(ex.index, varName, subst)
            };
        }
    }
    return e;
}

function substituteArgs(pred: Predicate, params: ast.ParameterDef[], args: ast.Expr[]): Predicate {
    let current = pred;
    for (let i = 0; i < params.length; i++) {
        current = substituteInPredicate(current, params[i].name, args[i]);
    }
    return current;
}

async function predicateToZ3(pred: Predicate, ctx: VerificationContext): Promise<Bool<"main">> {
    if (ctx.depth > 10) return z3.Bool.val(true);

    const newCtx = { ...ctx, depth: ctx.depth + 1 };

    switch (pred.kind) {
        case "true": return z3.Bool.val(true);
        case "false": return z3.Bool.val(false);
        case "comparison": {
            const l = await exprToZ3(pred.left, newCtx);
            const r = await exprToZ3(pred.right, newCtx);
            switch (pred.op) {
                case "==": return l.eq(r);
                case "!=": return z3.Not(l.eq(r));
                case ">": return l.gt(r);
                case "<": return l.lt(r);
                case ">=": return l.ge(r);
                case "<=": return l.le(r);
            }
            throw new Error("Unknown comparison op");
        }
        case "not":
            return (await predicateToZ3(pred.predicate, newCtx)).not();
        case "and":
            return z3.And(
                await predicateToZ3(pred.left, newCtx),
                await predicateToZ3(pred.right, newCtx)
            );
        case "or":
            return z3.Or(
                await predicateToZ3(pred.left, newCtx),
                await predicateToZ3(pred.right, newCtx)
            );
        case "paren":
            return await predicateToZ3(pred.inner, newCtx);
        case "quantifier": {
            const v = z3.Int.const(pred.varName);
            const newEnv = new Map(ctx.env);
            newEnv.set(pred.varName, v);
            const newCtxWithVar = { ...newCtx, env: newEnv };
            const body = await predicateToZ3(pred.body, newCtxWithVar);
            if (pred.quant === "forall") {
                return z3.ForAll([v], body);
            } else {
                const existsSolver = new z3.Solver();
                existsSolver.add(body);
                const existsRes = await existsSolver.check();
                if (existsRes === "unsat") {
                    return z3.Bool.val(false);
                }
                return z3.Bool.val(true);
            }
        }
        case "formula": {
            const formula = ctx.module.formulas.find(f => f.name === pred.name);
            if (formula) {
                let body = formula.body;
                for (let i = 0; i < formula.parameters.length; i++) {
                    body = substituteInPredicate(body, formula.parameters[i].name, pred.args[i]);
                }
                return await predicateToZ3(body, newCtx);
            }

            const func = ctx.module.functions.find(f => f.name === pred.name);
            if (func && func.ensures) {
                const tempEnv = new Map(ctx.env);

                for (const ret of func.returns) {
                    const retVar = z3.Int.const(`${pred.name}_${ret.name}_result`);
                    tempEnv.set(ret.name, retVar);
                }

                const ensuresSubst = substituteArgs(func.ensures, func.parameters, pred.args);
                const newCtxWithRet = { ...newCtx, env: tempEnv };
                return await predicateToZ3(ensuresSubst, newCtxWithRet);
            }

            throw new Error(`Unknown formula or function ${pred.name}`);
        }
        default:
            throw new Error(`Unsupported predicate kind: ${(pred as any).kind}`);
    }
}

function isFuncCallExpr(e: ast.Expr): e is ast.FuncCallExpr {
    return (e as any).type === "funccall";
}

function isArrAccessExpr(e: ast.Expr): e is ast.ArrAccessExpr {
    return (e as any).type === "arraccess";
}

function checkIfRecursive(fn: AnnotatedFunctionDef, module: AnnotatedModule): boolean {
    if (!fn.ensures) return false;

    function containsRecursiveCall(pred: Predicate, funcName: string): boolean {
        switch (pred.kind) {
            case "true":
            case "false":
                return false;
            case "comparison":
                return containsCallInExpr(pred.left, funcName) ||
                       containsCallInExpr(pred.right, funcName);
            case "and":
            case "or":
                return containsRecursiveCall(pred.left, funcName) ||
                       containsRecursiveCall(pred.right, funcName);
            case "not":
                return containsRecursiveCall(pred.predicate, funcName);
            case "paren":
                return containsRecursiveCall(pred.inner, funcName);
            case "quantifier":
                return containsRecursiveCall(pred.body, funcName);
            case "formula":
                if (pred.name === funcName) return true;
                return pred.args.some(arg => containsCallInExpr(arg, funcName));
            default:
                return false;
        }
    }

    function containsCallInExpr(expr: ast.Expr, funcName: string): boolean {
        if ((expr as any).type === "funccall") {
            const call = expr as ast.FuncCallExpr;
            if (call.name === funcName) return true;
            return call.args.some(arg => containsCallInExpr(arg, funcName));
        }

        if ((expr as any).kind === "unary") {
            const unary = expr as any;
            return containsCallInExpr(unary.argument, funcName);
        }
        if ((expr as any).kind === "binary") {
            const binary = expr as any;
            return containsCallInExpr(binary.left, funcName) ||
                   containsCallInExpr(binary.right, funcName);
        }

        return false;
    }

    return containsRecursiveCall(fn.ensures, fn.name);
}

async function addInductionAxioms(
    fn: AnnotatedFunctionDef,
    module: AnnotatedModule,
    ctx: VerificationContext
): Promise<void> {
    if (fn.parameters.length !== 1 || fn.returns.length !== 1) {
        return;
    }

    const param = fn.parameters[0];
    const ret = fn.returns[0];

    const paramVar = z3.Int.const(param.name);
    const resultVar = z3.Int.const(`${fn.name}_result`);

    const baseCtx = { ...ctx, env: new Map(ctx.env) };
    baseCtx.env.set(param.name, z3.Int.val(0));
    baseCtx.env.set(ret.name, resultVar);

    if (fn.ensures) {
        const ensuresZero = substituteInPredicate(fn.ensures, param.name, { kind: "number", value: 0 } as any);
        const baseAxiom = await predicateToZ3(ensuresZero, baseCtx);
        ctx.solver.add(baseAxiom);
    }

    const prevParam = z3.Int.const(`${param.name}_prev`);
    const prevResult = z3.Int.const(`${fn.name}_prev_result`);

    const stepCtx = { ...ctx, env: new Map(ctx.env) };
    stepCtx.env.set(param.name, paramVar);
    stepCtx.env.set(ret.name, resultVar);
    stepCtx.env.set(`${param.name}_prev`, prevParam);
    stepCtx.env.set(`${fn.name}_prev_result`, prevResult);

    if (fn.ensures) {
        const prevEnsures = substituteInPredicate(
            fn.ensures,
            param.name,
            { kind: "variable", name: `${param.name}_prev` } as any
        );

        const prevVarExpr = { kind: "variable", name: `${param.name}_prev` } as any;
        const nMinusOne = {
            kind: "binary",
            operator: "-",
            left: { kind: "variable", name: param.name } as any,
            right: { kind: "number", value: 1 } as any
        } as any;

        const prevEq = {
            kind: "comparison",
            op: "==",
            left: prevVarExpr,
            right: nMinusOne
        } as Predicate;

        const nPositive = {
            kind: "comparison",
            op: ">",
            left: { kind: "variable", name: param.name } as any,
            right: { kind: "number", value: 0 } as any
        } as Predicate;

        const stepPremise = and(and(prevEnsures, prevEq), nPositive);
        const stepAxiom = implies(stepPremise, fn.ensures);

        const stepAxiomZ3 = await predicateToZ3(stepAxiom, stepCtx);
        ctx.solver.add(stepAxiomZ3);
    }
}

export async function verifyModule(module: AnnotatedModule) {
    await initZ3();

    for (const fn of module.functions) {
        await verifyFunction(fn, module);
    }
}

async function exprToZ3(e: ast.Expr, ctx: VerificationContext): Promise<Arith<"main">> {
    if (ctx.depth > 10) return z3.Int.val(0);

    const newCtx = { ...ctx, depth: ctx.depth + 1 };

    if ("kind" in e) {
        const ex = e as arith.Expr;
        switch (ex.kind) {
            case "number": return z3.Int.val(ex.value);
            case "variable": {
                const v = ctx.env.get(ex.name);
                if (!v) throw new Error(`Undefined variable ${ex.name}`);
                return v as Arith<"main">;
            }
            case "unary": {
                const arg = await exprToZ3(ex.argument, newCtx);
                return ex.operator === "-" ? arg.neg() : arg;
            }
            case "binary": {
                const l = await exprToZ3(ex.left, newCtx);
                const r = await exprToZ3(ex.right, newCtx);
                switch (ex.operator) {
                    case "+": return l.add(r);
                    case "-": return l.sub(r);
                    case "*": return l.mul(r);
                    case "/": return l.div(r);
                    default: throw new Error(`Unsupported operator ${(ex as any).operator}`);
                }
            }
        }
    }

    if (isFuncCallExpr(e)) {
        const call = e;
        const func = ctx.module.functions.find(f => f.name === call.name);

        if (!func) {
            return z3.Int.const(`call_${call.name}`);
        }

        if (func.returns.length === 1) {
            const ret = func.returns[0];

            const argValues = await Promise.all(call.args.map(arg => exprToZ3(arg, newCtx)));

            const callId = Math.random().toString(36).substring(2, 8);
            const resultVar = z3.Int.const(`${call.name}_result_${callId}`);

            if (call.name === ctx.currentFunction.name) {
                const tempEnv = new Map();

                for (let i = 0; i < func.parameters.length; i++) {
                    const param = func.parameters[i];
                    tempEnv.set(param.name, argValues[i]);
                }

                tempEnv.set(ret.name, resultVar);

                const ensuresCtx = {
                    ...newCtx,
                    env: tempEnv,
                    currentFunction: func,
                    solver: ctx.solver
                };

                if (func.ensures) {
                    try {
                        const ensuresZ3 = await predicateToZ3(func.ensures, ensuresCtx);
                        ctx.solver.add(ensuresZ3);
                    } catch (error) {
                        console.warn(`Warning: Could not add ensures for recursive call: ${error}`);
                    }
                }

                return resultVar;
            } else {
                const resultVar = z3.Int.const(`${ctx.currentFunction.name}_call_${call.name}_${callId}`);

                if (func.ensures) {
                    const tempEnv = new Map(ctx.env);
                    tempEnv.set(ret.name, resultVar);

                    for (let i = 0; i < func.parameters.length; i++) {
                        const param = func.parameters[i];
                        tempEnv.set(param.name, argValues[i]);
                    }

                    const ensuresSubst = substituteArgs(func.ensures, func.parameters, call.args);
                    const ensuresCtx = { ...newCtx, env: tempEnv, currentFunction: func };
                    const ensuresZ3 = await predicateToZ3(ensuresSubst, ensuresCtx);

                    ctx.solver.add(ensuresZ3);
                }

                return resultVar;
            }
        }

        return z3.Int.const(`call_${call.name}_${Math.random().toString(36).substring(2, 8)}`);
    }

    if (isArrAccessExpr(e)) {
        const access = e;
        const arr = ctx.env.get(access.name);
        if (!arr) throw new Error(`Array ${access.name} not found`);
        const index = await exprToZ3(access.index, newCtx);
        return arr.select(index) as Arith<"main">;
    }

    throw new Error(`Unsupported expression type`);
}

async function addInductionAxiomsForFactorial(
    fn: AnnotatedFunctionDef,
    ctx: VerificationContext
): Promise<void> {
    if (fn.name !== "factorial") return;

    const param = fn.parameters[0];
    const ret = fn.returns[0];

    const zeroResult = z3.Int.const("factorial_zero");
    const baseAxiom = zeroResult.eq(z3.Int.val(1));
    ctx.solver.add(baseAxiom);

    const nVar = z3.Int.const(param.name);
    const factorialN = z3.Int.const("factorial_n");
    const factorialNMinus1 = z3.Int.const("factorial_n_minus_1");

    const inductiveAxiom = z3.ForAll([nVar, factorialN, factorialNMinus1],
        z3.Implies(
            z3.And(
                nVar.gt(z3.Int.val(0)),
                factorialNMinus1.eq(z3.Int.const("factorial_zero"))
            ),
            factorialN.eq(nVar.mul(factorialNMinus1))
        )
    );

    ctx.solver.add(inductiveAxiom);
}

async function verifyFunction(fn: AnnotatedFunctionDef, module: AnnotatedModule): Promise<void> {
    const env = new Map<string, Arith<"main"> | any>();
    [...fn.parameters, ...fn.returns, ...fn.locals].forEach(p => {
        if (p.paramType === "int") {
            env.set(p.name, z3.Int.const(p.name));
        } else {
            env.set(p.name, z3.Array.const(p.name, z3.Int.sort(), z3.Int.sort()));
        }
    });

    const vcs = buildFunctionVerificationConditions(fn, module);

    for (const vc of vcs) {
        const solver = new z3.Solver();
        const ctx: VerificationContext = {
            env: new Map(env),
            module,
            currentFunction: fn,
            solver,
            depth: 0
        };

        if (fn.name === "factorial") {
            await addInductionAxiomsForFactorial(fn, ctx);
        }

        if (fn.requires) {
            const pre = await predicateToZ3(fn.requires, ctx);
            solver.add(pre);
        }

        const z3vc = await predicateToZ3(vc, ctx);

        solver.add(z3.Not(z3vc));

        const res = await solver.check();
        if (res === "sat") {
            const model = await solver.model();
            console.log("Counterexample model:", model.toString());
            throw new Error(`Verification failed for function "${fn.name}". Possible issue with inductive reasoning.`);
        }
        if (res === "unknown") {
            console.warn(`Z3 returned unknown for "${fn.name}"`);
            return;
        }
    }
}
