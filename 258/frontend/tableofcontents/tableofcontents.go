// +build js

// Package tableofcontents provides a table of contents component.
package tableofcontents

import (
	"syscall/js"

	"github.com/shurcooL/play/258/frontend/sanitizedanchorname"
	"honnef.co/go/js/dom/v2"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var (
	headers []dom.Element
	results *dom.HTMLDivElement
)

// Setup sets up the table of contents component on the current page.
// It must be called exactly once after document body has finished loading.
func Setup() {
	headers = document.Body().GetElementsByTagName("h2")
	if len(headers) == 0 {
		return
	}

	overlay := document.CreateElement("div")
	overlay.SetID("toc-overlay")

	results = document.CreateElement("div").(*dom.HTMLDivElement)
	results.SetID("toc-results")

	for _, header := range headers {
		element := document.CreateElement("div").(*dom.HTMLDivElement)
		element.Class().Add("toc-entry")
		element.SetTextContent(header.TextContent())

		href := "#" + sanitizedanchorname.Create(header.TextContent())
		target := header.(dom.HTMLElement)
		element.AddEventListener("click", false, func(event dom.Event) {
			//dom.GetWindow().History().ReplaceState(nil, nil, href)
			js.Global().Get("window").Get("history").Call("replaceState", nil, nil, href)

			windowHalfHeight := dom.GetWindow().InnerHeight() * 2 / 5
			dom.GetWindow().ScrollTo(dom.GetWindow().ScrollX(), int(target.OffsetTop()+target.OffsetHeight())-windowHalfHeight)
		})

		results.AppendChild(element)
	}

	overlay.AppendChild(results)
	document.Body().AppendChild(overlay)

	dom.GetWindow().AddEventListener("scroll", false, func(event dom.Event) {
		updateTOC()
	})

	updateTOC()
}

func updateTOC() {
	// Clear all past highlighted.
	for _, node := range results.ChildNodes() {
		node.(dom.Element).Class().Remove("toc-highlighted")
	}

	// Highlight one entry.
	windowHalfHeight := dom.GetWindow().InnerHeight() * 2 / 5
	for i := len(headers) - 1; i >= 0; i-- {
		header := headers[i]
		if int(header.GetBoundingClientRect().Top()) <= windowHalfHeight || i == 0 {
			results.ChildNodes()[i].(dom.Element).Class().Add("toc-highlighted")
			break
		}
	}
}
