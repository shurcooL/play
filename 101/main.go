package main

import (
	"go/parser"
	"go/token"
	"os"

	"github.com/shurcooL/play/101/printer"

	"github.com/shurcooL/go-goon"
)

var in = []byte(`package main

type Foo struct {
	/*a string

	b string*/
}
`)

var config = printer.Config{
	Mode:     printer.UseSpaces | printer.TabIndent,
	Tabwidth: 8,
}

func main() {
	fset := token.NewFileSet()

	file, err := parser.ParseFile(fset, "", in, parser.ParseComments)
	if err != nil {
		panic(err)
	}

	err = config.Fprint(os.Stdout, fset, file)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(file)
}
