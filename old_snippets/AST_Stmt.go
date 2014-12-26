// +build ignore

package main

import (
	"bytes"
	"fmt"
	"go/printer"
	"go/ast"
	"strings"
	"encoding/json"
	"github.com/davecgh/go-spew/spew"
	. "github.com/shurcooL/go/gists/gist5707298"
)

var _ = fmt.Printf
var _ = strings.HasPrefix
var _ bytes.Buffer
var _ = printer.Fprint
var _ = spew.Dump

func main() {
	spew.Config.Indent = "\t"
	spew.Config.DisableMethods = true
	spew.Config.DisablePointerMethods = true

	var str string
	//str = `str := "My String"`
	str = `x := Lang{Name: "Go", Year: 2009, URL: "http"}`
	if stmt, err := ParseStmt(str); nil == err {
		/*var buf bytes.Buffer
		printer.Fprint(&buf, token.NewFileSet(), stmt)
		println(buf.String())*/
		switch s := stmt.(type) {
		case *ast.AssignStmt:
			fmt.Printf("%v %v %+v\n", s.Lhs, s.Tok, s.Rhs[0])
			//fmt.Printf("%v %v %v\n", s.Lhs[0].(*ast.Ident).Name, s.Tok, s.Rhs[0].(*ast.BasicLit).Value)
			fmt.Printf("%v %v %v\n", s.Lhs[0].(*ast.Ident).Name, s.Tok, s.Rhs[0].(*ast.CompositeLit).Elts[0])
			//println(VariableToGoSyntaxFormatted(s.Rhs[0]))
			println()
			spew.Dump(s.Lhs[0])
			s.Lhs[0].(*ast.Ident).Obj = nil
			spew.Dump(s.Lhs[0])
			if true {
				b, err := json.MarshalIndent(s.Lhs[0], "", "\t")
				if nil != err {
					fmt.Println("error:", err)
				}
				println(string(b))
			}
		default:
			fmt.Printf("unexecpted type %T\n", stmt)
		}
	} else {
		fmt.Print(err)
	}
}
