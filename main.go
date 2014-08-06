package main

import (
	. "github.com/shurcooL/go/gists/gist5423254"

	"fmt"

	"github.com/shurcooL/go-goon"
)

var _ = fmt.Printf
var _ = goon.Dump

func main() {
	ins := []string{
		"Hello.",
		"",
		"1",
		"12",
		"123",
	}

	for _, in := range ins {
		goon.Dump(Reverse(in))
	}
}
