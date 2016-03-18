// Play with creating an AI player of tic-tac-toe.
//
// It's just for fun, a learning exercise.
package main

import (
	"bytes"
	"fmt"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/context"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Player of tic-tac-toe.
type Player interface {
	// Play takes a tic-tac-toe board b and returns the next move.
	// ctx is expected to have a deadline set, and Play may take time
	// to "think" until deadline is reached before returning.
	Play(ctx context.Context, b Board) (Move, error)
}

// Move is the board cell index where to place one's mark, a value in range [0, 9).
type Move int

type State uint8

const (
	F State = iota // Free.
	X
	O
)

func (s State) String() string {
	switch s {
	case F:
		return " "
	case X:
		return "X"
	case O:
		return "O"
	default:
		panic("unreachable")
	}
}

func (s State) Render() []*html.Node {
	return []*html.Node{style(
		`display: table-cell; width: 20px; height: 20px; text-align: center; vertical-align: middle; background-color: #f4f4f4;`,
		htmlg.Div(
			htmlg.Text(s.String()),
		),
	)}
}

type Board struct {
	// Cells is a 3x3 matrix in row major order.
	//
	// Cells[3*r + c] is the cell in the r'th row and c'th column.
	Cells [9]State
}

func (b Board) String() string {
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "%v│%v│%v\n", b.Cells[0], b.Cells[1], b.Cells[2])
	fmt.Fprintln(&buf, "─┼─┼─")
	fmt.Fprintf(&buf, "%v│%v│%v\n", b.Cells[3], b.Cells[4], b.Cells[5])
	fmt.Fprintln(&buf, "─┼─┼─")
	fmt.Fprintf(&buf, "%v│%v│%v\n", b.Cells[6], b.Cells[7], b.Cells[8])
	return buf.String()
}

func main() {
	b := Board{
		Cells: [9]State{
			F, X, F,
			F, F, F,
			O, F, F,
		},
	}

	fmt.Println(b)

	fmt.Println(htmlg.Render(b.Cells[1].Render()...))
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
