package main

import (
	"text/template/parse"

	"github.com/shurcooL/go-goon"
)

func main() {
	text := "http://somehost.com/wot?cb={{.TRACEBUSTER}}&page={{.PAGE_URL}}"
	funcs := make(map[string]interface{})

	treeSet, err := parse.Parse("name", text, "{{", "}}", funcs)

	goon.Dump(err, treeSet)
}
