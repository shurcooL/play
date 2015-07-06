// +build js

package main

import (
	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/sanitized_anchor_name"
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
		element := document.CreateElement("div").(*dom.HTMLDivElement)
		element.Class().Add("toc-entry")
		element.SetTextContent(header.TextContent())

		href := "#" + sanitized_anchor_name.Create(header.TextContent())
		target := header.(dom.HTMLElement)
		element.AddEventListener("click", false, func(event dom.Event) {
			windowHalfHeight := dom.GetWindow().InnerHeight() * 2 / 5
			//dom.GetWindow().History().ReplaceState(nil, nil, href)
			js.Global.Get("window").Get("history").Call("replaceState", nil, nil, href)
			dom.GetWindow().ScrollTo(dom.GetWindow().ScrollX(), int(target.OffsetTop()+target.OffsetHeight())-windowHalfHeight)
		})

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
	windowHalfHeight := dom.GetWindow().InnerHeight() * 2 / 5
	for i := len(headers) - 1; i >= 0; i-- {
		header := headers[i]
		if header.GetBoundingClientRect().Top <= windowHalfHeight || i == 0 {
			results.ChildNodes()[i].(dom.Element).Class().Add("toc-highlighted")
			break
		}
	}
}
