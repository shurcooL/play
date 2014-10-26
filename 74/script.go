// +build js

package main

import (
	"github.com/shurcooL/go/github_flavored_markdown"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var headers []dom.Element
var results *dom.HTMLDivElement

func main() {
	headers = document.Body().GetElementsByTagName("h2")
	if len(headers) == 0 {
		return
	}

	overlay := document.CreateElement("div")
	overlay.SetID("toc-overlay")

	results = document.CreateElement("div").(*dom.HTMLDivElement)

	for _, header := range headers {
		element := document.CreateElement("a").(*dom.HTMLAnchorElement)
		element.Class().Add("toc-entry")
		element.SetTextContent(header.TextContent())
		element.Href = github_flavored_markdown.HeaderLink(header.TextContent())

		results.AppendChild(element)
	}

	overlay.AppendChild(results)
	document.Body().AppendChild(overlay)

	dom.GetWindow().AddEventListener("scroll", false, func(event dom.Event) {
		updateToc()
	})

	updateToc()
}

func updateToc() {
	// Clear all past highlighted.
	for _, node := range results.ChildNodes() {
		node.(dom.Element).Class().Remove("toc-highlighted")
	}

	// Highlight one entry.
	for i := len(headers) - 1; i >= 0; i-- {
		header := headers[i]
		if header.GetBoundingClientRect().Top <= 0 || i == 0 {
			results.ChildNodes()[i].(dom.Element).Class().Add("toc-highlighted")
			break
		}
	}
}
