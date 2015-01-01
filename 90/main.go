package main

import (
	"io/ioutil"

	"github.com/go3d/go-collada/imp-1.5"
	"github.com/shurcooL/go-goon"
)

func main() {
	const path = "/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/unit_box.dae"

	b, err := ioutil.ReadFile(path)
	if err != nil {
		panic(err)
	}

	doc, err := collimp.ImportCollada(b, collimp.NewImportBag())
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(doc)
}
