import { ReversePolishNotationActionDict } from "./rpn.ohm-bundle";

export const rpnCalc = {
  Expr_num(n) {
    return n.calculate();
  },
  Expr_add(left, right, _op) {
    return left.calculate() + right.calculate();
  },
  Expr_mul(left, right, _op) {
    return left.calculate() * right.calculate();
  },
  number_digits(ds) {
    return parseInt(ds.sourceString, 10);
  }
} satisfies ReversePolishNotationActionDict<number>;
