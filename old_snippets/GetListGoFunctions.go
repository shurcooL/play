package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
	. "gist.github.com/5639599.git"
	. "gist.github.com/5953185.git"
	//"strings"
	//"github.com/davecgh/go-spew/spew"
)

var _ = ast.Walk
var _ = strings.Contains

func GetListGoFunctions(file string) {
	fset := token.NewFileSet()
	if file, err := parser.ParseFile(fset, file, nil, 1*parser.ParseComments); nil == err {
		//PrintlnAst(fset, file)

		for _, d := range file.Decls {
			if f, ok := d.(*ast.FuncDecl); ok {
				f.Body = nil
				print(Underline(f.Name.Name))
				PrintlnAst(fset, f)
				//spew.Dump(f); println()
				println()
			}
		}
	}
}

func main() {
	file := "/usr/local/go/src/pkg/go/ast/walk.go"

	GetListGoFunctions(file)
}