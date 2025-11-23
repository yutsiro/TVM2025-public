import { Expr } from "../../lab04";

export function cost(e: Expr): number {
    switch (e.kind) {
        case 'number':
            return 0;
        case 'variable':
            return 1;
        case 'unary':
            const arg_cost = cost(e.argument);
            return 1 + arg_cost;
        case 'binary':
            const left_cost = cost(e.left);
            const right_cost = cost(e.right);
            return 1 + left_cost + right_cost;
    }
}
