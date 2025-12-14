import {
    ParameterDef,
    Statement,
    Predicate,
    Expr
} from '../../lab08/src/funny';

export interface ModuleWithoutFunctions {
    type: 'module';
}

export interface AnnotatedModule extends ModuleWithoutFunctions {
    formulas: FormulaDef[];
    functions: AnnotatedFunctionDef[];
}

export interface AnnotatedFunctionDef {
    type: 'fun';
    name: string;
    parameters: ParameterDef[];
    returns: ParameterDef[];
    locals: ParameterDef[];
    body: Statement;
    requires: Predicate | null;
    ensures: Predicate | null;
}

export interface FormulaDef {
    type: 'formula';
    name: string;
    parameters: ParameterDef[];
    body: Predicate;
}

export interface FormulaRefPredicate {
    kind: 'formula';
    name: string;
    args: Expr[];
}
