import { MatchResult } from 'ohm-js';
import { arithGrammar, ArithmeticActionDict, ArithmeticSemantics } from '../../lab03';
import { Expr } from './ast';

export const getExprAst: ArithmeticActionDict<Expr> = {
  Expr_add(expr) {
    return expr.parse();
  },

  AddExpr_binary(left, op, right) {
    let result: Expr = left.parse();
    for (let i = 0; i < op.numChildren; i++) {
      result = {
        kind: 'binary',
        operator: op.child(i).sourceString as '+' | '-', //as <...> - ограничение на операторы
        left: result,
        right: right.child(i).parse(),
      };
    }
    return result;
  },

  MulExpr_binary(left, op, right) {
    let result: Expr = left.parse();
    for (let i = 0; i < op.numChildren; i++) {
      result = {
        kind: 'binary',
        operator: op.child(i).sourceString as '*' | '/',
        left: result,
        right: right.child(i).parse(),
      };
    }
    return result;
  },

  Unary_neg(op, expr) {
    return {
      kind: 'unary',
      operator: '-',
      argument: expr.parse(),
    };
  },

  Unary(expr) {
    return expr.parse();
  },

  PriExpr_num(num) {
    return {
      kind: 'number',
      value: parseInt(num.sourceString, 10),
    };
  },

  PriExpr_var(varNode) {
    return {
      kind: 'variable',
      name: varNode.sourceString,
    };
  },

  PriExpr_parens(_lparen, expr, _rparen) {
    return expr.parse();
  },
};

export const semantics = arithGrammar.createSemantics();
semantics.addOperation('parse()', getExprAst);

export interface ArithSemanticsExt extends ArithmeticSemantics {
  (match: MatchResult): ArithActionsExt;
}

export interface ArithActionsExt {
  parse(): Expr;
}

export function parseExpr(source: string): Expr {
  const match = arithGrammar.match(source); // ohm проверяет строку по грамматике
  if (match.failed()) { // если все ок, то
    throw new SyntaxError(match.message);
  }
  return semantics(match).parse(); //из структуры разбора -> объект AST (дерево типа)
}
