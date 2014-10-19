package main

import (
	"code.google.com/p/go.tools/godoc/vfs/mapfs"

	"github.com/shurcooL/go-goon"
)

var _ = goon.Dump

func main() {
	fs := mapfs.New(map[string]string{"myfile": "mydata"})

	goon.DumpExpr(fs.ReadDir("/"))
}
