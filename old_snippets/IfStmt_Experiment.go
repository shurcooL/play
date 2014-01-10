package main

import (
	. "gist.github.com/5639599.git"
	. "gist.github.com/5707298.git"
	"go/ast"
	"go/token"
	"github.com/shurcooL/go-goon"
)

var _ = PrintlnAstBare
var _ = ParseStmt
var _ = goon.Dump
var _ token.Pos

func main() {
	switch 0 {
	case 0:
		x := &ast.IfStmt{}
		x.Cond = &ast.BinaryExpr{
			X: &ast.Ident{Name: "xyz"},
			Op: (token.Token)(39),
			Y: &ast.BasicLit{
				Kind:     (token.Token)(5),
				Value:    (string)("10"),
			}}
		x.Body = &ast.BlockStmt{}
		PrintlnAstBare(x)
		//goon.Dump(x)
	case 1:
		goon.Dump(ParseStmt("if x != 0 {}"))
	}
}