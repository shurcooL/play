// +build ignore

package main

import (
	"fmt"

	"github.com/shurcooL/markdownfmt/markdown"
)

func main() {
	input := []byte(`Title
=

This is a new paragraph. I wonder    if I have too     many spaces.
What about new paragraph.
But the next one...

  Is really new.

1. Item one.
1. Item TWO.


Final paragraph.
`)

	output, err := markdown.Process("", input, nil)
	if err != nil {
		panic(err)
	}

	fmt.Println(string(output))

	// Output:
	// Title
	// =====
	//
	// This is a new paragraph. I wonder if I have too many spaces. What about new paragraph. But the next one...
	//
	// Is really new.
	//
	// 1.	Item one.
	// 2.	Item TWO.
	//
	// Final paragraph.
	//
}
