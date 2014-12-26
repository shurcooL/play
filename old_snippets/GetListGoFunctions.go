// +build ignore

package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
	. "github.com/shurcooL/go/gists/gist5639599"
	. "github.com/shurcooL/go/gists/gist5953185"
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
