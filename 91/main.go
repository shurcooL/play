package main

import (
	"github.com/GlenKelley/go-collada"
	"github.com/shurcooL/go-goon"
)

func main() {
	const path = "/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/Box.dae"

	doc, err := collada.LoadDocument(path)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(doc)
}
