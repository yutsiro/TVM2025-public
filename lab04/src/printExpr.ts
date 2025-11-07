import { Expr, NumberLiteral, Variable, UnaryExpr, BinaryExpr } from './ast';

const precedence: { [op: string]: number } = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  'unary-': 3,
};

export function printExpr(e: Expr, parentPrecedence: number = 0): string {
  switch (e.kind) {
    case 'number': // просто число возвращаем как строку
      return e.value.toString();

    case 'variable': // узел-переменную возвращаем ее имя
      return e.name;

    case 'unary': {
      const opPrecedence = precedence['unary-']; // узнали приоритет унарного минуса
      const argStr = printExpr(e.argument, opPrecedence); // определяем аргумент и его приоритет
      const result = `-${argStr}`; // склеиваем строку '-x'
      return parentPrecedence >= opPrecedence ? `(${result})` : result; // если внеш сильнее по приоритету оборачиваем в скобки
    }

    case 'binary': {
      const opPrecedence = precedence[e.operator];
      const leftStr = printExpr(e.left, opPrecedence);
      const rightStr = printExpr(e.right, opPrecedence);

      // проверяем нужно ли добавить скобки для правого подвыражения
      const rightNeedsParens =
        e.right.kind === 'binary' &&
        (e.operator === '-' || e.operator === '/') &&
        precedence[e.right.operator] <= opPrecedence;

      const result = `${leftStr} ${e.operator} ${rightNeedsParens ? `(${rightStr})` : rightStr}`;
      return parentPrecedence > opPrecedence ? `(${result})` : result;
    }
  }
}
