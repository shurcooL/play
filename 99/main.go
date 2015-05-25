// An example of creating a custom blackfriday.Renderer that reuses blackfriday.Html while overriding Link rendering.
package main

import (
	"bytes"
	"fmt"
	"os"

	"github.com/russross/blackfriday"
)

func main() {
	text := []byte(`Title
=====

This is a [link](http://www.example.org/) being rendered in a custom way.
`)

	htmlFlags := 0
	renderer := &renderer{Html: blackfriday.HtmlRenderer(htmlFlags, "", "").(*blackfriday.Html)}

	extensions := 0
	// ...

	unsanitized := blackfriday.Markdown(text, renderer, extensions)
	os.Stdout.Write(unsanitized)
}

// renderer implements blackfriday.Renderer and reuses blackfriday.Html for the most part, except overriding Link rendering.
type renderer struct {
	*blackfriday.Html
}

func (r *renderer) Link(out *bytes.Buffer, link []byte, title []byte, content []byte) {
	fmt.Fprintf(out, "<custom link %q to %q>", content, link)
}
