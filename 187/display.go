package main

import (
	"github.com/shurcooL/htmlg"
	ttt "github.com/shurcooL/play/187/tictactoe"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type Component interface {
	Render() []*html.Node
}

type state struct{ ttt.State }

func (s state) Render() []*html.Node {
	return []*html.Node{style(
		`display: table-cell; width: 20px; height: 20px; text-align: center; vertical-align: middle; background-color: #f4f4f4;`,
		htmlg.Div(
			htmlg.Text(s.String()),
		),
	)}
}

type board struct{ ttt.Board }

func (b board) Render() []*html.Node {
	table := &html.Node{Data: atom.Table.String(), Type: html.ElementNode}
	for row := 0; row < 3; row++ {
		tr := &html.Node{Data: atom.Tr.String(), Type: html.ElementNode}
		for _, cell := range b.Cells[3*row : 3*row+3] {
			td := &html.Node{Data: atom.Td.String(), Type: html.ElementNode}
			for _, n := range (state{cell}.Render()) {
				td.AppendChild(n)
			}
			tr.AppendChild(td)
		}
		table.AppendChild(tr)
	}
	return []*html.Node{table}
}

func style(style string, n *html.Node) *html.Node {
	if n.Type != html.ElementNode {
		panic("invalid node type")
	}
	n.Attr = append(n.Attr, html.Attribute{Key: atom.Style.String(), Val: style})
	return n
}
