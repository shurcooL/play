// +build ignore

package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"log"
	"os"

	"github.com/shurcooL/go-goon"
)

func main() {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/play/153/x.go", nil, 0)
	if err != nil {
		log.Fatalln(err)
	}

	expr := f.Decls[1].(*ast.FuncDecl).Body.List[len(f.Decls[1].(*ast.FuncDecl).Body.List)-2].(*ast.DeclStmt).Decl.(*ast.GenDecl).Specs[0].(*ast.ValueSpec).Values[0]

	goon.DumpExpr(fset)
	return

	err = ast.Fprint(os.Stdout, fset, expr, nil)
	if err != nil {
		log.Fatalln(err)
	}

	goon.Dump(expr)
}
