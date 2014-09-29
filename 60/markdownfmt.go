// +build js

package main

import (
	"github.com/shurcooL/go/u/u9"
	"github.com/shurcooL/markdownfmt/markdown"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document()

var input = document.GetElementByID("input").(*dom.HTMLTextAreaElement)
var output = document.GetElementByID("output").(dom.HTMLElement)

var initial = `Title
==

Hello    there.

1. Item one.
1. Item TWO.

	| Branch  | Behind | Ahead |
	|---------|-------:|:------|
	| improve-nested-list-support | 1 | 1 |
	| **master** | 0 | 0 |

3.	Item 1

	Another paragraph inside this list item is  ` + `
	indented just like the previous paragraph.
4.	Item 2
	-	Item 2a

		Things go here.

		> This a quote within a list.

		And they stay here.
	-	Item 2b
		-	Item 333!

			Yep.
			-	Item 4444!

				Why not?
-	Item 3
`

func run(event dom.Event) {
	output.SetTextContent(ProcessMarkdown(input.Value))
}

func ProcessMarkdown(text string) string {
	output, err := markdown.Process("", []byte(text), nil)
	if err != nil {
		println("ProcessMarkdown:", err.Error())
		return text
	}
	return string(output)
}

func main() {
	input.AddEventListener("input", false, run)
	input.Value = initial
	input.SelectionStart, input.SelectionEnd = len(initial), len(initial)
	run(nil)

	u9.AddTabSupport(input)
}
