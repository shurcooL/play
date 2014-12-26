// +build ignore

package main

import (
	"fmt"
	"go/token"
	"go/parser"
	"go/ast"
	//	"strings"
	"time"
	"github.com/davecgh/go-spew/spew"
	. "github.com/shurcooL/go/gists/gist5259939"
	. "github.com/shurcooL/go/gists/gist5639599"
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
