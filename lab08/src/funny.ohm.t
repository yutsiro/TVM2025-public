
Funny <: Arithmetic {
    Module = Function+

    Function =
        variable "(" ParameterList? ")"
        "returns" Parameter
        Uses?
        Statement

    ParameterList = Parameter ("," Parameter)*
    Parameter = variable ":" "int"
    Uses = "uses" ParameterList
    Statement = Assignment | Block
    Assignment = variable "=" Expr ";"
    Block = "{" Statement* "}"

    space += lineComment | blockComment
    lineComment  = "//" (~"\n" any)* ("\n" | end)
    blockComment = "/*" (~"*/" any)* "*/"
}
