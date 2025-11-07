import { MatchResult } from "ohm-js";
import grammar, { ArithmeticActionDict, ArithmeticSemantics } from "./arith.ohm-bundle";

export const arithSemantics: ArithmeticSemantics = grammar.createSemantics() as ArithmeticSemantics;

const arithCalc = {
  Expr_add(e: any) {
    return e.calculate(this.args.params);
  },
  AddExpr_binary(first: any, operators: any, rest: any) {
    let acc = first.calculate(this.args.params);
    const n = operators.children.length;
    for (let i = 0; i < n; i++) {
      const op = operators.child(i).sourceString;
      const rhs = rest.child(i).calculate(this.args.params);
      if (op === "+") acc += rhs;
      else acc -= rhs;
    }
    return acc;
  },
  MulExpr_binary(first: any, operators: any, rest: any) {
    let acc = first.calculate(this.args.params);
    const n = operators.children.length;
    for (let i = 0; i < n; i++) {
      const op = operators.child(i).sourceString;
      const rhs = rest.child(i).calculate(this.args.params);
      if (op === "*") acc *= rhs;
      else {
        if (rhs === 0) throw new Error("Division by zero");
        acc /= rhs;
      }
    }
    return acc;
  },
  Unary_neg(_op: any, e: any) {
    return -e.calculate(this.args.params);
  },
  PriExpr_num(n: any) {
    return n.calculate(this.args.params);
  },
  PriExpr_var(v: any) {
    const name = v.sourceString;
    const params = this.args.params;
    if (!(name in params)) return NaN;
    return params[name];
  },
  PriExpr_parens(_lp: any, e: any, _rp: any) {
    return e.calculate(this.args.params);
  },
  number_digits(ds: any) {
    return parseInt(ds.sourceString, 10);
  },
} satisfies ArithmeticActionDict<number | undefined>;

arithSemantics.addOperation<Number>("calculate(params)", arithCalc);

export interface ArithActions {
  calculate(params: { [name: string]: number }): number;
}

export interface ArithSemantics extends ArithmeticSemantics {
  (match: MatchResult): ArithActions;
}
