import { writeFileSync } from "fs";
import { Op, I32, Void, c, BufferedEmitter, LocalEntry, ExportEntry } from "../../wasm";
import {
    Module, FunctionDef, Statement, Expr, LValue, Condition,
    FuncCallExpr, ArrAccessExpr, VarLValue, ArrLValue,
    Assignment, Block, IfStmt, WhileStmt, ExprStmt
} from "../../lab08";

const {
    i32,
    varuint32,
    get_local,
    local_entry,
    set_local,
    call,
    if_,
    void_block,
    void_loop,
    br_if,
    str_ascii,
    export_entry,
    external_kind,
    func_type_m,
    function_body,
    type_section,
    function_section,
    export_section,
    code_section,
    module: wasm_module,
    br
} = c;

export async function compileModule<M extends Module>(m: M, name?: string): Promise<WebAssembly.Exports> {
    const typeSection: any[] = [];
    const functionSection: any[] = [];
    const exportSection: ExportEntry[] = [];
    const codeSection: any[] = [];

    const functionIndexMap = new Map<string, number>();

    for (let i = 0; i < m.functions.length; i++) {
        const func = m.functions[i];

        functionIndexMap.set(func.name, i);

        const paramTypes = func.parameters.map(() => i32);
        const returnTypes = func.returns.map(() => i32);

        typeSection.push(func_type_m(paramTypes, returnTypes));
        functionSection.push(varuint32(i));

        exportSection.push(export_entry(str_ascii(func.name), external_kind.function, varuint32(i)));
    }

    for (let i = 0; i < m.functions.length; i++) {
        const func = m.functions[i];

        const allLocals: string[] = [
            ...func.parameters.map(p => p.name),
            ...func.returns.map(r => r.name),
            ...func.locals.map(l => l.name)
        ];

        const localEntries: LocalEntry[] = [
            local_entry(varuint32(allLocals.length), i32)
        ];

        const bodyOps: (Op<Void> | Op<I32>)[] = compileStatement(func.body, allLocals, functionIndexMap);

        for (const ret of func.returns) {
            const index = allLocals.indexOf(ret.name);
            bodyOps.push(get_local(i32, index));
        }

        codeSection.push(function_body(localEntries, bodyOps));
    }

    const mod = wasm_module([
        type_section(typeSection),
        function_section(functionSection),
        export_section(exportSection),
        code_section(codeSection)
    ]);

    const emitter = new BufferedEmitter(new ArrayBuffer(mod.z));
    mod.emit(emitter);

    const wasmModule = await WebAssembly.instantiate(emitter.buffer);
    return wasmModule.instance.exports;
}

function compileExpr(expr: Expr, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    if (typeof expr === "object") {
        const exprObj = expr as any;

        if (exprObj.type === "funccall") {
            return compileFuncCall(exprObj, locals, functionIndexMap);
        } else if (exprObj.type === "arraccess") {
            return compileArrayAccess(exprObj, locals, functionIndexMap);
        }

        const kind = exprObj.kind || exprObj.type;

        switch (kind) {
            case "number":
                return i32.const(exprObj.value);

            case "variable":
            case "var":
                const index = locals.indexOf(exprObj.name);
                if (index < 0) throw new Error(`Unknown local variable: ${exprObj.name}`);
                return get_local(i32, index);

            case "unary":
            case "neg":
                const arg = exprObj.argument || exprObj.arg;
                return i32.mul(i32.const(-1), compileExpr(arg, locals, functionIndexMap));

            case "binary":
            case "bin": {
                const left = compileExpr(exprObj.left, locals, functionIndexMap);
                const right = compileExpr(exprObj.right, locals, functionIndexMap);

                const operator = exprObj.operator;

                if (!operator) {
                    console.log("Binary expression without operator:", exprObj);
                    throw new Error("Binary expression missing operator");
                }

                switch (operator) {
                    case '+': return i32.add(left, right);
                    case '-': return i32.sub(left, right);
                    case '*': return i32.mul(left, right);
                    case '/': return i32.div_s(left, right);
                    default: throw new Error(`Unknown binary operator: ${operator}`);
                }
            }

            default:
                console.log("Unknown expr:", exprObj);
                throw new Error(`Unknown expression type: ${kind}`);
        }
    }

    console.log("Unexpected expr type:", expr);
    throw new Error("Unexpected expression type");
}

function compileFuncCall(call: FuncCallExpr, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const args = call.args.map(arg => compileExpr(arg, locals, functionIndexMap));
    const funcIndex = functionIndexMap.get(call.name);

    if (funcIndex === undefined) {
        throw new Error(`Unknown function: ${call.name}`);
    }

    return c.call(i32, varuint32(funcIndex), args);
}

function compileArrayAccess(access: ArrAccessExpr, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    const tempLValue: ArrLValue = {
        type: "larr",
        name: access.name,
        index: access.index
    };

    const arrayIndex = compileExpr(tempLValue.index, locals, functionIndexMap);
    const arrayAccess = compileLValue(tempLValue, locals, functionIndexMap);
    return arrayAccess.get();
}

function compileLValue(lvalue: LValue, locals: string[], functionIndexMap: Map<string, number>):
    { set: (value: Op<I32>) => Op<Void>, get: () => Op<I32> } {

    switch (lvalue.type) {
        case "lvar": {
            const index = locals.indexOf(lvalue.name);
            if (index === -1) {
                throw new Error(`Variable '${lvalue.name}' not found in locals`);
            }

            return {
                set: (value: Op<I32>) => set_local(index, value),
                get: () => get_local(i32, index)
            };
        }

        case "larr": {
            const arrayIndex = locals.indexOf(lvalue.name);
            if (arrayIndex === -1) {
                throw new Error(`Array '${lvalue.name}' not found in locals`);
            }

            const indexExpr = compileExpr(lvalue.index, locals, functionIndexMap);

            const baseAddress = get_local(i32, arrayIndex);

            const elementOffset = i32.mul(indexExpr, i32.const(4));
            const elementAddress = i32.add(baseAddress, elementOffset);

            return {
                set: (value: Op<I32>) => {
                    return i32.store(
                        [varuint32(4), 0 as any],
                        elementAddress,
                        value
                    );
                },
                get: () => {
                    return i32.load(
                        [varuint32(4), 0 as any],
                        elementAddress
                    );
                }
            };
        }

        default:
            throw new Error(`Unknown LValue type: ${(lvalue as any).type}`);
    }
}

function compileCondition(cond: Condition, locals: string[], functionIndexMap: Map<string, number>): Op<I32> {
    switch (cond.kind) {
        case "true":
            return i32.const(1);

        case "false":
            return i32.const(0);

        case "comparison": {
            const left = compileExpr(cond.left, locals, functionIndexMap);
            const right = compileExpr(cond.right, locals, functionIndexMap);
            switch (cond.op) {
                case "==": return i32.eq(left, right);
                case "!=": return i32.ne(left, right);
                case ">": return i32.gt_s(left, right);
                case "<": return i32.lt_s(left, right);
                case ">=": return i32.ge_s(left, right);
                case "<=": return i32.le_s(left, right);
                default: throw new Error(`Unknown comparison operator: ${cond.op}`);
            }
        }

        case "not": {
            const inside = compileCondition(cond.condition, locals, functionIndexMap);
            return i32.eqz(inside);
        }

        case "and": {
            return if_(
                i32,
                compileCondition(cond.left, locals, functionIndexMap),
                [compileCondition(cond.right, locals, functionIndexMap)],
                [i32.const(0)]
            );
        }

        case "or": {
            return if_(
                i32,
                compileCondition(cond.left, locals, functionIndexMap),
                [i32.const(1)],
                [compileCondition(cond.right, locals, functionIndexMap)]
            );
        }

        case "implies": {
            // A => B эквивалентно !A || B
            const notA = i32.eqz(compileCondition(cond.left, locals, functionIndexMap));
            const B = compileCondition(cond.right, locals, functionIndexMap);

            return if_(
                i32,
                notA,
                [i32.const(1)],
                [B]
            );
        }

        case "paren":
            return compileCondition(cond.inner, locals, functionIndexMap);

        default:
            console.log("Unknown condition:", cond);
            throw new Error(`Unknown condition kind: ${(cond as any).kind}`);
    }
}

function compileStatement(stmt: Statement, locals: string[], functionIndexMap: Map<string, number>): (Op<Void> | Op<I32>)[] {
    const ops: (Op<Void> | Op<I32>)[] = [];

    switch (stmt.type) {
        case "block": {
            for (const sub of (stmt as Block).statements) {
                ops.push(...compileStatement(sub, locals, functionIndexMap));
            }
            break;
        }

        case "assignment": {
            const assignStmt = stmt as Assignment;

            const exprValues: Op<I32>[] = [];
            for (const expr of assignStmt.exprs) {
                exprValues.push(compileExpr(expr, locals, functionIndexMap));
            }

            for (let i = assignStmt.targets.length - 1; i >= 0; i--) {
                const target = assignStmt.targets[i];
                const lvalue = compileLValue(target, locals, functionIndexMap);
                ops.push(lvalue.set(exprValues[i]));
            }
            break;
        }

        case "if": {
            const ifStmt = stmt as IfStmt;
            const condition = compileCondition(ifStmt.condition, locals, functionIndexMap);
            const thenOps = compileStatement(ifStmt.then, locals, functionIndexMap);
            const elseOps = ifStmt.else ? compileStatement(ifStmt.else, locals, functionIndexMap) : [];

            const ifOp = void_block([if_(c.void, condition, thenOps, elseOps)]);
            ops.push(ifOp);
            break;
        }

        case "while": {
            const whileStmt = stmt as WhileStmt;
            const condition = compileCondition(whileStmt.condition, locals, functionIndexMap);
            const bodyOps = compileStatement(whileStmt.body, locals, functionIndexMap);

            const whileLoop = void_block([
                void_loop([
                    br_if(1, i32.eqz(condition)),
                    ...bodyOps,
                    br(0)
                ])
            ]);

            ops.push(whileLoop);
            break;
        }

        case "expr": {
            const exprStmt = stmt as ExprStmt;
            ops.push(compileExpr(exprStmt.expr, locals, functionIndexMap));
            break;
        }

        default:
            console.log("Unknown statement:", stmt);
            throw new Error(`Unknown statement type: ${(stmt as any).type}`);
    }

    return ops;
}

export { FunnyError } from '../../lab08';
