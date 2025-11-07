import { MatchResult } from "ohm-js";
import grammar from "./rpn.ohm-bundle";
import { rpnSemantics } from "./semantics";

export class SyntaxError extends Error {}

export function evaluate(content: string): number {
  const match = parse(content);
  return rpnSemantics(match).calculate();
}

export function maxStackDepth(content: string): number {
  const match = parse(content);
  return rpnSemantics(match).stackDepth.max;
}

function parse(content: string): MatchResult {
  const match = grammar.match(content);
  if (!match.succeeded()) {
    throw new SyntaxError(match.message || "Invalid RPN expression");
  }
  return match;
}
