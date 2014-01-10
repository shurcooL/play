package main

import (
	"fmt"
	"go/token"
	"go/parser"
	"go/ast"
//	"strings"
	"time"
	"github.com/davecgh/go-spew/spew"
	. "gist.github.com/5259939.git"
	. "gist.github.com/5639599.git"
)

var _ = time.Sleep

func foo(x int) int { return x * 2 }

func main() {
	spew.Config.Indent = "\t"
	spew.Config.DisableMethods = true
	spew.Config.DisablePointerMethods = true
	//spew.Config.ContinueOnMethod = true

	fset := token.NewFileSet()
	if file, err := parser.ParseFile(fset, GetThisGoSourceFilepath(), nil, 0); nil == err {
		for _, d := range file.Decls {
			if f, ok := d.(*ast.FuncDecl); ok {
				PrintlnAst(fset, f)
				fmt.Println("\n---\n")
				spew.Dump(f)
				break
			}
		}
	}
}