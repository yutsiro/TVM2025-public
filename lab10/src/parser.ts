import { MatchResult, Semantics } from 'ohm-js';
import grammar, { FunnierActionDict } from './funnier.ohm-bundle';
import {
    AnnotatedModule,
    AnnotatedFunctionDef,
    FormulaDef,
    FormulaRefPredicate,
    Predicate,
    Quantifier,
    NotPred,
    OrPred,
    AndPred,
    ParenPred
} from './funnier';
import * as ast from '../../lab08/src/funny';
import { getFunnyAst as baseAst, foldLogicalChain, repeatPrefix } from '../../lab08/src/parser';

function parseOptional<T>(node: any, fallback: T): T {
    return node.children.length > 0
        ? (node.child(0).parse() as T)
        : fallback;
}

function collectList<T>(node: any): T[] {
    if (node.numChildren === 0) {
        return [];
    }
    return node.children.map((c: any) => c.parse() as T);
}

const getFunnierAst = {
    ...baseAst,

    NonemptyListOf(first, _separator, rest) {
        const result = [first.parse()];
        for (const item of rest.children) {
            result.push(item.children[1].parse());
        }
        return result;
    },

    Module(formulasNode, functionsNode) {
        const formulas = formulasNode.children.map(
            (f: any) => f.parse() as FormulaDef
        );
        const functions = functionsNode.children.map(
            (f: any) => f.parse() as AnnotatedFunctionDef
        );
        return {
            type: 'module',
            formulas,
            functions,
        } as AnnotatedModule;
    },

    Formula(name, _lp, params, _rp, _arrow, predicate) {
        return {
            type: 'formula',
            name: name.sourceString,
            parameters: params.parse() as ast.ParameterDef[],
            body: predicate.parse() as Predicate,
        } as FormulaDef;
    },

    Function(name, _lp, params, _rp, preCondOpt, ret, postCondOpt, usesOpt, stmt) {
        return {
            type: 'fun',
            name: name.sourceString,
            parameters: params.parse() as ast.ParameterDef[],
            returns: ret.parse() as ast.ParameterDef[],
            locals: parseOptional(usesOpt, []),
            body: stmt.parse() as ast.Statement,
            requires: parseOptional(preCondOpt, null),
            ensures: parseOptional(postCondOpt, null),
        } as AnnotatedFunctionDef;
    },

    While(_while, _lp, cond, _rp, invOpt, body) {
            return {
                type: "while",
                condition: cond.parse() as ast.Condition,
                invariant: parseOptional<Predicate | null>(invOpt, null),
                body: body.parse() as ast.Statement,
            } as ast.WhileStmt;
        },

    PreCond(_requires, predicate) {
        return predicate.parse() as Predicate;
    },

    PostCond(_ensures, predicate) {
        return predicate.parse() as Predicate;
    },

    Invariant(_invariant, predicate) {
        return predicate.parse() as Predicate;
    },

    Quantifier(qType, _lp, param, _bar, predicate, _rp) {
        const quant = qType.sourceString as 'forall' | 'exists';
        const paramDef = param.parse() as ast.ParameterDef;
        return {
            kind: 'quantifier',
            quant,
            varName: paramDef.name,
            varType: paramDef.paramType,
            body: predicate.parse() as Predicate,
        } as Quantifier;
    },

    FormulaRef(name, _lp, args, _rp) {
        return {
            kind: 'formula' as const,
            name: name.sourceString,
            args: args.parse() as ast.Expr[],
        } as FormulaRefPredicate;
    },

    ImplyCond_imply(orCond, _arrow, rest) {
        return {
            kind: "implies",
            left: orCond.parse() as ast.Condition,
            right: rest.parse() as ast.Condition,
        } as ast.ImpliesCond;
    },

    ImplyPred_imply(orPred, _arrow, rest) {
        const left = orPred.parse() as Predicate;
        const right = rest.parse() as Predicate;

        const notLeft: NotPred = {
            kind: "not",
            predicate: left,
        };
        return {
            kind: "or",
            left: notLeft,
            right,
        } as OrPred;
    },

    OrPred(first, _ops, rest) {
        return foldLogicalChain<Predicate>(first, rest, (left, right) => ({
            kind: "or",
            left,
            right,
        } as OrPred));
    },

    AndPred(first, _ops, rest) {
        return foldLogicalChain<Predicate>(first, rest, (left, right) => ({
            kind: "and",
            left,
            right,
        } as AndPred));
    },

    NotPred(nots, atom) {
        return repeatPrefix<Predicate>(nots, atom, (predicate) => ({
            kind: "not",
            predicate,
        } as NotPred));
    },

    AtomPred_true(_t) {
        return { kind: "true" } as ast.TrueCond;
    },

    AtomPred_false(_f) {
        return { kind: "false" } as ast.FalseCond;
    },

    AtomPred_paren(_lp, pred, _rp) {
        return {
            kind: "paren",
            inner: pred.parse() as Predicate,
        } as ParenPred;
    },

    EmptyListOf() {
        return [];
    },

    _terminal() {
        return this.sourceString;
    }
} satisfies FunnierActionDict<any>;

export const semantics: FunnySemanticsExt = grammar.Funnier.createSemantics() as FunnySemanticsExt;
semantics.addOperation("parse()", getFunnierAst);

export interface FunnySemanticsExt extends Semantics {
    (match: MatchResult): FunnyActionsExt;
}

interface FunnyActionsExt {
    parse(): AnnotatedModule;
}

export function parseFunnier(source: string, origin?: string): AnnotatedModule {
    const matchResult = grammar.Funnier.match(source, "Module");

    if (matchResult.failed()) {
        const message = origin
            ? `Error in ${origin}: ${matchResult.message}`
            : matchResult.message;
        throw new SyntaxError(message);
    }

    const ast_module = semantics(matchResult).parse();
    return ast_module;
}
