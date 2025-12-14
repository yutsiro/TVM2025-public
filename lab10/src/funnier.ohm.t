Funnier <: Funny {
    Module := Formula* Function+

    Formula =
        variable "(" ParameterList ")" "=>" Predicate

    Function :=
        variable "(" ParameterList ")"
        PreCond?
        Ret
        PostCond?
        Uses?
        Statement

    PreCond = "requires" Predicate
    PostCond = "ensures" Predicate

    While := "while" "(" Condition ")" Invariant? Statement
    Invariant = "invariant" Predicate

    Predicate = ImplyPred

    ImplyPred = OrPred "->" ImplyPred -- imply
              | OrPred

    OrPred = AndPred ("or" AndPred)*
    AndPred = NotPred ("and" NotPred)*
    NotPred = ("not")* AtomPred

    AtomPred
        = Quantifier                   -- quantifier
        | FormulaRef                   -- formulaRef
        | "true"                       -- true
        | "false"                      -- false
        | Comparison                   -- comparison
        | "(" Predicate ")"            -- paren

    Quantifier
        = ("forall" | "exists")
        "(" Parameter "|" Predicate ")"

    FormulaRef = variable "(" ParameterList ")"
}
