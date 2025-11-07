export type Expr = NumberLiteral | Variable | UnaryExpr | BinaryExpr;

export interface NumberLiteral {
  kind: 'number';
  value: number;
}

export interface Variable {
  kind: 'variable';
  name: string;
}

export interface UnaryExpr {
  kind: 'unary';
  operator: '-';
  argument: Expr;
}

export interface BinaryExpr {
  kind: 'binary';
  operator: '+' | '-' | '*' | '/';
  left: Expr;
  right: Expr;
}
