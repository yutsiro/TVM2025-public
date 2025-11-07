import { c as C, Op, I32 } from "../../wasm";
import { Expr } from "../../lab04";
import { buildOneFunctionModule, Fn } from "./emitHelper";

export function getVariables(e: Expr): string[] {
  const result: string[] = [];
  function walk(node: Expr): void {
    if (node.kind === "variable") {
      if (!result.includes(node.name)) result.push(node.name);
    } else if (node.kind === "binary") {
      walk(node.left);
      walk(node.right);
    } else if (node.kind === "unary") {
      walk(node.argument);
    }
  }
  walk(e);
  return result;
}

export async function buildFunction(e: Expr, variables: string[]): Promise<Fn<number>> {
  const expr = wasm(e, variables);
  return await buildOneFunctionModule("test", variables.length, [expr]);
}

function wasm(e: Expr, args: string[]): Op<I32> {
  const varMap = new Map(args.map((name, i) => [name, i]));

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
