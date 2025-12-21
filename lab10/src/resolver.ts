import {
    AnnotatedModule,
    FormulaDef,
    AnnotatedFunctionDef,
    FormulaRefPredicate,
    Predicate
} from "./funnier";
import {
    checkModule as checkBaseModule,
    checkExpr,
    FunEnv,
    VarEnv
} from '../../lab08/src/parser';
import {
    FunctionDef
} from '../../lab08/src/funny';

export function resolveModule(m: AnnotatedModule): void {
    const allNames = new Set<string>();

    for (const formula of m.formulas) {
        if (allNames.has(formula.name)) {
            throw new Error(`Duplicate name "${formula.name}" (used for formula)`);
        }
        allNames.add(formula.name);
    }

    for (const func of m.functions) {
        if (allNames.has(func.name)) {
            throw new Error(`Duplicate name "${func.name}" (used for function)`);
        }
        allNames.add(func.name);
    }

    for (const formula of m.formulas) {
        checkFormula(formula, m);
    }

    const baseModule = {
        type: 'module' as const,
        functions: m.functions.map(f => ({
            type: 'fun' as const,
            name: f.name,
            parameters: f.parameters,
            returns: f.returns,
            locals: f.locals,
            body: f.body
        }))
    };
    checkBaseModule(baseModule);

    const funEnv: FunEnv = {};
    for (const func of m.functions) {
        const baseFunc: FunctionDef = {
            type: 'fun',
            name: func.name,
            parameters: func.parameters,
            returns: func.returns,
            locals: func.locals,
            body: func.body
        };
        funEnv[func.name] = baseFunc;
    }

    for (const func of m.functions) {
        checkFunctionAnnotations(func, funEnv, m.formulas);
    }
}

function checkFormula(formula: FormulaDef, module: AnnotatedModule): void {
    const varEnv: VarEnv = new Set();
    for (const param of formula.parameters) {
        varEnv.add(param.name);
    }

    const funEnv: FunEnv = {};
    for (const func of module.functions) {
        const baseFunc: FunctionDef = {
            type: 'fun',
            name: func.name,
            parameters: func.parameters,
            returns: func.returns,
            locals: func.locals,
            body: func.body
        };
        funEnv[func.name] = baseFunc;
    }

    const formulaMap = new Map<string, FormulaDef>();
    for (const f of module.formulas) {
        formulaMap.set(f.name, f);
    }

    checkPredicate(formula.body, {
        variables: varEnv,
        funEnv,
        formulas: formulaMap,
        allowedVariables: varEnv
    });
}

function checkFunctionAnnotations(
    func: AnnotatedFunctionDef,
    funEnv: FunEnv,
    allFormulas: FormulaDef[]
): void {
    const formulaMap = new Map<string, FormulaDef>();
    for (const f of allFormulas) {
        formulaMap.set(f.name, f);
    }

    const fullVarEnv: VarEnv = new Set();
    for (const param of func.parameters) {
        fullVarEnv.add(param.name);
    }
    for (const ret of func.returns) {
        fullVarEnv.add(ret.name);
    }
    for (const local of func.locals) {
        fullVarEnv.add(local.name);
    }

    if (func.requires) {
        const preVarEnv: VarEnv = new Set();
        for (const param of func.parameters) {
            preVarEnv.add(param.name);
        }

        checkPredicate(func.requires, {
            variables: preVarEnv,
            funEnv,
            formulas: formulaMap,
            allowedVariables: preVarEnv
        });
    }

    if (func.ensures) {
        const postVarEnv: VarEnv = new Set();
        for (const param of func.parameters) {
            postVarEnv.add(param.name);
        }
        for (const ret of func.returns) {
            postVarEnv.add(ret.name);
        }

        checkPredicate(func.ensures, {
            variables: postVarEnv,
            funEnv,
            formulas: formulaMap,
            allowedVariables: postVarEnv
        });
    }

    checkInvariantsInBody(func.body, {
        variables: fullVarEnv,
        funEnv,
        formulas: formulaMap,
        allowedVariables: fullVarEnv
    });
}

type PredicateEnv = {
    variables: VarEnv;
    funEnv: FunEnv;
    formulas: Map<string, FormulaDef>;
    allowedVariables: VarEnv;
};

function checkInvariantsInBody(stmt: any, env: PredicateEnv): void {
    if (!stmt) return;

    switch (stmt.type) {
        case 'while':
            if (stmt.invariant) {
                checkPredicate(stmt.invariant, env);
            }
            checkInvariantsInBody(stmt.body, env);
            break;

        case 'block':
            for (const s of stmt.statements) {
                checkInvariantsInBody(s, env);
            }
            break;

        case 'if':
            checkInvariantsInBody(stmt.then, env);
            if (stmt.else) {
                checkInvariantsInBody(stmt.else, env);
            }
            break;
    }
}

function checkPredicate(pred: Predicate, env: PredicateEnv): void {
    const predAny = pred as any;

    switch (predAny.kind) {
        case 'quantifier':
            const quantEnv = {
                ...env,
                variables: new Set([...env.variables]),
                allowedVariables: new Set([...env.allowedVariables])
            };
            quantEnv.variables.add(predAny.varName);
            quantEnv.allowedVariables.add(predAny.varName);
            checkPredicate(predAny.body, quantEnv);
            break;

        case 'formula':
            const formulaRef = pred as FormulaRefPredicate;
            const formula = env.formulas.get(formulaRef.name);
            if (!formula) {
                throw new Error(`Undefined formula "${formulaRef.name}"`);
            }

            if (formulaRef.args.length !== formula.parameters.length) {
                throw new Error(`Formula "${formulaRef.name}" expects ${formula.parameters.length} arguments, got ${formulaRef.args.length}`);
            }

            for (const arg of formulaRef.args) {
                const argResult = checkExpr(arg, env.variables, env.funEnv);
                if (argResult !== 1) {
                    throw new Error("Formula arguments must be single-valued expressions");
                }
            }
            break;

        case 'not':
            checkPredicate(predAny.predicate, env);
            break;

        case 'and':
        case 'or':
            checkPredicate(predAny.left, env);
            checkPredicate(predAny.right, env);
            break;

        case 'implies':
            const notLeft = { kind: 'not' as const, predicate: predAny.left };
            const orPred = { kind: 'or' as const, left: notLeft, right: predAny.right };
            checkPredicate(orPred, env);
            break;

        case 'comparison':
            // checkExpr из 8-й лабы
            const leftResult = checkExpr(predAny.left, env.variables, env.funEnv);
            const rightResult = checkExpr(predAny.right, env.variables, env.funEnv);
            if (leftResult !== 1 || rightResult !== 1) {
                throw new Error("Comparison operands must be single-valued");
            }
            break;

        case 'true':
        case 'false':
            break;

        case 'paren':
            checkPredicate(predAny.inner, env);
            break;

        default:
            throw new Error(`Unknown predicate kind: ${predAny.kind}`);
    }
}
