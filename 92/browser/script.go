// +build js

package main

import (
	"honnef.co/go/js/dom"

	"github.com/shurcooL/play/92"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	text := document.CreateElement("div")
	text.SetTextContent(app.Frame)
	document.Body().AppendChild(text)
}
