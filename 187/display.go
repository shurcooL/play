package main

import (
	"fmt"
	"html/template"

	"github.com/shurcooL/htmlg"
	ttt "github.com/shurcooL/play/187/tictactoe"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type Component interface {
	Render() []*html.Node
}

// page renders the entire page body.
type page struct {
	board     ttt.Board
	condition ttt.Condition
	players   [2]player
}

func (p page) Render() []*html.Node {
	return []*html.Node{
		style(
			`text-align: center; margin-top: 50px;`,
			htmlg.Div(
				// Player X.
				style(
					`display: inline-block;`,
					htmlg.Span(p.players[0].Render()...),
				),
				// Board.
				style(
					`display: inline-block; vertical-align: top; margin-left: 30px; margin-right: 30px;`,
					htmlg.Span(board{Board: p.board, Condition: p.condition}.Render()...),
				),
				// Player O.
				style(
					`display: inline-block;`,
					htmlg.Span(p.players[1].Render()...),
				),
			),
		),
		// Give credit to Renee French for the Go gopher.
		style(
			`text-align: right; font-style: italic; margin-top: 50px;`,
			htmlg.Div(htmlg.Text("Go gopher by Renee French.")),
		),
	}
}

// board renders a board.
type board struct {
	ttt.Board
	ttt.Condition
}

func (b board) Render() []*html.Node {
	table := &html.Node{Data: atom.Table.String(), Type: html.ElementNode}
	for row := 0; row < 3; row++ {
		tr := &html.Node{Data: atom.Tr.String(), Type: html.ElementNode}
		for _, cell := range b.Cells[3*row : 3*row+3] {
			td := &html.Node{Data: atom.Td.String(), Type: html.ElementNode}
			for _, n := range (boardCell{cell}.Render()) {
				td.AppendChild(n)
			}
			tr.AppendChild(td)
		}
		table.AppendChild(tr)
	}
	switch {
	case b.Condition == ttt.NotEnd:
		return []*html.Node{
			table,
		}
	default:
		return []*html.Node{
			table,
			style(
				`text-align: center; margin-top: 5px;`,
				htmlg.Div(htmlg.Text(b.Condition.String())),
			),
		}
	}
}

// boardCell renders a board cell.
type boardCell struct{ ttt.State }

func (c boardCell) Render() []*html.Node {
	return []*html.Node{style(
		`display: table-cell; width: 30px; height: 30px; text-align: center; vertical-align: middle; background-color: #f4f4f4;`,
		htmlg.Div(
			htmlg.Text(c.String()),
		),
	)}
}

// Render the player.
func (p player) Render() []*html.Node {
	switch imager, ok := p.Player.(ttt.Imager); {
	case ok:
		var imgStyle string
		switch p.Mark {
		case ttt.X:
			imgStyle = `height: 100px;`
		case ttt.O:
			imgStyle = `height: 100px; transform: scaleX(-1);`
		}
		return []*html.Node{
			style(
				imgStyle,
				img(imager.Image()),
			),
			htmlg.Div(htmlg.Text(fmt.Sprintf("%v (%v)", p.Name(), p.Mark))),
		}
	default:
		return []*html.Node{
			htmlg.Text(fmt.Sprintf("%v (%v)", p.Name(), p.Mark)),
		}
	}
}

// img returns an image element <img src="{{.src}}">.
func img(src template.URL) *html.Node {
	img := &html.Node{
		Type: html.ElementNode, Data: atom.Img.String(),
		Attr: []html.Attribute{{Key: atom.Src.String(), Val: string(src)}},
	}
	return img
}

func style(style string, n *html.Node) *html.Node {
	if n.Type != html.ElementNode {
		panic("invalid node type")
	}
	n.Attr = append(n.Attr, html.Attribute{Key: atom.Style.String(), Val: style})
	return n
}
