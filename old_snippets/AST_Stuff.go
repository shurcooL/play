// +build ignore

package main

import (
	"go/token"
	"go/parser"
	"go/ast"
	//	"strings"
	"reflect"
	"github.com/davecgh/go-spew/spew"
	. "github.com/shurcooL/go/gists/gist5639599"
)

func foo(x int) int { return x * 2 }

func main() {
	spew.Config.Indent = "\t"
	spew.Config.DisableMethods = true
	spew.Config.DisablePointerMethods = true

	file := "/Users/Dmitri/Dmitri/^Work/^GitHub/Conception/GoLand/src/Simple.go"
	reflect.TypeOf(0)

	fset := token.NewFileSet() // Comment
	if file, err := parser.ParseFile(fset, file, nil, 1*parser.ParseComments); nil == err {
		//PrintCode(fset, file)

		/*for _, u := range file.Unresolved {
			fmt.Println(u)
		}
		fmt.Println()*/
		//fmt.Println(file)
		for _, d := range file.Decls {
			if f, ok := d.(*ast.FuncDecl); ok {
				//PrintCode(fset, f)
				for _, l := range f.Body.List {
					//x := l
					x := l //.(*ast.AssignStmt)
					PrintlnAst(fset, x)
					spew.Dump(x)
					println()
					/*if expr, ok := l.(*ast.ExprStmt); ok {
						//PrintCode(fset, expr)
						if call, ok := expr.X.(*ast.CallExpr); ok {
							PrintCode(fset, call.Fun)
							//fmt.Println(reflect.TypeOf(call.Fun))
							if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
								//PrintCode(fset, sel.X)
								fmt.Print(reflect.TypeOf(sel.X), " - ")
								fmt.Println(sel.X)
							}
						}
					}*/
				}
				break
			}
		}
	}
}
