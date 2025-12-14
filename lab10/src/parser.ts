import { MatchResult, Semantics } from 'ohm-js';
import grammar, { FunnierActionDict } from './funnier.ohm-bundle';
import {
    AnnotatedModule,
    AnnotatedFunctionDef,
    FormulaDef,
    FormulaRefPredicate
} from './funnier';
import * as ast from '../../lab08/src/funny';
import { getFunnyAst as baseAst } from '../../lab08/src/parser';

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
            body: predicate.parse() as ast.Predicate,
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

    PreCond(_requires, predicate) {
        return predicate.parse() as ast.Predicate;
    },

    PostCond(_ensures, predicate) {
        return predicate.parse() as ast.Predicate;
    },

    Invariant(_invariant, predicate) {
        return predicate.parse() as ast.Predicate;
    },

    Quantifier(qType, _lp, param, _bar, predicate, _rp) {
        const quant = qType.sourceString as 'forall' | 'exists';
        const paramDef = param.parse() as ast.ParameterDef;
        return {
            kind: 'quantifier',
            quant,
            varName: paramDef.name,
            varType: paramDef.paramType,
            body: predicate.parse() as ast.Predicate,
        } as ast.Quantifier;
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
