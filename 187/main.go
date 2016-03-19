// Play with creating an AI player of tic-tac-toe.
//
// It's just for fun, a learning exercise.
package main

import (
	"fmt"

	"github.com/shurcooL/htmlg"
	ttt "github.com/shurcooL/play/187/tictactoe"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type state struct{ ttt.State }

func (s state) Render() []*html.Node {
	return []*html.Node{style(
		`display: table-cell; width: 20px; height: 20px; text-align: center; vertical-align: middle; background-color: #f4f4f4;`,
		htmlg.Div(
			htmlg.Text(s.String()),
		),
	)}
}

func main() {
	b := ttt.Board{
		Cells: [9]ttt.State{
			ttt.F, ttt.X, ttt.F,
			ttt.F, ttt.F, ttt.F,
			ttt.O, ttt.F, ttt.F,
		},
	}

	fmt.Println(b)

	fmt.Println(htmlg.Render(state{b.Cells[1]}.Render()...))
}

type Component interface {
	Render() []*html.Node
}

func style(style string, n *html.Node) *html.Node {
	if n.Type != html.ElementNode {
		panic("invalid node type")
	}
	n.Attr = append(n.Attr, html.Attribute{Key: atom.Style.String(), Val: style})
	return n
}
