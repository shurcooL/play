package main

import (
	. "github.com/shurcooL/go/gists/gist5423254"

	"github.com/shurcooL/go-goon"
)

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
