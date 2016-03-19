// Package tictactoe defines the game of tic-tac-toe.
package tictactoe

import (
	"bytes"
	"fmt"

	"golang.org/x/net/context"
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

// State of a board cell.
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

// Board for tic-tac-toe.
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
