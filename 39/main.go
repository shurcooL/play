package main

import (
	"fmt"
	"os"

	"github.com/sourcegraph/annotate"
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

	anns, err := syntaxhighlight.Annotate(src, syntaxhighlight.HTMLAnnotator(syntaxhighlight.DefaultHTMLConfig))
	if err != nil {
		panic(err)
	}
	//goon.Dump(anns)

	b, err := annotate.Annotate(src, anns, nil)
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(b)
}
