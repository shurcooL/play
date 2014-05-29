package main

import (
	"fmt"

	"github.com/shurcooL/go-goon"
	"github.com/sourcegraph/syntaxhighlight"
)

func main() {
	src := []byte(`/* hello, world! */
var a = 3;

// b is a cool function
function b() {
  return 7;
}`)

	highlighted, err := syntaxhighlight.AsHTML(src)
	if err != nil {
		panic(err)
	}

	fmt.Println(string(highlighted))

	fmt.Println("---")

	goon.Dump(syntaxhighlight.Annotate(src, syntaxhighlight.HTMLAnnotator(syntaxhighlight.DefaultHTMLConfig)))
}
