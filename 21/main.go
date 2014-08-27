// Test Markdown parser with the debug renderer.
package main

import (
	"fmt"
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

	/*input, err := ioutil.ReadAll(os.Stdin)
	if err != nil {
		panic(err)
	}*/
	input := []byte(`Some text with two trailing spaces for linebreak.  ` + `
More      spaced      **text**      *immediately*      after      that.          ` + `
Done.
`)
	_ = []byte(`- list1

> This a normal quote

- list2

	> This a quote within a list
`)

	htmlFlags := 0
	htmlFlags |= blackfriday.HTML_USE_XHTML
	htmlFlags |= blackfriday.HTML_USE_SMARTYPANTS
	//htmlFlags |= blackfriday.HTML_SMARTYPANTS_FRACTIONS
	//htmlFlags |= blackfriday.HTML_SMARTYPANTS_LATEX_DASHES
	//htmlFlags |= blackfriday.HTML_SANITIZE_OUTPUT
	htmlFlags |= blackfriday.HTML_GITHUB_BLOCKCODE

	// GitHub Flavored Markdown-like extensions.
	extensions := 0
	extensions |= blackfriday.EXTENSION_NO_INTRA_EMPHASIS
	extensions |= blackfriday.EXTENSION_TABLES
	extensions |= blackfriday.EXTENSION_FENCED_CODE
	extensions |= blackfriday.EXTENSION_AUTOLINK
	extensions |= blackfriday.EXTENSION_STRIKETHROUGH
	extensions |= blackfriday.EXTENSION_SPACE_HEADERS
	//extensions |= blackfriday.EXTENSION_HARD_LINE_BREAK

	fmt.Println("--- Custom ---")

	output := blackfriday.Markdown(input, blackfriday.HtmlRenderer(htmlFlags, "", ""), extensions)
	os.Stdout.Write(output)

	fmt.Println("--- MarkdownBasic() ---")

	output = blackfriday.MarkdownBasic(input)
	os.Stdout.Write(output)

	fmt.Println("--- MarkdownCommon() ---")

	output = blackfriday.MarkdownCommon(input)
	os.Stdout.Write(output)
	//fmt.Printf("%q\n", string(output))

	fmt.Println("-----")

	output = blackfriday.Markdown(input, markdown.NewRenderer(), extensions)
	os.Stdout.Write(output)

	fmt.Println("-----")

	_ = blackfriday.Markdown(input, debug.NewRenderer(blackfriday.HtmlRenderer(htmlFlags, "", "")), extensions)

	fmt.Println("-----")

	_ = blackfriday.Markdown(input, debug.NewRenderer(markdown.NewRenderer()), extensions)
}
