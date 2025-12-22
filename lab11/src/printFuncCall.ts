import { Arith, Context, Model } from "z3-solver";
import { FunctionDef as Lab08FunctionDef } from "../../lab08/src/funny";
import { AnnotatedModule, AnnotatedFunctionDef } from "lab10/src";

export function printFuncCall(
    f: Lab08FunctionDef,
    model: Model<"main">
): string {
    const getValue = (name: string): string => {
        const decls = model.decls();

        const possibleNames = [
            name,
            `${f.name}_${name}`,
            `${name}_0`,
            `${name}_result`,
            `call_${name}`,
            `${f.name}_${name}_result`
        ];

        for (const possibleName of possibleNames) {
            const decl = decls.find(d => d.name() === possibleName);
            if (decl) {
                const value = model.get(decl);
                if (value) {
                    try {
                        const num = parseInt(value.toString());
                        if (!isNaN(num)) return num.toString();
                    } catch {
                        return value.toString();
                    }
                    return value.toString();
                }
            }
        }

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

    if (argsText.includes("=?") || resultsText.includes("=?")) {
        const declNames = model.decls().map(d => d.name()).join(", ");
        text += `\n  [Available variables in model: ${declNames}]`;
    }

    return text;
}
