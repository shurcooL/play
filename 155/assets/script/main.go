// +build js

package main

import (
	"fmt"

	"github.com/gopherjs/eventsource"
	"github.com/gopherjs/gopherjs/js"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {}

func init() {
	document.AddEventListener("DOMContentLoaded", false, func(_ dom.Event) {
		go setup()
	})
}

func setup() {
	source := eventsource.New("/events")

	source.AddEventListener("message", false, func(event *js.Object) {
		fmt.Println(event.Get("origin").String())

		html := document.GetElementByID("out").InnerHTML()
		html += "<br>\"" + event.Get("data").String() + "\""
		document.GetElementByID("out").SetInnerHTML(html)
	})
}
