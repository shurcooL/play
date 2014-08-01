package main

import (
	"fmt"
	"go/parser"
	"go/token"

	"code.google.com/p/go.tools/astutil"

	. "github.com/shurcooL/go/gists/gist5639599"
)

func main() {
	in := `package main

import (
	"io"
	"os"
	"path"
	
	"ga"
	"gu"
	"gz"
)
`

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "", in, parser.ParseComments)
	if err != nil {
		panic(err)
	}

	target := "ga"
	fmt.Printf("astutil.DeleteImport(): %v\n\n", astutil.DeleteImport(fset, file, target))
	PrintlnAst(fset, file)
	fmt.Println("astutil.Imports() import group sizes:")
	for _, ig := range astutil.Imports(fset, file) {
		fmt.Println(len(ig))
	}
}
