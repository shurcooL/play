// +build js

package main

import (
	"honnef.co/go/js/dom"
	"honnef.co/go/js/xhr"
)

var document = dom.GetWindow().Document()

var input = document.GetElementByID("input").(*dom.HTMLInputElement)
var output = document.GetElementByID("output").(*dom.HTMLTextAreaElement)

func main() {
	input.AddEventListener("keydown", false, func(event dom.Event) {
		switch ke := event.(*dom.KeyboardEvent); {
		case ke.KeyIdentifier == "Enter":
			ke.PreventDefault()

			go func() {
				data, err := xhr.Send("GET", input.Value, nil)
				if err != nil {
					output.SetTextContent("### Error ###\n\n" + err.Error())
					return
				}
				output.SetTextContent(data)
			}()
		}
	})
}
