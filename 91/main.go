package main

import (
	"github.com/GlenKelley/go-collada"
	"github.com/shurcooL/go-goon"
)

func main() {
	//const path = "/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/unit_box.dae"
	const path = "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/Hover/vehicle0.dae"

	doc, err := collada.LoadDocument(path)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(doc)

	//goon.DumpExpr(doc.LibraryGeometries[0].Geometry)
}
