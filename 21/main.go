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
	var input []byte
	switch 7 {
	case 0:
		input = []byte(`1.	Item 1
2.	Item 2
	1.	Blah.
	2.	Blah.
3.	Item 3
	-	Item 3a
	-	Item 3b
`)
	case 1:
		input = []byte(`1.	Item 1

2.	Item 2

	1.	Blah.

	2.	Blah.

3.	Item 3

	-	Item 3a

	-	Item 3b
`)
	case 2:
		input = []byte(`1.	Item 1.
	1.	Inner 1.

		Hello.
`)
	case 3:
		input = []byte(`1986\. What a great season. Was it *not*.`)
	case 4:
		input = []byte(`1986\. What a great season\. Was it *not*\.`)
	case 5:
		input = []byte(`Overall, it's possible to escape \\, \` + "`" + `, *, _, {, }, [, ], (, ), #, +, -, ., !, and \<, \>.`)
	case 6:
		input = []byte(`Overall, it's possible to escape \\, \` + "`" + `, \*, \_, \{, \}, \[, \], \(, \), \#, \+, \-, \., \!, and \<, \>.`)
	case 7:
		input = []byte(`![local image](rattlesnake image.jpg)`)
	}

	htmlFlags := 0
	htmlFlags |= blackfriday.HTML_USE_XHTML
	htmlFlags |= blackfriday.HTML_USE_SMARTYPANTS
	//htmlFlags |= blackfriday.HTML_SMARTYPANTS_FRACTIONS
	//htmlFlags |= blackfriday.HTML_SMARTYPANTS_LATEX_DASHES
	//htmlFlags |= blackfriday.HTML_SANITIZE_OUTPUT

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
