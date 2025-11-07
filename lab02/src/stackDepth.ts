import { ReversePolishNotationActionDict } from "./rpn.ohm-bundle";

export type StackDepth = { max: number; out: number };

export const rpnStackDepth = {
  Expr_num(_n: any) {
    return { max: 1, out: 1 }; //число занимает один слот в стеке
  },
  Expr_add(left: any, right: any, _op: any) {
    const l = left.stackDepth;
    const r = right.stackDepth;
    const maxBeforeRight = Math.max(l.max, l.out + r.max);
    return { max: maxBeforeRight, out: l.out + r.out - 1 };
  },
  Expr_mul(left: any, right: any, _op: any) {
    const l = left.stackDepth;
    const r = right.stackDepth;
    const maxBeforeRight = Math.max(l.max, l.out + r.max);
    return { max: maxBeforeRight, out: l.out + r.out - 1 };
  },
  number_digits(_ds: any) {
    return { max: 1, out: 1 };
  }
} satisfies ReversePolishNotationActionDict<StackDepth>;
