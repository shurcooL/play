// Try parsing git version with fmt.Sscanf.
package main

import (
	"fmt"

	"github.com/shurcooL/go-goon"
)

func main() {
	in := "git version 2.8.4 (stuff)"

	var v0, v1 int
	_, err := fmt.Sscanf(in, "git version %d.%d.", &v0, &v1)
	goon.DumpExpr(err)
	goon.DumpExpr(v0, v1)
}
