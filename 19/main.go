// Play with blackfriday Markdown renderers.
package main

import (
	"os"
	"time"

	"github.com/russross/blackfriday"
	"github.com/shurcooL/markdownfmt/markdown"
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

	input := []byte(`Title
=

This is a new paragraph. I wonder    if I have too     many spaces.
What about new paragraph.
But the next one...

  Is really new.

1. Item one.
1. Item TWO.

Final stance.
`)

	//output := blackfriday.MarkdownBasic(input)
	//output := blackfriday.Markdown(input, blackfriday.HtmlRenderer(0, "", ""), 0)
	output := blackfriday.Markdown(input, markdown.NewRenderer(), 0)

	os.Stdout.Write(output)
}
