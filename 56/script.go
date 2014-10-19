// +build js

package main

import (
	"strings"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document()

var headers []dom.Element

var selected int

var baseHash string
var baseX, baseY int

func main() {
	overlay := document.CreateElement("div")
	overlay.SetID("overlay")

	element2 := document.CreateElement("div")
	overlay.AppendChild(element2)
	element2.Underlying().Set("outerHTML", `<div><input id="command"></input><div id="results"></div></div>`)

	document.(dom.HTMLDocument).Body().AppendChild(overlay)

	document.GetElementByID("command").AddEventListener("input", false, func(event dom.Event) {
		updateResults()
	})

	overlay.AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+001B": // Escape.
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")

			dom.GetWindow().Location().Hash = baseHash
			dom.GetWindow().ScrollTo(baseX, baseY)
		case ke.KeyIdentifier == "Enter":
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")
		case ke.KeyIdentifier == "Down":
			selected++
			updateResults()
		case ke.KeyIdentifier == "Up":
			if selected > 0 {
				selected--
			}
			updateResults()
		}
	})

	document.(dom.HTMLDocument).Body().AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+0052" && ke.MetaKey: // Cmd+R.
			ke.PreventDefault()

			{
				headers = document.(dom.HTMLDocument).Body().GetElementsByTagName("h3")

				selected = 0

				baseHash = dom.GetWindow().Location().Hash
				baseX, baseY = dom.GetWindow().ScrollX(), dom.GetWindow().ScrollY()

				updateResults()
			}

			overlay.(dom.HTMLElement).Style().SetProperty("display", "initial", "")
			document.GetElementByID("command").(*dom.HTMLInputElement).Select()
		case ke.KeyIdentifier == "U+001B": // Escape.
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")
		}
	})
}

func updateResults() {
	filter := document.GetElementByID("command").(*dom.HTMLInputElement).Value

	results := document.GetElementByID("results").(*dom.HTMLDivElement)

	results.SetInnerHTML("")
	var visibleIndex int
	for _, header := range headers {
		if filter != "" && !strings.Contains(strings.ToLower(header.TextContent()), strings.ToLower(filter)) {
			continue
		}

		element := document.CreateElement("div")
		element.Class().Add("entry")
		if visibleIndex == selected {
			element.Class().Add("highlighted")
			dom.GetWindow().Location().Hash = "#" + header.ID()
		}
		element.SetTextContent(header.TextContent())

		results.AppendChild(element)

		visibleIndex++
	}
}
