// +build js

// Learn if it's possible to detect when a web window is focused.
//
// It is possible!
//
// Also see https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API for page visibility API.
package main

import (
	"fmt"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
		setup()
	})
}

func setup() {
	dom.GetWindow().AddEventListener("focus", false, func(dom.Event) {
		fmt.Println("Window focused!")
	})
}
