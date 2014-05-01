// Test Markdown parser with the debug renderer.
package main

import (
	"fmt"
	"io/ioutil"
	"os"
	"time"

	"github.com/russross/blackfriday"
	"github.com/shurcooL/markdownfmt/markdown"
	"github.com/shurcooL/markdownfmt/markdown/debug"
)

func main() {
	go func() {
		time.Sleep(time.Second)
		os.Exit(1)
	}()

	input, err := ioutil.ReadAll(os.Stdin)
	if err != nil {
		panic(err)
	}

	// GitHub Flavored Markdown-like extensions.
	extensions := 0
	extensions |= blackfriday.EXTENSION_NO_INTRA_EMPHASIS
	//extensions |= blackfriday.EXTENSION_TABLES // TODO: Implement.
	extensions |= blackfriday.EXTENSION_FENCED_CODE
	extensions |= blackfriday.EXTENSION_AUTOLINK
	extensions |= blackfriday.EXTENSION_STRIKETHROUGH
	extensions |= blackfriday.EXTENSION_SPACE_HEADERS
	//extensions |= blackfriday.EXTENSION_HARD_LINE_BREAK

	//output := blackfriday.MarkdownBasic(input)
	output := blackfriday.Markdown(input, blackfriday.HtmlRenderer(0, "", ""), extensions)

	os.Stdout.Write(output)

	fmt.Println("-----")

	output = blackfriday.Markdown(input, markdown.NewRenderer(), extensions)

	os.Stdout.Write(output)

	fmt.Println("-----")

	output = blackfriday.Markdown(input, debug.NewRenderer(), extensions)

	os.Stdout.Write(output)
}
