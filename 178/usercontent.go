package main

import (
	"fmt"
	"html/template"
	"net/http"
	"os"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// render returns rendered HTML for the given request or an error.
func render(user *user, req *http.Request) ([]*html.Node, error) {
	// Simple switch-based router for now. For a larger project, a more sophisticated router should be used.
	switch req.URL.Path {
	case "/":
		nodes := []*html.Node{
			htmlg.Div(
				htmlg.Strong("Home"),
			),
			htmlg.Div(htmlg.Text("-")),
		}
		switch user {
		case nil:
			nodes = append(nodes,
				htmlg.Div(
					htmlg.Text("Not logged in."),
					htmlg.Text(" "),
					htmlg.A("Login", "/login"),
				),
			)
		default:
			nodes = append(nodes,
				htmlg.Div(
					htmlg.Text(fmt.Sprintf("Logged in as: %q", user.Login)),
					htmlg.Text(" "),
					form("post", "/logout",
						input("submit", "", "Logout"),
					),
				),
			)
		}
		return nodes, nil
	case "/login":
		switch req.Method { // HACK.
		case "GET":
			return []*html.Node{
				htmlg.Div(
					form("post", "/login",
						htmlg.Text("Username:"),
						htmlg.Text(" "),
						input("text", "login", ""),
						htmlg.Text(" "),
						input("submit", "", "Login"),
					),
				),
			}, nil
		case "POST":
			return []*html.Node{
				htmlg.Div(
					htmlg.Text(fmt.Sprintf("Thanks for signing in: %q", user.Login)),
				),
			}, nil
		default:
			panic("unreachable")
		}
	default:
		return nil, &os.PathError{Op: "open", Path: req.URL.String(), Err: os.ErrNotExist}
	}
}

func input(typ, name, value string, nodes ...*html.Node) *html.Node {
	input := &html.Node{
		Type: html.ElementNode, Data: atom.Input.String(),
		Attr: []html.Attribute{
			{Key: atom.Type.String(), Val: typ},
			{Key: atom.Name.String(), Val: name},
			{Key: atom.Value.String(), Val: value},
		},
	}
	for _, n := range nodes {
		input.AppendChild(n)
	}
	return input
}

func form(method string, action template.URL, nodes ...*html.Node) *html.Node {
	form := &html.Node{
		Type: html.ElementNode, Data: atom.Form.String(),
		Attr: []html.Attribute{
			{Key: atom.Method.String(), Val: method},
			{Key: atom.Action.String(), Val: string(action)},
		},
	}
	for _, n := range nodes {
		form.AppendChild(n)
	}
	return form
}
