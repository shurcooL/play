// +build js

package main

import (
	"strings"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document()

var headers []dom.Element

func main() {
	element := document.CreateElement("div")
	element.(dom.HTMLElement).Style().SetProperty("position", "fixed", "")
	element.(dom.HTMLElement).Style().SetProperty("top", "0", "")
	element.(dom.HTMLElement).Style().SetProperty("left", "0", "")
	element.(dom.HTMLElement).Style().SetProperty("right", "0", "")
	element.(dom.HTMLElement).Style().SetProperty("margin-left", "auto", "")
	element.(dom.HTMLElement).Style().SetProperty("margin-right", "auto", "")
	element.(dom.HTMLElement).Style().SetProperty("width", "600px", "")
	element.(dom.HTMLElement).Style().SetProperty("height", "400px", "")
	element.(dom.HTMLElement).Style().SetProperty("display", "none", "")
	element.(dom.HTMLElement).Style().SetProperty("z-index", "1000", "")

	element2 := document.CreateElement("div")
	element.AppendChild(element2)
	element2.Underlying().Set("outerHTML", `<div style="text-align: center;"><input id="command"></input><div id="results"></div></div>`)

	document.(dom.HTMLDocument).Body().AppendChild(element)

	document.GetElementByID("command").AddEventListener("input", false, func(event dom.Event) {
		updateResults()
	})

	element.AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+001B": // Escape.
			element.(dom.HTMLElement).Style().SetProperty("display", "none", "")
			ke.PreventDefault()
		}
	})

	document.(dom.HTMLDocument).Body().AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+0052" && ke.MetaKey: // Cmd+R.

			{
				headers = document.(dom.HTMLDocument).Body().GetElementsByTagName("h3")

				updateResults()
			}

			element.(dom.HTMLElement).Style().SetProperty("display", "", "")
			document.GetElementByID("command").(*dom.HTMLInputElement).Select()
			ke.PreventDefault()
		}
	})
}

func updateResults() {
	filter := document.GetElementByID("command").(*dom.HTMLInputElement).Value

	results := document.GetElementByID("results").(*dom.HTMLDivElement)

	results.SetInnerHTML("")
	for _, header := range headers {
		if filter != "" && !strings.Contains(strings.ToLower(header.TextContent()), strings.ToLower(filter)) {
			continue
		}

		element := document.CreateElement("div")
		element.Class().Add("entry")
		element.SetTextContent(header.TextContent())

		results.AppendChild(element)

	}
}
