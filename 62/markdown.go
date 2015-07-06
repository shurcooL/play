// +build js

package main

import (
	"github.com/shurcooL/github_flavored_markdown"
	"github.com/shurcooL/go/u/u9"
	"github.com/shurcooL/markdownfmt/markdown"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document()

var input = document.GetElementByID("input").(*dom.HTMLTextAreaElement)
var outputIframe = document.GetElementByID("outputIframe").(*dom.HTMLIFrameElement)
var output = outputIframe.ContentDocument().GetElementByID("output")

var initial = `Live Markdown Renderer (and formatter)
================

You can type stuff here and stuff appears on the right. That's it.

If you press Cmd+S, it will format your markdown.

Try it now while looking at the messy table below:

Markdown | Less | Pretty
--- | --- | ---
*Still* | ` + "`renders`" + ` | **nicely**
1 | 2 | 3

` + "```Go" + `
func main  () {
	// Comment!
	/*block comment*/
	go fmt.Println("some string", 1.336)
}
` + "```" + `
`

func run(event dom.Event) {
	output.SetInnerHTML(string(github_flavored_markdown.Markdown([]byte(input.Value))))
}

func main() {
	input.AddEventListener("input", false, run)
	input.Value = initial
	input.SelectionStart, input.SelectionEnd = len(initial), len(initial)
	run(nil)

	u9.AddTabSupport(input)

	// Add markdownfmt-on-save support.
	input.AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+0053" && ke.MetaKey: // Cmd+S.
			ke.PreventDefault()

			output, err := markdown.Process("", []byte(input.Value), nil)
			if err != nil {
				println("markdown.Process:", err.Error())
				return
			}

			// Update text and try to preserve the selection somewhat.
			start, end := input.SelectionStart, input.SelectionEnd
			input.Value = string(output)
			input.SelectionStart, input.SelectionEnd = start, end

			// Render the output just in case (to see if it changed, etc.).
			run(nil)
		}
	})
}
