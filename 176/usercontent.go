package main

import (
	"html/template"
	"net/http"
	"os"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// render returns rendered HTML for the given request or an error.
func render(req *http.Request) ([]*html.Node, error) {
	// Simple switch-based router for now. For a larger project, a more sophisticated router should be used.
	query := req.URL.Query()
	switch req.URL.Path {
	case "/":
		return []*html.Node{
			htmlg.Div(
				htmlg.Strong("Home"),
			),
			htmlg.Div(htmlg.Text("-")),
			htmlg.Div(
				htmlg.Text("Foo"),
			),
			htmlg.Div(
				htmlg.A("Issues", "/issues"),
			),
			htmlg.Div(
				htmlg.Text("Bar"),
			),
		}, nil
	case "/issues":
		switch query.Get("state") {
		case "":
			return []*html.Node{
				htmlg.Div(
					htmlg.SpanClass("something", htmlg.Strong("Open")),
					htmlg.Text(" "),
					htmlg.SpanClass("something", a("/issues?state=closed", htmlg.Text("Closed"))),
				),
				htmlg.Div(htmlg.Text("-")),
				htmlg.Div(
					htmlg.A("Issue 1", "/issues/1"),
				),
				htmlg.Div(
					htmlg.A("Issue 2", "/issues/2"),
				),
				htmlg.Div(
					htmlg.A("Issue 3", "/issues/3"),
				),
			}, nil
		case "closed":
			return []*html.Node{
				htmlg.Div(
					htmlg.SpanClass("something", a("/issues", htmlg.Text("Open"))),
					htmlg.Text(" "),
					htmlg.SpanClass("something", htmlg.Strong("Closed")),
				),
				htmlg.Div(htmlg.Text("-")),
				htmlg.Div(
					htmlg.A("Issue 4", "/issues/4"),
				),
				htmlg.Div(
					htmlg.A("Issue 5", "/issues/5"),
				),
			}, nil
		}
	case "/issues/1":
		return []*html.Node{htmlg.Div(htmlg.Text("Issue 1")), htmlg.Div(htmlg.Text("Open")), htmlg.Div(htmlg.Text("blah blah blah"))}, nil
	case "/issues/2":
		return []*html.Node{htmlg.Div(htmlg.Text("Issue 2")), htmlg.Div(htmlg.Text("Open")), htmlg.Div(htmlg.Text("blah blah blah"))}, nil
	case "/issues/3":
		return []*html.Node{htmlg.Div(htmlg.Text("Issue 3")), htmlg.Div(htmlg.Text("Open")), htmlg.Div(htmlg.Text("blah blah blah"))}, nil
	case "/issues/4":
		return []*html.Node{htmlg.Div(htmlg.Text("Issue 4")), htmlg.Div(htmlg.Text("Closed")), htmlg.Div(htmlg.Text("blah blah blah"))}, nil
	case "/issues/5":
		return []*html.Node{htmlg.Div(htmlg.Text("Issue 5")), htmlg.Div(htmlg.Text("Closed")), htmlg.Div(htmlg.Text("blah blah blah"))}, nil
	}
	return nil, &os.PathError{Op: "open", Path: req.URL.String(), Err: os.ErrNotExist}
}

func a(href template.URL, nodes ...*html.Node) *html.Node {
	a := &html.Node{
		Type: html.ElementNode, Data: atom.A.String(),
		Attr: []html.Attribute{{Key: atom.Href.String(), Val: string(href)}},
	}
	htmlg.AppendChildren(a, nodes...)
	return a
}
