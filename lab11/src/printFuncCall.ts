// Добавляем в начале файла, после других импортов
import { Arith, Context, Model } from "z3-solver";
import { FunctionDef as Lab08FunctionDef } from "../../lab08/src/funny";
import { AnnotatedModule, AnnotatedFunctionDef } from "lab10/src";

// Функция для вывода информации о контрпримере
export function printFuncCall(
    ctx: Context<"main">,
    f: Lab08FunctionDef,
    model: Model<"main">,
    module: AnnotatedModule,
    currentFunction?: AnnotatedFunctionDef
): string {
    // Создаем окружение для переменных
    const env = new Map<string, Arith<"main"> | any>();

    // Получаем значение переменной из модели
    const getValue = (name: string): string => {
        // Ищем декларацию в модели
        const decls = model.decls();
        for (const decl of decls) {
            if (decl.name() === name || decl.name().toString().endsWith(`_${name}`)) {
                const value = model.get(decl);
                return value ? value.toString() : "?";
            }
        }
        return "?";
    };

    // Получаем значения параметров
    const paramValues = f.parameters.map(p => {
        // Пробуем разные варианты имен
        const possibleNames = [p.name, `${f.name}_${p.name}`, `${p.name}_0`];
        for (const name of possibleNames) {
            const value = getValue(name);
            if (value !== "?") return `${p.name}=${value}`;
        }
        return `${p.name}=?`;
    }).join(", ");

    // Получаем значения возвращаемых переменных
    const returnValues = f.returns.map(r => {
        const possibleNames = [r.name, `${f.name}_${r.name}_result`, `${r.name}_result`];
        for (const name of possibleNames) {
            const value = getValue(name);
            if (value !== "?") return `${r.name}=${value}`;
        }
        return `${r.name}=?`;
    }).join(", ");

    // Получаем значения локальных переменных
    const localValues = f.locals.map(l => {
        const possibleNames = [l.name, `${f.name}_${l.name}`, `local_${l.name}`];
        for (const name of possibleNames) {
            const value = getValue(name);
            if (value !== "?") return `  ${l.name}=${value}`;
        }
        return `  ${l.name}=?`;
    });

    // Формируем вывод
    let text = `${f.name}(${paramValues}) => [${returnValues}]`;

    if (localValues.length > 0) {
        text += "\n" + localValues.join("\n");
    }

    return text;
}
// Исправленная функция получения значения из модели
export function printFuncCallSimple(
    f: Lab08FunctionDef,
    model: Model<"main">
): string {
    const getValue = (name: string): string => {
        const decls = model.decls();

        // Пробуем разные варианты имен переменных
        const possibleNames = [
            name,  // Обычное имя
            `${f.name}_${name}`,  // Префикс с именем функции
            `${name}_0`,  // С суффиксом
            `${name}_result`,  // Для возвращаемых значений
            `call_${name}`,  // Для результатов вызовов
            `${f.name}_${name}_result`  // Полное имя для результатов
        ];

        for (const possibleName of possibleNames) {
            const decl = decls.find(d => d.name() === possibleName);
            if (decl) {
                const value = model.get(decl);
                if (value) {
                    // Пробуем получить числовое значение
                    try {
                        const num = parseInt(value.toString());
                        if (!isNaN(num)) return num.toString();
                    } catch {
                        // Если не число, возвращаем как есть
                        return value.toString();
                    }
                    return value.toString();
                }
            }
        }

        // Если не нашли, ищем по частичному совпадению
        for (const decl of decls) {
            const declName = decl.name();
            if (declName.toString().includes(name) || name.includes(declName.toString())) {
                const value = model.get(decl);
                if (value) return value.toString();
            }
        }

        return "?";
    };

    const argsText = f.parameters.map(p => `${p.name}=${getValue(p.name)}`).join(", ");
    const resultsText = f.returns.map(r => `${r.name}=${getValue(r.name)}`).join(", ");

    let text = `${f.name}(${argsText}) => [${resultsText}]`;

    // Для локальных переменных пробуем найти значения
    const localValues: string[] = [];
    for (const v of f.locals) {
        const value = getValue(v.name);
        if (value !== "?") {
            localValues.push(`  ${v.name}=${value}`);
        }
    }

    if (localValues.length > 0) {
        text += "\n" + localValues.join("\n");
    }

    // Если не нашли значений, добавляем отладочную информацию
    if (argsText.includes("=?") || resultsText.includes("=?")) {
        const declNames = model.decls().map(d => d.name()).join(", ");
        text += `\n  [Available variables in model: ${declNames}]`;
    }

    return text;
}
