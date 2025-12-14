import {
    AnnotatedModule,
    FormulaDef,
    AnnotatedFunctionDef,
    FormulaRefPredicate
} from "./funnier";
import {
    checkModule as checkBaseModule,
    checkFunction as checkBaseFunction,
    checkStmt,
    checkExpr,
    checkCondition,
    checkLValue,
    checkFuncCall,
    parseOptional,
    // Типы окружений
    FunEnv,
    VarEnv
} from '../../lab08/src/parser';
import {
    Predicate,
    Expr,
    ParameterDef,
    FunctionDef,
    Statement
} from '../../lab08/src/funny';

// Создаем расширенное окружение для формул
interface ExtendedEnv {
    variables: VarEnv;
    funEnv: FunEnv;
    formulas: Map<string, FormulaDef>;
}

export function resolveModule(m: AnnotatedModule): void {
    // 1. Создаем базовое окружение для функций
    const funEnv: FunEnv = Object.create(null);
    for (const fn of m.functions) {
        // Приводим к базовому типу FunctionDef
        const baseFn: FunctionDef = {
            type: 'fun',
            name: fn.name,
            parameters: fn.parameters,
            returns: fn.returns,
            locals: fn.locals,
            body: fn.body
        };
        funEnv[fn.name] = baseFn;
    }

    // 2. Создаем базовый модуль для проверки
    const baseModule = {
        type: 'module' as const,
        functions: Object.values(funEnv)
    };

    // 3. Выполняем базовую проверку (из 8-й лабы)
    checkBaseModule(baseModule);

    // 4. Создаем расширенное окружение с формулами
    const formulaMap = new Map<string, FormulaDef>();
    for (const formula of m.formulas) {
        if (formulaMap.has(formula.name)) {
            throw new Error(`Duplicate formula "${formula.name}"`);
        }
        formulaMap.set(formula.name, formula);

        // Проверяем конфликты имен с функциями
        if (funEnv[formula.name]) {
            throw new Error(`Name "${formula.name}" used for both formula and function`);
        }
    }

    // 5. Проверяем каждую формулу
    for (const formula of m.formulas) {
        checkFormula(formula, { variables: new Set(), funEnv, formulas: formulaMap });
    }

    // 6. Проверяем аннотации в функциях
    for (const func of m.functions) {
        checkFunctionAnnotations(func, funEnv, formulaMap);
    }
}

function checkFormula(formula: FormulaDef, env: ExtendedEnv): void {
    // Создаем локальное окружение для формулы
    const localEnv: ExtendedEnv = {
        variables: new Set(),
        funEnv: env.funEnv,
        formulas: env.formulas
    };

    // Добавляем параметры формулы в окружение
    for (const param of formula.parameters) {
        localEnv.variables.add(param.name);
    }

    // Проверяем тело формулы
    checkPredicate(formula.body, localEnv);
}

function checkFunctionAnnotations(func: AnnotatedFunctionDef, funEnv: FunEnv, formulas: Map<string, FormulaDef>): void {
    // Создаем окружение для проверки функции
    const varEnv: VarEnv = new Set<string>();

    // Добавляем параметры
    for (const param of func.parameters) {
        varEnv.add(param.name);
    }

    // Добавляем возвращаемые значения
    for (const ret of func.returns) {
        varEnv.add(ret.name);
    }

    // Добавляем локальные переменные
    for (const local of func.locals) {
        varEnv.add(local.name);
    }

    // Создаем расширенное окружение
    const env: ExtendedEnv = { variables: varEnv, funEnv, formulas };

    // 1. Проверяем предусловие (только параметры)
    if (func.requires) {
        const preEnv: ExtendedEnv = {
            variables: new Set(),
            funEnv,
            formulas
        };
        // Добавляем только параметры
        for (const param of func.parameters) {
            preEnv.variables.add(param.name);
        }
        checkPredicate(func.requires, preEnv);
    }

    // 2. Проверяем тело функции (используем базовую проверку из 8-й лабы)
    // Это уже было сделано в checkBaseModule, но если нужно проверить инварианты:
    checkInvariantsInBody(func.body, env);

    // 3. Проверяем постусловие (параметры + возвращаемые значения)
    if (func.ensures) {
        const postEnv: ExtendedEnv = {
            variables: new Set(),
            funEnv,
            formulas
        };
        // Добавляем параметры и возвращаемые значения
        for (const param of func.parameters) {
            postEnv.variables.add(param.name);
        }
        for (const ret of func.returns) {
            postEnv.variables.add(ret.name);
        }
        checkPredicate(func.ensures, postEnv);
    }
}

function checkInvariantsInBody(stmt: Statement, env: ExtendedEnv): void {
    if (!stmt) return;

    switch (stmt.type) {
        case 'while':
            // Проверяем инвариант цикла
            if ('invariant' in stmt && stmt.invariant) {
                checkPredicate(stmt.invariant as any, env);
            }
            // Рекурсивно проверяем тело цикла
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

        case 'assignment':
        case 'expr':
            // Эти операторы не содержат инвариантов
            break;
    }
}

function checkPredicate(pred: Predicate, env: ExtendedEnv): void {
    // Приводим к any для доступа к kind
    const predAny = pred as any;

    switch (predAny.kind) {
        case 'quantifier':
            // Для кванторов добавляем переменную в окружение
            const quantEnv: ExtendedEnv = {
                variables: new Set([...env.variables]),
                funEnv: env.funEnv,
                formulas: env.formulas
            };
            quantEnv.variables.add(predAny.varName);
            checkPredicate(predAny.body, quantEnv);
            break;

        case 'formula':
            // Для ссылок на формулы проверяем существование формулы и аргументы
            const formulaRef = pred as unknown as FormulaRefPredicate;
            const formula = env.formulas.get(formulaRef.name);
            if (!formula) {
                throw new Error(`Undefined formula "${formulaRef.name}"`);
            }

            // Проверяем количество аргументов
            if (formulaRef.args.length !== formula.parameters.length) {
                throw new Error(`Formula "${formulaRef.name}" expects ${formula.parameters.length} arguments but got ${formulaRef.args.length}`);
            }

            // Проверяем каждый аргумент (используем базовую checkExpr из 8-й лабы)
            for (const arg of formulaRef.args) {
                // checkExpr возвращает число (количество значений), но нам нужна только проверка
                checkExpr(arg, env.variables, env.funEnv);
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

        case 'paren':
            checkPredicate(predAny.inner, env);
            break;

        case 'comparison':
            // Для сравнений используем базовую checkExpr
            checkExpr(predAny.left, env.variables, env.funEnv);
            checkExpr(predAny.right, env.variables, env.funEnv);
            break;

        case 'true':
        case 'false':
            // Константы всегда валидны
            break;

        case 'implies':
            // a -> b ≡ ¬a ∨ b
            const notLeft: Predicate = {
                kind: 'not',
                predicate: predAny.left
            };
            const orPred: Predicate = {
                kind: 'or',
                left: notLeft,
                right: predAny.right
            };
            checkPredicate(orPred, env);
            break;

        default:
            throw new Error(`Unknown predicate kind: ${predAny.kind}`);
    }
}

// // Функция для проверки выражений в предикатах
// function checkExpr(expr: Expr, varEnv: VarEnv, funEnv: FunEnv): number {
//     // Просто делегируем базовой функции из 8-й лабы
//     // Она вернет количество значений, но нам это не важно для предикатов
//     return checkExpr(expr, varEnv, funEnv);
// }
