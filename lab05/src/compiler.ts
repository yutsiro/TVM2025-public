import { c as C, Op, I32 } from "../../wasm"; // c - набор типа wasm инструкций, OP - тип wasm операций, I32 - 32битные инструкции
import { Expr } from "../../lab04";
import { buildOneFunctionModule, Fn } from "./emitHelper";

export function getVariables(e: Expr): string[] { //обходим AST и собираем уникальные переменные
  const result: string[] = []; // массив имен переменных
  function walk(node: Expr): void {
    if (node.kind === "variable") { // если встречаем переменную и такой еще не было - добавляем
      if (!result.includes(node.name)) result.push(node.name);
    } else if (node.kind === "binary") { // рекурсивно проходимся по обеим ветвям если встречаем операцию
      walk(node.left);
      walk(node.right);
    } else if (node.kind === "unary") {
      walk(node.argument);
    }
  }
  walk(e);
  return result; // итог -- список переменных в порядке первого появления
}

export async function buildFunction(e: Expr, variables: string[]): Promise<Fn<number>> {
  const expr = wasm(e, variables); // делает wasm-инструкции из AST
  return await buildOneFunctionModule("test", variables.length, [expr]);
}
// buildOneFunctionModule создает модуль wasm, с одной экспортируемой функцией
// промис - обещание вернуть результат позже: тут - функцию

function wasm(e: Expr, args: string[]): Op<I32> {
  const varMap = new Map(args.map((name, i) => [name, i]));//Map: имя переменной->индекс аргумента

  function compile(node: Expr): Op<I32> {
    switch (node.kind) {
      case "number":
        return C.i32.const(node.value);

      case "variable": {
        const idx = varMap.get(node.name);
        if (idx === undefined) {
          throw new WebAssembly.RuntimeError(`Unknown variable: ${node.name}`);
        }
        return C.get_local(C.i32, idx);
      }

      case "unary": {
        const op = node.operator;
        if (op !== "-") {
            throw new Error(`Unknown unary operator: ${op}`);
        }
        const arg = compile(node.argument);
        return C.i32.sub(C.i32.const(0), arg);
      }

      case "binary": {
        const op = node.operator;
        const left = compile(node.left);
        const right = compile(node.right);
        switch (op) {
          case "+": return C.i32.add(left, right);
          case "-": return C.i32.sub(left, right);
          case "*": return C.i32.mul(left, right);
          case "/": return C.i32.div_s(left, right);
          default:
            throw new Error(`Unknown binary operator: ${op}`);
        }
      }

      default: {
        const _never: never = node;
        throw new Error(`Unknown node: ${(_never as any).kind}`);
      }
    }
  }

  return compile(e);
}
