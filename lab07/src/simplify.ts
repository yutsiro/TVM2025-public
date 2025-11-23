import { Expr } from "../../lab04";

export function simplify(e: Expr, identities: [Expr, Expr][]): Expr {
    let expanded = expandAllParentheses(e);
    let simplified = simplifyFully(expanded, identities);

    return combineLikeTerms(simplified);
}

function combineLikeTerms(expr: Expr): Expr {
    switch (expr.kind) {
        case 'binary':
            if (expr.operator === '+' || expr.operator === '-') {
                return combineTermsInSum(expr);
            }
            if (expr.operator === '*') {
                return combineTermsInProduct(expr);
            }
            return {
                ...expr,
                left: combineLikeTerms(expr.left),
                right: combineLikeTerms(expr.right)
            };
        case 'unary':
            return {
                ...expr,
                argument: combineLikeTerms(expr.argument)
            };
        default:
            return expr;
    }
}

function combineTermsInSum(expr: Expr): Expr {
    if (expr.kind !== 'binary' || (expr.operator !== '+' && expr.operator !== '-')) {
        return expr;
    }

    // Собираем все члены суммы в массив с учетом знаков
    const terms: { expr: Expr, sign: number }[] = [];
    collectTerms(expr, 1, terms);

    // Группируем подобные члены
    const grouped = new Map<string, { coefficient: number, term: Expr }>();

    for (const { expr: term, sign } of terms) {
        const key = getTermKey(term);
        const existing = grouped.get(key);

        if (existing) {
            existing.coefficient += sign;
        } else {
            grouped.set(key, { coefficient: sign, term });
        }
    }

    // Создаем новое выражение из сгруппированных членов
    const newTerms: Expr[] = [];

    for (const [key, { coefficient, term }] of grouped) {
        if (coefficient === 0) continue;

        if (coefficient === 1) {
            newTerms.push(term);
        } else if (coefficient === -1) {
            newTerms.push({
                kind: 'unary',
                operator: '-',
                argument: term
            });
        } else {
            // Создаем коэффициент * терм
            const coefficientExpr: Expr = { kind: 'number', value: Math.abs(coefficient) };
            const product: Expr = {
                kind: 'binary',
                operator: '*',
                left: coefficientExpr,
                right: term
            };

            if (coefficient > 0) {
                newTerms.push(product);
            } else {
                newTerms.push({
                    kind: 'unary',
                    operator: '-',
                    argument: product
                });
            }
        }
    }

    // Собираем все члены обратно в сумму
    if (newTerms.length === 0) {
        return { kind: 'number', value: 0 };
    }

    let result = newTerms[0];
    for (let i = 1; i < newTerms.length; i++) {
        result = {
            kind: 'binary',
            operator: '+',
            left: result,
            right: newTerms[i]
        };
    }

    return result;
}

function collectTerms(expr: Expr, sign: number, terms: { expr: Expr, sign: number }[]): void {
    if (expr.kind === 'binary' && (expr.operator === '+' || expr.operator === '-')) {
        const rightSign = expr.operator === '+' ? sign : -sign;
        collectTerms(expr.left, sign, terms);
        collectTerms(expr.right, rightSign, terms);
    } else if (expr.kind === 'unary' && expr.operator === '-') {
        collectTerms(expr.argument, -sign, terms);
    } else {
        terms.push({ expr, sign });
    }
}

function getTermKey(term: Expr): string {
    // Создаем ключ для группировки подобных членов
    if (term.kind === 'binary' && term.operator === '*') {
        // Для произведений: сортируем множители
        const factors: string[] = [];
        collectFactors(term, factors);
        factors.sort();
        return factors.join('*');
    } else {
        // Для простых членов
        return JSON.stringify(normalizeTerm(term));
    }
}

function collectFactors(expr: Expr, factors: string[]): void {
    if (expr.kind === 'binary' && expr.operator === '*') {
        collectFactors(expr.left, factors);
        collectFactors(expr.right, factors);
    } else {
        factors.push(JSON.stringify(normalizeTerm(expr)));
    }
}

function normalizeTerm(term: Expr): Expr {
    // Приводим терм к каноническому виду для сравнения
    switch (term.kind) {
        case 'binary':
            if (term.operator === '*' || term.operator === '+') {
                // Для коммутативных операций сортируем аргументы
                const left = normalizeTerm(term.left);
                const right = normalizeTerm(term.right);

                if (shouldSwap(left, right)) {
                    return { ...term, left: right, right: left };
                }
                return { ...term, left, right };
            }
            return term;
        default:
            return term;
    }
}

function shouldSwap(a: Expr, b: Expr): boolean {
    // Определяем порядок для канонической формы
    if (a.kind === 'number' && b.kind !== 'number') return false;
    if (a.kind !== 'number' && b.kind === 'number') return true;
    if (a.kind === 'variable' && b.kind === 'variable') return a.name > b.name;
    return false;
}

function combineTermsInProduct(expr: Expr): Expr {
    if (expr.kind !== 'binary' || expr.operator !== '*') {
        return expr;
    }

    // Собираем все множители
    const factors: Expr[] = [];
    collectAllFactors(expr, factors);

    // Группируем числовые множители и одинаковые переменные
    let numericFactor = 1;
    const variableFactors = new Map<string, number>();
    const otherFactors: Expr[] = [];

    for (const factor of factors) {
        if (factor.kind === 'number') {
            numericFactor *= factor.value;
        } else if (factor.kind === 'variable') {
            const count = variableFactors.get(factor.name) || 0;
            variableFactors.set(factor.name, count + 1);
        } else {
            otherFactors.push(factor);
        }
    }

    // Собираем результат обратно
    const resultFactors: Expr[] = [];

    // Числовой коэффициент
    if (numericFactor !== 1 || (variableFactors.size === 0 && otherFactors.length === 0)) {
        resultFactors.push({ kind: 'number', value: numericFactor });
    }

    // Переменные с показателями степени
    for (const [name, count] of variableFactors) {
        if (count === 1) {
            resultFactors.push({ kind: 'variable', name });
        } else {
            resultFactors.push({
                kind: 'binary',
                operator: '*',
                left: { kind: 'variable', name },
                right: { kind: 'number', value: count }
            });
        }
    }

    // Остальные множители
    resultFactors.push(...otherFactors);

    // Собираем произведение
    if (resultFactors.length === 0) {
        return { kind: 'number', value: 1 };
    }

    let result = resultFactors[0];
    for (let i = 1; i < resultFactors.length; i++) {
        result = {
            kind: 'binary',
            operator: '*',
            left: result,
            right: resultFactors[i]
        };
    }

    return result;
}

function collectAllFactors(expr: Expr, factors: Expr[]): void {
    if (expr.kind === 'binary' && expr.operator === '*') {
        collectAllFactors(expr.left, factors);
        collectAllFactors(expr.right, factors);
    } else {
        factors.push(expr);
    }
}

function expandAllParentheses(expr: Expr): Expr {
    switch (expr.kind) {
        case 'number':
        case 'variable':
            return expr;

        case 'unary':
            return {
                ...expr,
                argument: expandAllParentheses(expr.argument)
            };

        case 'binary':
            const left = expandAllParentheses(expr.left);
            const right = expandAllParentheses(expr.right);

            // Раскрываем скобки для умножения
            if (expr.operator === '*') {
                // Случай: (a + b) * c
                if (left.kind === 'binary' && (left.operator === '+' || left.operator === '-')) {
                    if (left.operator === '+') {
                        return {
                            kind: 'binary',
                            operator: '+',
                            left: expandAllParentheses({
                                kind: 'binary',
                                operator: '*',
                                left: left.left,
                                right: right
                            }),
                            right: expandAllParentheses({
                                kind: 'binary',
                                operator: '*',
                                left: left.right,
                                right: right
                            })
                        };
                    } else { // '-'
                        return {
                            kind: 'binary',
                            operator: '-',
                            left: expandAllParentheses({
                                kind: 'binary',
                                operator: '*',
                                left: left.left,
                                right: right
                            }),
                            right: expandAllParentheses({
                                kind: 'binary',
                                operator: '*',
                                left: left.right,
                                right: right
                            })
                        };
                    }
                }

                // Случай: a * (b + c)
                if (right.kind === 'binary' && (right.operator === '+' || right.operator === '-')) {
                    if (right.operator === '+') {
                        return {
                            kind: 'binary',
                            operator: '+',
                            left: expandAllParentheses({
                                kind: 'binary',
                                operator: '*',
                                left: left,
                                right: right.left
                            }),
                            right: expandAllParentheses({
                                kind: 'binary',
                                operator: '*',
                                left: left,
                                right: right.right
                            })
                        };
                    } else { // '-'
                        return {
                            kind: 'binary',
                            operator: '-',
                            left: expandAllParentheses({
                                kind: 'binary',
                                operator: '*',
                                left: left,
                                right: right.left
                            }),
                            right: expandAllParentheses({
                                kind: 'binary',
                                operator: '*',
                                left: left,
                                right: right.right
                            })
                        };
                    }
                }
            }

            // Для вычитания: a - (b + c) => a - b - c
            if (expr.operator === '-' && right.kind === 'binary' && right.operator === '+') {
                return {
                    kind: 'binary',
                    operator: '-',
                    left: expandAllParentheses({
                        kind: 'binary',
                        operator: '-',
                        left: left,
                        right: right.left
                    }),
                    right: right.right
                };
            }

            // Для вычитания: a - (b - c) => a - b + c
            if (expr.operator === '-' && right.kind === 'binary' && right.operator === '-') {
                return {
                    kind: 'binary',
                    operator: '+',
                    left: expandAllParentheses({
                        kind: 'binary',
                        operator: '-',
                        left: left,
                        right: right.left
                    }),
                    right: right.right
                };
            }

            // Для других операций просто рекурсивно обрабатываем подвыражения
            return { ...expr, left, right };
    }
}

function simplifyFully(expr: Expr, identities: [Expr, Expr][]): Expr {
    const maxIterations = 100;

    function simplifyRecursive(expr: Expr, iteration: number = 0): Expr {
        if (iteration > maxIterations) return expr;

        let current = simplifySubexpressions(expr);
        current = foldConstants(current);
        current = applyAlgebraicIdentities(current);

        let changed = true;
        let localIteration = 0;

        while (changed && localIteration < maxIterations) {
            changed = false;
            localIteration++;

            const before = JSON.stringify(current);

            // Применяем пользовательские тождества
            for (const [left, right] of identities) {
                const result1 = applyIdentityEverywhere(current, left, right);
                if (JSON.stringify(result1) !== before) {
                    current = result1;
                    changed = true;
                    break;
                }

                const result2 = applyIdentityEverywhere(current, right, left);
                if (JSON.stringify(result2) !== before) {
                    current = result2;
                    changed = true;
                    break;
                }
            }

            if (changed) {
                current = foldConstants(current);
                current = applyAlgebraicIdentities(current);
            }
        }

        return current;
    }

    function simplifySubexpressions(expr: Expr): Expr {
        switch (expr.kind) {
            case 'number':
            case 'variable':
                return expr;

            case 'unary':
                return {
                    ...expr,
                    argument: simplifyRecursive(expr.argument)
                };

            case 'binary':
                return {
                    ...expr,
                    left: simplifyRecursive(expr.left),
                    right: simplifyRecursive(expr.right)
                };
        }
    }

    return simplifyRecursive(expr);
}

function applyAlgebraicIdentities(expr: Expr): Expr {
    switch (expr.kind) {
        case 'binary':
            const left = applyAlgebraicIdentities(expr.left);
            const right = applyAlgebraicIdentities(expr.right);

            // a + (b - a) => b
            if (expr.operator === '+' && right.kind === 'binary' && right.operator === '-') {
                if (areEqual(left, right.right)) {
                    return right.left;
                }
                if (areEqual(left, right.left)) {
                    return right.right;
                }
            }

            // (a - b) + b => a
            if (expr.operator === '+' && left.kind === 'binary' && left.operator === '-') {
                if (areEqual(left.right, right)) {
                    return left.left;
                }
            }

            // a - (a - b) => b
            if (expr.operator === '-' && right.kind === 'binary' && right.operator === '-') {
                if (areEqual(left, right.left)) {
                    return right.right;
                }
            }

            // a + a => 2*a
            if (expr.operator === '+' && areEqual(left, right)) {
                return {
                    kind: 'binary',
                    operator: '*',
                    left: { kind: 'number', value: 2 },
                    right: left
                };
            }

            // a - a => 0
            if (expr.operator === '-' && areEqual(left, right)) {
                return { kind: 'number', value: 0 };
            }

            // Коммутативность: приводим к каноническому виду
            if (expr.operator === '+' || expr.operator === '*') {
                // Числа всегда справа
                if (left.kind === 'number' && right.kind !== 'number') {
                    return { ...expr, left: right, right: left };
                }
                // Переменные в алфавитном порядке
                if (left.kind === 'variable' && right.kind === 'variable' && left.name > right.name) {
                    return { ...expr, left: right, right: left };
                }
            }

            return { ...expr, left, right };

        default:
            return expr;
    }
}

function applyIdentityEverywhere(expr: Expr, pattern: Expr, replacement: Expr): Expr {
    let result = applyIdentity(expr, pattern, replacement);
    if (result !== expr) {
        return result;
    }

    switch (expr.kind) {
        case 'number':
        case 'variable':
            return expr;

        case 'unary':
            const simplifiedArg = applyIdentityEverywhere(expr.argument, pattern, replacement);
            return simplifiedArg !== expr.argument ?
                { ...expr, argument: simplifiedArg } : expr;

        case 'binary':
            const simplifiedLeft = applyIdentityEverywhere(expr.left, pattern, replacement);
            const simplifiedRight = applyIdentityEverywhere(expr.right, pattern, replacement);

            if (simplifiedLeft !== expr.left || simplifiedRight !== expr.right) {
                return { ...expr, left: simplifiedLeft, right: simplifiedRight };
            }
            return expr;
    }
}

function applyIdentity(expr: Expr, pattern: Expr, replacement: Expr): Expr {
    const match = matchPattern(expr, pattern);
    if (match) {
        return substitute(replacement, match);
    }
    return expr;
}

function matchPattern(expr: Expr, pattern: Expr): Map<string, Expr> | null {
    const mapping = new Map<string, Expr>();

    function match(e: Expr, p: Expr): boolean {
        if (p.kind === 'variable') {
            const existing = mapping.get(p.name);
            if (existing) {
                return areEqual(existing, e);
            } else {
                mapping.set(p.name, e);
                return true;
            }
        }

        if (e.kind !== p.kind) return false;

        if (e.kind === 'number' && p.kind === 'number') {
            return e.value === p.value;
        }

        if (e.kind === 'unary' && p.kind === 'unary') {
            return e.operator === p.operator && match(e.argument, p.argument);
        }

        if (e.kind === 'binary' && p.kind === 'binary') {
            // Для коммутативных операций проверяем оба порядка
            if ((e.operator === '+' || e.operator === '*') &&
                (p.operator === '+' || p.operator === '*')) {
                return (match(e.left, p.left) && match(e.right, p.right)) ||
                       (match(e.left, p.right) && match(e.right, p.left));
            }

            return e.operator === p.operator &&
                   match(e.left, p.left) &&
                   match(e.right, p.right);
        }

        return false;
    }

    return match(expr, pattern) ? mapping : null;
}

function substitute(expr: Expr, mapping: Map<string, Expr>): Expr {
    switch (expr.kind) {
        case 'number':
            return expr;

        case 'variable':
            return mapping.get(expr.name) || expr;

        case 'unary':
            return {
                ...expr,
                argument: substitute(expr.argument, mapping)
            };

        case 'binary':
            return {
                ...expr,
                left: substitute(expr.left, mapping),
                right: substitute(expr.right, mapping)
            };
    }
}

function areEqual(a: Expr, b: Expr): boolean {
    if (a.kind !== b.kind) return false;

    switch (a.kind) {
        case 'number':
            return a.value === (b as any).value;

        case 'variable':
            return a.name === (b as any).name;

        case 'unary':
            return a.operator === (b as any).operator &&
                   areEqual(a.argument, (b as any).argument);

        case 'binary':
            // Для коммутативных операций учитываем порядок
            if ((a.operator === '+' || a.operator === '*') &&
                ((b as any).operator === '+' || (b as any).operator === '*')) {
                return (areEqual(a.left, (b as any).left) && areEqual(a.right, (b as any).right)) ||
                       (areEqual(a.left, (b as any).right) && areEqual(a.right, (b as any).left));
            }

            return a.operator === (b as any).operator &&
                   areEqual(a.left, (b as any).left) &&
                   areEqual(a.right, (b as any).right);
    }
}

function foldConstants(expr: Expr): Expr {
    switch (expr.kind) {
        case 'binary':
            const left = foldConstants(expr.left);
            const right = foldConstants(expr.right);

            // Вычисление констант
            if (left.kind === 'number' && right.kind === 'number') {
                switch (expr.operator) {
                    case '+': return { kind: 'number', value: left.value + right.value };
                    case '-': return { kind: 'number', value: left.value - right.value };
                    case '*': return { kind: 'number', value: left.value * right.value };
                    case '/': return right.value !== 0 ?
                        { kind: 'number', value: left.value / right.value } :
                        { ...expr, left, right };
                }
            }

            // Базовые упрощения
            switch (expr.operator) {
                case '+':
                    if (right.kind === 'number' && right.value === 0) return left;
                    if (left.kind === 'number' && left.value === 0) return right;
                    // Коммутативность: собираем константы вместе
                    if (left.kind === 'binary' && left.operator === '+' && left.left.kind === 'number' && right.kind === 'number') {
                        return {
                            kind: 'binary',
                            operator: '+',
                            left: { kind: 'number', value: left.left.value + right.value },
                            right: left.right
                        };
                    }
                    break;

                case '-':
                    if (right.kind === 'number' && right.value === 0) return left;
                    if (areEqual(left, right)) return { kind: 'number', value: 0 };
                    break;

                case '*':
                    if ((left.kind === 'number' && left.value === 0) ||
                        (right.kind === 'number' && right.value === 0)) {
                        return { kind: 'number', value: 0 };
                    }
                    if (right.kind === 'number' && right.value === 1) return left;
                    if (left.kind === 'number' && left.value === 1) return right;
                    // Объединение констант
                    if (left.kind === 'binary' && left.operator === '*' &&
                        left.left.kind === 'number' && right.kind === 'number') {
                        return {
                            kind: 'binary',
                            operator: '*',
                            left: { kind: 'number', value: left.left.value * right.value },
                            right: left.right
                        };
                    }
                    if (left.kind === 'number' && right.kind === 'binary' && right.operator === '*' &&
                        right.left.kind === 'number') {
                        return {
                            kind: 'binary',
                            operator: '*',
                            left: { kind: 'number', value: left.value * right.left.value },
                            right: right.right
                        };
                    }
                    break;

                case '/':
                    if (left.kind === 'number' && left.value === 0) return left;
                    if (right.kind === 'number' && right.value === 1) return left;
                    if (areEqual(left, right)) return { kind: 'number', value: 1 };
                    break;
            }

            return { ...expr, left, right };

        case 'unary':
            const arg = foldConstants(expr.argument);
            if (arg.kind === 'number') {
                return { kind: 'number', value: -arg.value };
            }
            if (arg.kind === 'unary' && arg.operator === '-') {
                return arg.argument;
            }
            return { ...expr, argument: arg };

        default:
            return expr;
    }
}
