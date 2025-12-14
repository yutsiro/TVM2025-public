import * as arith from "../../lab04";

export interface Module
{
    type: 'module';
    functions: FunctionDef[]
}
export interface FunctionDef
{
    type: 'fun';
    name: string;
    parameters: ParameterDef[];
    returns: ParameterDef[];
    locals: ParameterDef[];
    body: Statement;
}

export interface ParameterDef
{
    type: "param";
    name: string;
    paramType: 'int';
}

export type Statement = Assignment | Block;

export interface Assignment {
    type: 'assignment';
    varName: string;
    expression: arith.Expr;
}

export interface Block {
    type: 'block';
    statements: Statement[];
}
