// Play with a human/machine friendly API for generating Markdown.
package main

import (
	"bytes"
	"fmt"

	"github.com/russross/blackfriday"
	"github.com/shurcooL/markdownfmt/markdown"
)

type m2 struct {
	m blackfriday.Renderer
	b *bytes.Buffer
}

func (this *m2) Paragraph(text string) {
	this.m.Paragraph(this.b, func() bool { this.m.NormalText(this.b, []byte(text)); return true })
}

func main() {
	var b bytes.Buffer

	m := markdown.NewRenderer()
	m2 := m2{m, &b}

	m.Header(&b, func() bool { m.NormalText(&b, []byte("New Big Idea")); return true }, 1, "")
	m.Paragraph(&b, func() bool { m.NormalText(&b, []byte("Some text in a paragraph...")); return true })
	m2.Paragraph("This clearly needs to be better. :D")

	fmt.Printf("%s", b.String())
}
