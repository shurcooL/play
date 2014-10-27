// +build js

package main

import (
	"fmt"
	"html"
	"strings"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var headers []dom.Element

var selected int

var baseHash string
var baseX, baseY int

func main() {
	overlay := document.CreateElement("div")
	overlay.SetID("overlay")

	container := document.CreateElement("div")
	overlay.AppendChild(container)
	container.Underlying().Set("outerHTML", `<div><input id="command"></input><div id="results"></div></div>`)

	document.(dom.HTMLDocument).Body().AppendChild(overlay)

	document.GetElementByID("command").AddEventListener("input", false, func(event dom.Event) {
		updateResults()
	})

	document.GetElementByID("results").AddEventListener("click", false, func(event dom.Event) {
		document.GetElementByID("command").(dom.HTMLElement).Focus()

		me := event.(*dom.MouseEvent)
		y := (me.ClientY - document.GetElementByID("results").GetBoundingClientRect().Top) + document.GetElementByID("results").Underlying().Get("scrollTop").Int()
		height := document.GetElementByID("results").FirstChild().(dom.Element).GetBoundingClientRect().Object.Get("height").Float()
		selected = int(float64(y) / height)
		updateResultSelection()
	})

	overlay.AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+001B": // Escape.
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")

			if document.ActiveElement().Underlying() == document.GetElementByID("command").Underlying() {
				dom.GetWindow().Location().Hash = baseHash
				dom.GetWindow().ScrollTo(baseX, baseY)
			}
		case ke.KeyIdentifier == "Enter":
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")
		case ke.KeyIdentifier == "Down":
			ke.PreventDefault()

			selected++
			updateResultSelection()
		case ke.KeyIdentifier == "Up":
			ke.PreventDefault()

			selected--
			updateResultSelection()
		}
	})

	document.(dom.HTMLDocument).Body().AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+0052" && ke.MetaKey: // Cmd+R.
			ke.PreventDefault()

			if display := overlay.(dom.HTMLElement).Style().GetPropertyValue("display"); display != "none" && display != "null" {
				document.GetElementByID("command").(*dom.HTMLInputElement).Select()
				break
			}

			document.GetElementByID("command").(*dom.HTMLInputElement).Value = ""

			{
				headers = document.(dom.HTMLDocument).Body().GetElementsByTagName("h3")

				baseHash = dom.GetWindow().Location().Hash
				baseX, baseY = dom.GetWindow().ScrollX(), dom.GetWindow().ScrollY()

				updateResults()
			}

			overlay.(dom.HTMLElement).Style().SetProperty("display", "initial", "")
			document.GetElementByID("results").Underlying().Set("scrollTop", 0) // TODO: Properly bring selected item into view.
			document.GetElementByID("command").(*dom.HTMLInputElement).Select()
		case ke.KeyIdentifier == "U+001B": // Escape.
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")
		}
	})
}

func updateResultSelection() {
	results := document.GetElementByID("results").(*dom.HTMLDivElement)

	if selected < 0 {
		selected = 0
	} else if selected > len(results.ChildNodes())-1 {
		selected = len(results.ChildNodes()) - 1
	}

	for i, node := range results.ChildNodes() {
		element := node.(dom.Element)
		element.Class().Remove("highlighted")

		if i == selected {
			element.Class().Add("highlighted")
			dom.GetWindow().Location().Hash = "#" + element.GetAttribute("data-id")

			if element.GetBoundingClientRect().Top <= results.GetBoundingClientRect().Top {
				node.Underlying().Call("scrollIntoView", true)
			} else if element.GetBoundingClientRect().Bottom >= results.GetBoundingClientRect().Bottom {
				node.Underlying().Call("scrollIntoView", false)
			}
		}
	}
}

func updateResults() {
	fmt.Println("updateResults")

	filter := document.GetElementByID("command").(*dom.HTMLInputElement).Value

	results := document.GetElementByID("results").(*dom.HTMLDivElement)

	// TODO: Preserve correctly.
	selected = 0

	results.SetInnerHTML("")
	var visibleIndex int
	for _, header := range headers {
		if filter != "" && !strings.Contains(strings.ToLower(header.TextContent()), strings.ToLower(filter)) {
			continue
		}

		element := document.CreateElement("div")
		element.Class().Add("entry")
		element.SetAttribute("data-id", header.ID())
		{
			entry := header.TextContent()
			index := strings.Index(strings.ToLower(entry), strings.ToLower(filter))
			element.SetInnerHTML(html.EscapeString(entry[:index]) + "<strong>" + html.EscapeString(entry[index:index+len(filter)]) + "</strong>" + html.EscapeString(entry[index+len(filter):]))
		}
		if visibleIndex == selected {
			element.Class().Add("highlighted")
			dom.GetWindow().Location().Hash = "#" + element.GetAttribute("data-id")
		}

		results.AppendChild(element)

		visibleIndex++
	}
}
