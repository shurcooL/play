package main

import (
	. "gist.github.com/5423254.git"

	"fmt"
	"github.com/davecgh/go-spew/spew"
	"github.com/shurcooL/go-goon"
)

var _= fmt.Printf
var _ = spew.Dump
var _ = goon.Dump

func main() {
	ins := []string{"Hello.", "", "1", "12", "123"}

	for _, in := range ins {
		spew.Dump(Reverse(in))
		println()
	}
}