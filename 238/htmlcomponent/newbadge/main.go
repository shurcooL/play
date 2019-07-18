package main

import (
	"bytes"
	"fmt"
	"log"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	switch readyState := document.ReadyState(); readyState {
	case "loading":
		document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
			go setup()
		})
	case "interactive", "complete":
		setup()
	default:
		panic(fmt.Errorf("internal error: unexpected document.ReadyState value: %v", readyState))
	}
}

func setup() {
	style := document.CreateElement("style").(*dom.HTMLStyleElement)
	style.SetAttribute("type", "text/css")
	style.SetTextContent(css)
	document.Head().AppendChild(style)

	ns := []*html.Node{
		htmlg.Text("import/path"),
	}
	if true {
		new := &html.Node{
			Type: html.ElementNode, Data: atom.Span.String(),
			Attr: []html.Attribute{{Key: atom.Style.String(), Val: `font-size: 10px;
vertical-align: middle;
color: #e85d00;
padding: 1px 4px;
border: 1px solid #e85d00;
border-radius: 3px;
margin-left: 6px;`}},
			FirstChild: htmlg.Text("New"),
		}
		ns = append(ns, new)
	}

	var buf bytes.Buffer
	for _, n := range ns {
		err := html.Render(&buf, n)
		if err != nil {
			log.Println(err)
			return
		}
	}
	document.Body().SetInnerHTML(buf.String())
}

const css = `
body {
	margin: 20px;
	font-family: Go;
	font-size: 14px;
}
`
