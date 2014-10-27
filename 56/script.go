// +build js

package main

import (
	"html"
	"strings"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var headers []dom.Element

var selected int

var baseHash string
var baseX, baseY int

var entryHeight float64
var entries []dom.Node

func main() {
	overlay := document.CreateElement("div")
	overlay.SetID("overlay")

	container := document.CreateElement("div")
	overlay.AppendChild(container)
	container.Underlying().Set("outerHTML", `<div><input id="command"></input><div id="results"></div></div>`)

	document.(dom.HTMLDocument).Body().AppendChild(overlay)

	command := document.GetElementByID("command").(*dom.HTMLInputElement)
	results := document.GetElementByID("results").(*dom.HTMLDivElement)

	command.AddEventListener("input", false, func(event dom.Event) {
		updateResults()
	})

	results.AddEventListener("click", false, func(event dom.Event) {
		command.Focus()

		me := event.(*dom.MouseEvent)
		y := (me.ClientY - results.GetBoundingClientRect().Top) + results.Underlying().Get("scrollTop").Int()
		selected = int(float64(y) / entryHeight)
		updateResultSelection()
	})

	overlay.AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+001B": // Escape.
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")

			if document.ActiveElement().Underlying() == command.Underlying() {
				dom.GetWindow().Location().Hash = baseHash
				dom.GetWindow().ScrollTo(baseX, baseY)
			}
		case ke.KeyIdentifier == "Enter":
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")
		case ke.KeyIdentifier == "Down":
			ke.PreventDefault()

			switch {
			case !ke.CtrlKey && !ke.AltKey && ke.MetaKey:
				selected = len(entries) - 1
			case ke.CtrlKey && ke.AltKey && !ke.MetaKey:
				results.Underlying().Set("scrollTop", results.Underlying().Get("scrollTop").Float()+entryHeight)
				return
			case !ke.CtrlKey && !ke.AltKey && !ke.MetaKey:
				selected++
			}
			updateResultSelection()
		case ke.KeyIdentifier == "Up":
			ke.PreventDefault()

			switch {
			case !ke.CtrlKey && !ke.AltKey && ke.MetaKey:
				selected = 0
			case ke.CtrlKey && ke.AltKey && !ke.MetaKey:
				results.Underlying().Set("scrollTop", results.Underlying().Get("scrollTop").Float()-entryHeight)
				return
			case !ke.CtrlKey && !ke.AltKey && !ke.MetaKey:
				selected--
			}
			updateResultSelection()
		}
	})

	document.(dom.HTMLDocument).Body().AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+0052" && ke.MetaKey: // Cmd+R.
			ke.PreventDefault()

			if display := overlay.(dom.HTMLElement).Style().GetPropertyValue("display"); display != "none" && display != "null" {
				command.Select()
				break
			}

			command.Value = ""

			{
				headers = document.(dom.HTMLDocument).Body().GetElementsByTagName("h3")

				baseHash = dom.GetWindow().Location().Hash
				baseX, baseY = dom.GetWindow().ScrollX(), dom.GetWindow().ScrollY()

				updateResults()
			}

			overlay.(dom.HTMLElement).Style().SetProperty("display", "initial", "")
			results.Underlying().Set("scrollTop", 0) // TODO: Properly bring selected item into view.
			command.Select()

			entryHeight = results.FirstChild().(dom.Element).GetBoundingClientRect().Object.Get("height").Float()
		case ke.KeyIdentifier == "U+001B": // Escape.
			ke.PreventDefault()

			overlay.(dom.HTMLElement).Style().SetProperty("display", "none", "")
		}
	})
}

var previouslySelected int

func updateResultSelection() {
	results := document.GetElementByID("results").(*dom.HTMLDivElement)
	_ = results

	if selected < 0 {
		selected = 0
	} else if selected > len(entries)-1 {
		selected = len(entries) - 1
	}

	if selected == previouslySelected {
		return
	}

	entries[previouslySelected].(dom.Element).Class().Remove("highlighted")

	{
		element := entries[selected].(dom.Element)

		if element.GetBoundingClientRect().Top <= results.GetBoundingClientRect().Top {
			element.Underlying().Call("scrollIntoView", true)
		} else if element.GetBoundingClientRect().Bottom >= results.GetBoundingClientRect().Bottom {
			element.Underlying().Call("scrollIntoView", false)
		}

		element.Class().Add("highlighted")
		dom.GetWindow().Location().Hash = "#" + element.GetAttribute("data-id")
	}

	previouslySelected = selected
}

func updateResults() {
	filter := document.GetElementByID("command").(*dom.HTMLInputElement).Value

	results := document.GetElementByID("results").(*dom.HTMLDivElement)

	// TODO: Preserve correctly.
	selected = 0
	previouslySelected = 0

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

	entries = results.ChildNodes()
}
