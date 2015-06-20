// Reproduce for https://github.com/russross/blackfriday/issues/178.
package main

import (
	"os"

	"github.com/russross/blackfriday"
)

func main() {
	input := []byte(`some para_graph with _soft_ break inside it.`)

	extensions := blackfriday.EXTENSION_NO_INTRA_EMPHASIS

	output := blackfriday.Markdown(input, blackfriday.HtmlRenderer(0, "", ""), extensions)

	os.Stdout.Write(output)

	// Expected Output:
	// <p>some para_graph with <em>soft</em> break inside it.</p>

	// Actual Output:
	// <p>some para<em>graph with _soft</em> break inside it.</p>
}
