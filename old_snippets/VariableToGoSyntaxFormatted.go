// +build ignore

package main

import (
	"bytes"
	"fmt"
	"go/parser"
	"go/printer"
	"go/token"
	"strings"
	"github.com/davecgh/go-spew/spew"
)

var _ = spew.Dump

func VariableToGoSyntax(variable interface{}) string {
	str := fmt.Sprintf("%#v", variable)
	// TODO: Replace hardcoded "main." with this package's name
	if strings.HasPrefix(str, "main.") {
		return str[len("main."):]
	}
	return str
}

func VariableToGoSyntaxFormatted(variable interface{}) string {
	str := VariableToGoSyntax(variable)
	if expr, err := parser.ParseExpr(str); nil == err {
		var buf bytes.Buffer
		printer.Fprint(&buf, token.NewFileSet(), expr)
		return buf.String()
	}
	return ""
}

func VariablesToGoSyntax(variables ...interface{}) string {
	var str string
	for index, variable := range variables {
		str = str + //VariableToGoSyntax(variable)
					VariableToGoSyntaxFormatted(variable)
		if len(variables)-1 != index {
			str = str + ", "
		}
	}
	return str
}

type Inner struct {
	Field1 string
	Field2 int
}

type Lang struct {
	Name  string
	Year  int
	URL   string
	Inner *Inner
}

func main() {
	spew.Config.Indent = "\t"

	x := Lang{
		Name: "Go",
		Year: 2009,
		URL:  "http",
		Inner: &Inner{
			Field1: "Secret!",
		},
	}

	println(VariableToGoSyntax(x))
	println(VariableToGoSyntaxFormatted(x))
	println(VariablesToGoSyntax(x, 5))
	spew.Dump(x, 5)
}