// +build js

package main

import (
	"html"
	"strings"

	"github.com/gopherjs/gopherjs/js"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var headers []dom.Element

var selected int

var baseHash string
var baseX, baseY int

var entryHeight float64
var entries []dom.Node
var manuallyPicked string

func main() {
	overlay := document.CreateElement("div").(*dom.HTMLDivElement)
	overlay.SetID("gts-overlay")

	container := document.CreateElement("div")
	overlay.AppendChild(container)
	container.SetOuterHTML(`<div><input id="gts-command"></input><div id="gts-results"></div></div>`)

	document.Body().AppendChild(overlay)

	command := document.GetElementByID("gts-command").(*dom.HTMLInputElement)
	results := document.GetElementByID("gts-results").(*dom.HTMLDivElement)

	command.AddEventListener("input", false, func(event dom.Event) {
		updateResults(false, nil)
	})

	/*mousedown := false
	results.AddEventListener("mousedown", false, func(event dom.Event) {
		mousedown = true

		command.Focus()

		me := event.(*dom.MouseEvent)
		y := (me.ClientY - results.GetBoundingClientRect().Top) + results.Underlying().Get("scrollTop").Int()
		selected = int(float64(y) / entryHeight)
		updateResultSelection()
	})
	results.AddEventListener("mouseup", false, func(event dom.Event) {
		mousedown = false
	})
	results.AddEventListener("mouseleave", false, func(event dom.Event) {
		mousedown = false
	})
	results.AddEventListener("mousemove", false, func(event dom.Event) {
		if !mousedown {
			return
		}

		command.Focus()

		me := event.(*dom.MouseEvent)
		y := (me.ClientY - results.GetBoundingClientRect().Top) + results.Underlying().Get("scrollTop").Int()
		selected = int(float64(y) / entryHeight)
		updateResultSelection()
	})*/
	results.AddEventListener("click", false, func(event dom.Event) {
		command.Focus()

		me := event.(*dom.MouseEvent)
		y := (me.ClientY - results.GetBoundingClientRect().Top) + results.Underlying().Get("scrollTop").Int()
		selected = int(float64(y) / entryHeight)
		updateResultSelection()
	})
	results.AddEventListener("dblclick", false, func(event dom.Event) {
		event.PreventDefault()

		hideOverlay(overlay)
	})

	overlay.AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+001B": // Escape.
			ke.PreventDefault()

			hideOverlay(overlay)

			if document.ActiveElement().IsEqualNode(command) {
				//dom.GetWindow().Location().Hash = baseHash
				js.Global.Get("window").Get("history").Call("replaceState", nil, nil, "#"+baseHash)
				dom.GetWindow().ScrollTo(baseX, baseY)
			}
		case ke.KeyIdentifier == "Enter":
			ke.PreventDefault()

			hideOverlay(overlay)
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

	document.Body().AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "U+0052" && ke.MetaKey: // Cmd+R.
			ke.PreventDefault()

			if display := overlay.Style().GetPropertyValue("display"); display != "none" && display != "null" {
				command.Select()
				break
			}

			command.Value = ""
			manuallyPicked = ""

			{
				headers = nil
				for _, header := range append(document.Body().GetElementsByTagName("h3"), document.Body().GetElementsByTagName("h4")...) {
					if header.ID() == "" {
						continue
					}
					headers = append(headers, header)
				}

				baseHash = strings.TrimPrefix(dom.GetWindow().Location().Hash, "#")
				baseX, baseY = dom.GetWindow().ScrollX(), dom.GetWindow().ScrollY()

				updateResults(true, overlay)
			}

			command.Select()
		case ke.KeyIdentifier == "U+001B": // Escape.
			ke.PreventDefault()

			hideOverlay(overlay)
		}
	})
}

var previouslyHighlightedHeader dom.HTMLElement

func hideOverlay(overlay dom.HTMLElement) {
	overlay.Style().SetProperty("display", "none", "")

	if previouslyHighlightedHeader != nil {
		previouslyHighlightedHeader.Class().Remove("highlighted")
		previouslyHighlightedHeader.Class().Add("highlighted-fade")
	}
}

var previouslySelected int

func updateResultSelection() {
	windowHalfHeight := dom.GetWindow().InnerHeight() * 2 / 5
	results := document.GetElementByID("gts-results").(*dom.HTMLDivElement)

	if selected < 0 {
		selected = 0
	} else if selected > len(entries)-1 {
		selected = len(entries) - 1
	}

	if selected == previouslySelected {
		return
	}

	entries[previouslySelected].(dom.Element).Class().Remove("gts-highlighted")
	if previouslyHighlightedHeader != nil {
		previouslyHighlightedHeader.Class().Remove("highlighted")
	}

	{
		element := entries[selected].(dom.Element)

		if element.GetBoundingClientRect().Top <= results.GetBoundingClientRect().Top {
			element.Underlying().Call("scrollIntoView", true)
		} else if element.GetBoundingClientRect().Bottom >= results.GetBoundingClientRect().Bottom {
			element.Underlying().Call("scrollIntoView", false)
		}

		element.Class().Add("gts-highlighted")
		//dom.GetWindow().Location().Hash = "#" + element.GetAttribute("data-id")
		//dom.GetWindow().History().ReplaceState(nil, nil, "#"+element.GetAttribute("data-id"))
		js.Global.Get("window").Get("history").Call("replaceState", nil, nil, "#"+element.GetAttribute("data-id"))
		target := document.GetElementByID(element.GetAttribute("data-id")).(dom.HTMLElement)
		target.Class().Add("highlighted")
		previouslyHighlightedHeader = target
		dom.GetWindow().ScrollTo(dom.GetWindow().ScrollX(), int(target.OffsetTop()+target.OffsetHeight())-windowHalfHeight)

		manuallyPicked = element.GetAttribute("data-id")
	}

	previouslySelected = selected
}

var initialSelected int

func updateResults(init bool, overlay dom.HTMLElement) {
	windowHalfHeight := dom.GetWindow().InnerHeight() * 2 / 5
	filter := document.GetElementByID("gts-command").(*dom.HTMLInputElement).Value

	results := document.GetElementByID("gts-results").(*dom.HTMLDivElement)

	var selectionPreserved = false

	results.SetInnerHTML("")
	var visibleIndex int
	for _, header := range headers {
		if filter != "" && !strings.Contains(strings.ToLower(header.TextContent()), strings.ToLower(filter)) {
			continue
		}

		element := document.CreateElement("div")
		element.Class().Add("gts-entry")
		element.SetAttribute("data-id", header.ID())
		{
			entry := header.TextContent()
			index := strings.Index(strings.ToLower(entry), strings.ToLower(filter))
			element.SetInnerHTML(html.EscapeString(entry[:index]) + "<strong>" + html.EscapeString(entry[index:index+len(filter)]) + "</strong>" + html.EscapeString(entry[index+len(filter):]))
		}
		if header.ID() == manuallyPicked {
			selectionPreserved = true

			selected = visibleIndex
			previouslySelected = visibleIndex
		}

		results.AppendChild(element)

		visibleIndex++
	}

	entries = results.ChildNodes()

	if !selectionPreserved {
		manuallyPicked = ""

		if init {
			// Find the nearest entry.
			for i := len(entries) - 1; i >= 0; i-- {
				element := entries[i].(dom.Element)
				header := document.GetElementByID(element.GetAttribute("data-id"))

				if header.GetBoundingClientRect().Top <= windowHalfHeight || i == 0 {
					selected = i
					previouslySelected = i

					initialSelected = i

					break
				}
			}
		} else {
			if filter == "" {
				selected = initialSelected
				previouslySelected = initialSelected
			} else {
				selected = 0
				previouslySelected = 0
			}
		}
	}

	if init {
		if previouslyHighlightedHeader != nil {
			previouslyHighlightedHeader.Class().Remove("highlighted-fade")
		}

		overlay.Style().SetProperty("display", "initial", "")
		entryHeight = results.FirstChild().(dom.Element).GetBoundingClientRect().Object.Get("height").Float()
	}

	if len(entries) > 0 {
		element := entries[selected].(dom.Element)

		if init {
			y := float64(selected) * entryHeight
			results.Underlying().Set("scrollTop", y-float64(results.GetBoundingClientRect().Height/2))
		} else {
			if element.GetBoundingClientRect().Top <= results.GetBoundingClientRect().Top {
				element.Underlying().Call("scrollIntoView", true)
			} else if element.GetBoundingClientRect().Bottom >= results.GetBoundingClientRect().Bottom {
				element.Underlying().Call("scrollIntoView", false)
			}
		}

		element.Class().Add("gts-highlighted")
		//dom.GetWindow().Location().Hash = "#" + element.GetAttribute("data-id")
		//dom.GetWindow().History().ReplaceState(nil, nil, "#"+element.GetAttribute("data-id"))
		js.Global.Get("window").Get("history").Call("replaceState", nil, nil, "#"+element.GetAttribute("data-id"))
		target := document.GetElementByID(element.GetAttribute("data-id")).(dom.HTMLElement)
		target.Class().Add("highlighted")
		previouslyHighlightedHeader = target
		dom.GetWindow().ScrollTo(dom.GetWindow().ScrollX(), int(target.OffsetTop()+target.OffsetHeight())-windowHalfHeight)
	}
}
