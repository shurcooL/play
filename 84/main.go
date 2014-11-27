package main

import (
	"os"
	"strings"

	"github.com/shurcooL/go-goon"
	"golang.org/x/net/html"
)

func parseNodes(s string) []*html.Node {
	tree, err := html.Parse(strings.NewReader(`<html><head></head><body></body></html>`))
	if err != nil {
		panic(err)
	}
	body := tree.FirstChild.LastChild

	ns, err := html.ParseFragment(strings.NewReader(s), body)
	if err != nil {
		panic(err)
	}

	return ns
}

func foo1() (*html.Node, error) {
	n := &html.Node{
		Type: html.ElementNode,
		Data: "a",
		FirstChild: &html.Node{
			Type: html.TextNode,
			Data: "Hi.",
		},
		Attr: []html.Attribute{{Key: "href", Val: "google.com"}},
	}
	return n, nil
}

func foo2() (*html.Node, error) {
	ns := parseNodes(`<a href="google.com">Hi.</a>`)

	goon.DumpExpr(ns[0])

	return ns[0], nil
}

func main() {
	n, err := foo1()
	if err != nil {
		panic(err)
	}

	err = html.Render(os.Stdout, n)
	if err != nil {
		panic(err)
	}
}
