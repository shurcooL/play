package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
)

// Render returns rendered HTML for the given request or an error.
func (h handler) Render(req *http.Request) ([]*html.Node, error) {
	// Simple switch-based router for now. For a larger project, a more sophisticated router should be used.
	switch req.URL.Path {
	default:
		return []*html.Node{
			htmlg.Div(
				htmlg.Text(req.URL.Path),
			),
			htmlg.Div(
				htmlg.A("Home Link", "/home"),
			),
			htmlg.Div(
				htmlg.Strong("Some bold text."),
			),
			htmlg.Div(
				htmlg.Text("Some normal text."),
			),
		}, nil
	case "/redirect":
		return nil, Redirect{URL: "/home"}
	case "/notfound":
		return nil, os.ErrNotExist
	case "/permission":
		return nil, os.ErrPermission
	case "/internalservererror":
		return nil, fmt.Errorf("internal server error")
	}
}
