
Funny <: Arithmetic {
    Module = Function+

    Function =
        variable "(" ParameterList ")"
        Ret
        Uses?
        Statement

    Ret = "returns" ParameterList
    Uses = "uses" ParameterList

    ParameterList = ListOf<Parameter, ",">
    Parameter = variable ":" Type

    Type = "int"   -- int
         | "int[]" --array

    Statement = Assignment -- assign
            | Block        -- block
            | While        -- while
            | If           -- if
            | Expr ";"     -- expr

    Assignment = LValue "=" Expr ";"          -- simple
               | LValueList "=" ExprList ";"  -- tuple

    Block = "{" Statement* "}"

    While = "while" "(" Condition ")" Statement
    If = "if" "(" Condition ")" Statement ("else" Statement)?

    LValueList = ListOf<LValue, ",">
    LValue = ArrayAccess -- array
           | variable    -- var

    ExprList = ListOf<Expr, ",">

    Unary := FunctionCall
          | ArrayAccess
          | ...

    FunctionCall = variable "(" ArgList ")"
    ArgList = ListOf<Expr, ",">

    ArrayAccess = variable "[" Expr "]"

    Condition = ImplyCond

    ImplyCond = OrCond "->" ImplyCond  -- imply
              | OrCond

    OrCond = AndCond ("or" AndCond)*
    AndCond = NotCond ("and" NotCond)*
    NotCond = ("not")* AtomCond

    AtomCond
        = "true"                       -- true
        | "false"                      -- false
        | Comparison                   -- comparison
        | "(" Condition ")"            -- paren

    Comparison
        = Expr "==" Expr               -- eq
        | Expr "!=" Expr               -- neq
        | Expr ">=" Expr               -- ge
        | Expr "<=" Expr               -- le
        | Expr ">"  Expr               -- gt
        | Expr "<"  Expr               -- lt

    space += lineComment | blockComment
    lineComment  = "//" (~"\n" any)* ("\n" | end)
    blockComment = "/*" (~"*/" any)* "*/"
}
