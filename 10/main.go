// Displays Go package source code with dot imports inlined.
package main

import (
	"flag"
	"os"

	"github.com/shurcooL/go/exp/11"
)

//importPath := "gist.github.com/7176504.git"
//importPath := "github.com/shurcooL/goe"
var importPathFlag = flag.String("import-path", "github.com/shurcooL/play/11", "Import Path of Go package to display with dot imports inlined.")

func main() {
	flag.Parse()

	importPath := *importPathFlag

	exp11.InlineDotImports(os.Stdout, importPath)
}
