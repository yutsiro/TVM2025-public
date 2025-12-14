import { getExprAst } from '../../lab04';
import * as ast from './funny';
import grammar, { FunnyActionDict } from './funny.ohm-bundle';
import { MatchResult, Semantics } from 'ohm-js';

export const getFunnyAst = {
    ...getExprAst,

    Module(m) {
        const func = m.children[0].parse();
        return {
            type: 'module',
            functions: [func]
        };
    },
    Parameter(name, colon, type: any) {
        return {
            type: 'param',
            name: name.sourceString,
            paramType: type.sourceString
        } as ast.ParameterDef;
    },
    // ParameterList(first, comma, rest) {
    //     if (first.sourceString === '') {
    //         return [];
    //     }
    //     let params = [first.parse()];
    //     for (const r of rest.children) {
    //         params.push(r.children[1].parse());
    //     }
    //     return params;
    // },
    ParameterList(params) {
        if(!params || params.sourceString === '') {
            return [];
        }
        const iteration = params.asIteration();
        const result = [];

        for (const child of iteration.children) {
            result.push(child.parse());
        }

        return result;
    },

    Uses(_uses, paramList) {
        console.log('Uses parsing, paramList:', paramList.sourceString);
        if(!paramList || paramList.sourceString === '') {
            return [];
        }
        const iteration = paramList.asIteration();
        const result = [];

        for (const child of iteration.children) {
            result.push(child.parse());
        }

        console.log('Uses result:', result);
        return result;
    },
    Function(name, _lp, params, _rp, _ret, returns_list, uses, body) {
        const paramList = params.sourceString === '' ? [] : params.parse();
        const returnDef = returns_list.parse();

        console.log('uses node:', uses);
        console.log('uses.sourceString:', uses.sourceString);
        // const parsedUses = uses.parse();
        // console.log('parsedUses:', parsedUses);
        // console.log('parsedUses type:', typeof parsedUses);
        // console.log('Array.isArray(parsedUses):', Array.isArray(parsedUses));

        // const localList = uses.sourceString === '' ? [] : parsedUses;
        // console.log('localList:', localList);

        let localList: ast.ParameterDef[] = [];

        if (uses.sourceString !== '') {
            // uses.parse() возвращает [result], где result - массив параметров
            const parsed = uses.parse();
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Берем первый (и единственный) элемент - это массив параметров
                localList = parsed[0] as ast.ParameterDef[];
            }
        }

        const bodyStmt = body.parse();
        return {
            type: 'fun',
            name: name.sourceString,
            parameters: paramList,
            returns: [returnDef],
            locals: localList,
            body: bodyStmt
        } as ast.FunctionDef;
    },
    // // Type(t) {
    // //     return t.sourceString;
    // // },
    Assignment(varName, _eq, expr, _semi) {
        return {
            type: 'assignment',
            varName: varName.sourceString,
            expression: expr.parse()
        } as ast.Assignment;
    },
    Block(_open, statements, _close) {
        const stmts = statements.children.map((child: any) => child.parse());
        return {
          type: 'block',
          statements: stmts
        } as ast.Block;
    },
    Statement(stmt) {
        return stmt.parse();
    },
    _iter(...children) {
        return children.map((c: any) => c.parse());
    },
    _terminal() {
        return this.sourceString;
    }
} satisfies FunnyActionDict<any>;

export const semantics: FunnySemanticsExt = grammar.Funny.createSemantics() as FunnySemanticsExt;
semantics.addOperation("parse()", getFunnyAst);

export interface FunnySemanticsExt extends Semantics
{
    (match: MatchResult): FunnyActionsExt
}
interface FunnyActionsExt
{
    parse(): ast.Module;
}

function checkSemantics(module: ast.Module) {
    for (const func of module.functions) {
        console.log('Checking function:', func.name);
        console.log('Parameters:', func.parameters.map(p => ({name: p.name, type: p.paramType})));
        console.log('Returns:', func.returns.map(r => ({name: r.name, type: r.paramType})));
        console.log('Locals:', func.locals.map(l => ({name: l?.name, type: l?.paramType})));

        console.log('Locals:', func.locals);
        console.log('Locals length:', func.locals.length);
        console.log('First local:', func.locals[0]);


        const declared = new Set<string>();

        // Check parameters
        for (const param of func.parameters) {
            console.log('Checking parameter:', param.name);
            if (declared.has(param.name)) {
                throw new Error(`Duplicate parameter: ${param.name}`);
            }
            declared.add(param.name);
        }

        // Check locals
        for (const local of func.locals) {
            console.log('Checking local:', local?.name, 'full object:', local);
            if (!local?.name) {
                throw new Error(`Local variable has no name: ${JSON.stringify(local)}`);
            }
            if (declared.has(local.name)) {
                throw new Error(`Duplicate local variable: ${local.name}`);
            }
            declared.add(local.name);
        }

        // Check return variable
        for (const ret of func.returns) {
            console.log('Checking return:', ret.name);
            if (declared.has(ret.name)) {
                throw new Error(`Return variable conflicts with existing: ${ret.name}`);
            }
            declared.add(ret.name);
        }

        // Check variable usage in body
        function checkStatement(stmt: ast.Statement) {
            if (stmt.type === 'assignment') {
                // Check if variable is declared
                if (!declared.has(stmt.varName)) {
                    throw new Error(`Undeclared variable: ${stmt.varName}`);
                }
                // Check expression variables
                checkExpression(stmt.expression);
            } else if (stmt.type === 'block') {
                for (const s of stmt.statements) {
                    checkStatement(s);
                }
            }
        }

        function checkExpression(expr: any) {
            if (expr.kind === 'variable') {
                if (!declared.has(expr.name)) {
                    throw new Error(`Undeclared variable in expression: ${expr.name}`);
                }
            } else if (expr.kind === 'unary') {
                checkExpression(expr.argument);
            } else if (expr.kind === 'binary') {
                checkExpression(expr.left);
                checkExpression(expr.right);
            }
        }

        checkStatement(func.body);
    }
}

export function parseFunny(source: string): ast.Module
{
    console.log("Parsing source:", source);
    console.log("Source lines:");
    source.split('\n').forEach((line, i) => console.log(`${i+1}: ${line}`));

    const match = grammar.Funny.match(source, "Module");

    console.log("Match result:", match.succeeded() ? "SUCCESS" : "FAILED");
    console.log("Match message:", match.message);

    if (match.failed()) {
        throw new Error(`Syntax error: ${match.message}`);
    }

    const moduleAst = semantics(match).parse();
    try {
        checkSemantics(moduleAst);
    } catch (error) {
        throw error;
    }


    return moduleAst;
}
