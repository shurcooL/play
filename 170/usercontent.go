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
	case "/notfound.html":
		return nil, os.ErrNotExist
	case "/permission.html":
		return nil, os.ErrPermission
	case "/internalservererror.html":
		return nil, fmt.Errorf("internal server error")
	default:
		return []*html.Node{
			htmlg.Div(
				htmlg.Text(req.URL.Path),
			),
			htmlg.Div(
				htmlg.A("Home Link", "/home.html"),
			),
			htmlg.Div(
				htmlg.Strong(h.Message),
			),
		}, nil
	}
}
