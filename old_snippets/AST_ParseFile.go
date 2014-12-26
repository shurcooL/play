// +build ignore

package main

import (
	. "github.com/shurcooL/go/gists/gist5286084"
	. "github.com/shurcooL/go/gists/gist5639599"
	"github.com/shurcooL/go-goon"
	"go/ast"
	"go/parser"
	"go/token"

	"github.com/davecgh/go-spew/spew"

	. "github.com/shurcooL/go/gists/gist5707298"
)

var _ = goon.Dump
var _ = ast.Print

func main() {
	switch 5 {
	case 0:
		fs := token.NewFileSet()
		f, err := parser.ParseFile(fs, "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/Simple.go", nil, parser.ParseComments)
		CheckError(err)

		PrintlnAst(fs, f)

		println("--------------------------------------------------------------------------------")

		f.Comments = nil
		PrintlnAst(fs, f)

		println("--------------------------------------------------------------------------------")

		goon.Dump(f, err)
	case 1:
		spew.Config.Indent = "\t"
		spew.Config.DisableMethods = true
		spew.Config.DisablePointerMethods = true
		//spew.Config.ContinueOnMethod = true

		fs := token.NewFileSet()
		f, err := parser.ParseFile(fs, "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/Simple.go", nil, 1*parser.ParseComments)
		CheckError(err)

		spew.Dump(f, err)
	case 2:
		fs := token.NewFileSet()
		f, err := parser.ParseFile(fs, "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/Simple.go", nil, 1*parser.ParseComments)
		CheckError(err)

		x := f.Decls[1].(*ast.FuncDecl).Body.List[0].(*ast.AssignStmt).Rhs[0]
		PrintlnAst(fs, x)
		println("--------------------------------------------------------------------------------")
		goon.Dump(x)
	case 3:
		in := `const (
	Ready Status = iota
	In_Progress
	Failed
	Retry
	Done
)`
		x, err := ParseStmt(in)
		CheckError(err)

		PrintlnAstBare(x)
		println("--------------------------------------------------------------------------------")
		goon.Dump(x)
	case 4:
		in := `func (ts Status) String() string {
	switch ts {
	case Ready:
		return "ready"
	case In_Progress:
		return "in_progress"
	case Failed:
		return "failed"
	case Retry:
		return "retry"
	case Done:
		return "done"
	default:
		panic("unknown status")
	}
}`
		x, err := ParseDecl(in)
		CheckError(err)

		PrintlnAstBare(x)
		println("--------------------------------------------------------------------------------")
		goon.Dump(x)
	case 5:
		fs := token.NewFileSet()
		f, err := parser.ParseFile(fs, "", `package main

func main() {
	f := func() { println("Hello from anon func!") }
	f()
}`, parser.ParseComments)
		CheckError(err)

		PrintlnAst(fs, f)

		println("--------------------------------------------------------------------------------")

		f.Comments = nil
		PrintlnAst(fs, f)

		println("--------------------------------------------------------------------------------")

		goon.Dump(f, err)

	}
}
