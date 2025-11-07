import { Dict, MatchResult, Semantics } from "ohm-js";
import grammar, { AddMulActionDict } from "./addmul.ohm-bundle";

export const addMulSemantics: AddMulSemantics = grammar.createSemantics() as AddMulSemantics;

const addMulCalc = {
  Expr_main(e) {
    return e.calculate();
  },
  AddExpr_add(left, _op, right) {
    return left.calculate() + right.calculate();
  },
  AddExpr_mul(e) {
    return e.calculate();
  },
  MulExpr_mul(left, _op, right) {
    return left.calculate() * right.calculate();
  },
  MulExpr_pri(e) {
    return e.calculate();
  },
  Atom_paren(_lp, e, _rp) {
    return e.calculate();
  },
  Atom_num(n) {
    return n.calculate();
  },
  number_digits(ds) {
    return parseInt(ds.sourceString, 10);
  }
} satisfies AddMulActionDict<number>;

addMulSemantics.addOperation<Number>("calculate()", addMulCalc);

interface AddMulDict extends Dict {
  calculate(): number;
}

interface AddMulSemantics extends Semantics {
  (match: MatchResult): AddMulDict;
}
