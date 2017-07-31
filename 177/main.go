// Play with an experimental web server that generates HTML pages in a type safe way
// on the frontend only.
package main

import (
	"html/template"
	"net/http"

	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/go/gopherjs_http/jsutil"
	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	js.Global.Set("Go", jsutil.Wrap(Go))

	document.AddEventListener("DOMContentLoaded", false, func(_ dom.Event) {
		setup()
	})
}

func setup() {
	err := renderBody("/issues")
	if err != nil {
		panic(err)
	}

	dom.GetWindow().AddEventListener("popstate", false, func(event dom.Event) {
		err := renderBody(dom.GetWindow().Location().Pathname + dom.GetWindow().Location().Search) // TODO: Preserve hash.
		if err != nil {
			panic(err)
		}
	})
}

func Go(this dom.HTMLElement, event dom.Event) {
	event.PreventDefault()

	// TODO: dom.GetWindow().History().PushState(...)
	js.Global.Get("window").Get("history").Call("pushState", nil, nil, this.(*dom.HTMLAnchorElement).Href) // TODO: Preserve query, hash? Maybe Href already contains some of that?

	err := renderBody(this.(*dom.HTMLAnchorElement).Href)
	if err != nil {
		panic(err)
	}
}

func renderBody(url string) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	nodes, err := render(req)
	if err != nil {
		return err
	}
	document.Body().SetInnerHTML(htmlg.Render(nodes...))
	return nil
}

func a(href template.URL, nodes ...*html.Node) *html.Node {
	a := &html.Node{
		Type: html.ElementNode, Data: atom.A.String(),
		Attr: []html.Attribute{
			{Key: atom.Href.String(), Val: string(href)},
			{Key: atom.Onclick.String(), Val: "Go(this, event)"},
		},
	}
	htmlg.AppendChildren(a, nodes...)
	return a
}
