// Play with creating a (minimal) library for Metal API.
package main

import (
	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/play/246/mtl"
)

func main() {
	goon.DumpExpr(mtl.CreateSystemDefaultDevice())
	goon.DumpExpr(mtl.CopyAllDevices())
}
