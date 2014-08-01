// Play with deleting/hiding error handling from Go AST.
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"os"

	. "github.com/shurcooL/go/gists/gist5286084"
	. "github.com/shurcooL/go/gists/gist5639599"
)

const content = `package bar

func foo() {
	rows, err := db.Query()
	if err != nil {
		panic(err)
	}
}`

func main() {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "filename.go", content, 0)
	CheckError(err)

	ast.Inspect(f, func(n ast.Node) bool {
		if n == nil {
			return true
		}
		if _, ok := n.(*ast.IfStmt); ok {
			fmt.Println("---")
			ast.Fprint(os.Stdout, fset, n, nil)
			PrintlnAst(fset, n)
			fmt.Println("---")
		}
		// HACK: Iterate over blockStmt.List and remove first IfStmt.
		if blockStmt, ok := n.(*ast.BlockStmt); ok {
			for i, v := range blockStmt.List {
				if _, ok := v.(*ast.IfStmt); ok {
					blockStmt.List = append(blockStmt.List[:i], blockStmt.List[i+1:]...)
					break
				}
			}
		}
		return true
	})

	var config = &printer.Config{Mode: printer.UseSpaces | printer.TabIndent, Tabwidth: 8}
	fset = token.NewFileSet() // HACK: Reset fset
	config.Fprint(os.Stdout, fset, f)
}
