import { Expr } from "../../lab04";

export function derive(e: Expr, varName: string): Expr {
  switch (e.kind) {
    case 'number':
      return { kind: 'number', value: 0 };

    case 'variable':
      return { kind: 'number', value: e.name === varName ? 1 : 0 };

    case 'unary':
        const op = e.operator;
      if (e.operator === '-') {
        return simplify({ kind: 'unary', operator: '-', argument: derive(e.argument, varName) });
      }
      throw new Error("Unsupported unary operator " + op);

    case 'binary':
      const leftD = derive(e.left, varName);
      const rightD = derive(e.right, varName);

      switch (e.operator) {
        case '+':
          return simplify({ kind: 'binary', operator: '+', left: leftD, right: rightD });

        case '-':
          return simplify({ kind: 'binary', operator: '-', left: leftD, right: rightD });

        case '*':
          // d(f*g) = d(f)*g + f*d(g)
          return simplify({
            kind: 'binary',
            operator: '+',
            left: { kind: 'binary', operator: '*', left: leftD, right: e.right },
            right: { kind: 'binary', operator: '*', left: e.left, right: rightD }
          });

        case '/':
          // d(f/g) = (d(f)*g - f*d(g)) / g^2
          return simplify({
            kind: 'binary',
            operator: '/',
            left: {
              kind: 'binary',
              operator: '-',
              left: { kind: 'binary', operator: '*', left: leftD, right: e.right },
              right: { kind: 'binary', operator: '*', left: e.left, right: rightD }
            },
            right: {
              kind: 'binary',
              operator: '*',
              left: e.right,
              right: e.right
            }
          });

        default:
          const eAny = e as Expr;
          throw new Error("Unsupported binary operator " + eAny.kind);
      }

    default:
      const eAny = e as Expr;
      throw new Error("Unknown AST node kind " + eAny.kind);
  }
}

function isZero(e: Expr): boolean {
  return e.kind === 'number' && e.value === 0;
}

function isOne(e: Expr): boolean {
  return e.kind === 'number' && e.value === 1;
}

function simplify(e: Expr): Expr {
  if (e.kind === 'binary') {
    const l = simplify(e.left);
    const r = simplify(e.right);

    switch (e.operator) {
      case '*':
        if (isZero(l) || isZero(r)) return { kind: 'number', value: 0 };
        if (isOne(l)) return r;
        if (isOne(r)) return l;
        break;

      case '+':
        if (isZero(l)) return r;
        if (isZero(r)) return l;
        break;

      case '-':
        if (isZero(r)) return l;
        if (isZero(l)) return simplify({ kind: 'unary', operator: '-', argument: r });
        break;

      case '/':
        if (isZero(l)) return { kind: 'number', value: 0 };
        if (isOne(r)) return l;
        break;
    }
    return { ...e, left: l, right: r };
  }

  if (e.kind === 'unary' && e.operator === '-') {
    const argSimpl = simplify(e.argument);

    if (argSimpl.kind === 'unary' && argSimpl.operator === '-') {
      return simplify(argSimpl.argument); // --x = x
    }

    if (argSimpl.kind === 'number' && argSimpl.value === 0) {
      return argSimpl; //ноль без палочки
    }

    if (argSimpl.kind === 'binary' && argSimpl.operator === '/') {
      const divLeft = simplify(argSimpl.left);
      if (divLeft.kind === 'unary' && divLeft.operator === '-') {
        return simplify({
          kind: 'binary',
          operator: '/',
          left: simplify(divLeft.argument),
          right: simplify(argSimpl.right)
        });
      }
    }

    return { kind: 'unary', operator: '-', argument: argSimpl };
  }

  return e;
}
