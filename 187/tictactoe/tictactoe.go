// Package tictactoe defines the game of tic-tac-toe.
package tictactoe

import (
	"bytes"
	"fmt"
	"html/template"

	"golang.org/x/net/context"
)

// Player of tic-tac-toe.
type Player interface {
	// Name of player.
	Name() string

	// Play takes a tic-tac-toe board b and returns the next move.
	// ctx is expected to have a deadline set, and Play may take time
	// to "think" until deadline is reached before returning.
	Play(ctx context.Context, b Board) (Move, error)
}

// Imager is an optional interface implemented by players
// that have an image that represents them.
type Imager interface {
	// Image returns the URL of the player's image.
	// Optimal size is 100 by 100 pixels (or higher for high DPI screens).
	Image() template.URL
}

// Move is the board cell index where to place one's mark, a value in range [0, 9).
type Move int

// Validate reports if the move is valid. It may not be legal depending on the board configuration.
func (m Move) Validate() error {
	if valid := m >= 0 && m < 9; !valid {
		return fmt.Errorf("move %v is out of range [0, 9)", m)
	}
	return nil
}

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

// Condition of the board configuration.
type Condition uint8

const (
	NotEnd Condition = iota
	XWon
	OWon
	Tie
)

func (c Condition) String() string {
	switch c {
	case NotEnd:
		return "in progress"
	case XWon:
		return "player X won"
	case OWon:
		return "player O won"
	case Tie:
		return "tie"
	default:
		panic("unreachable")
	}
}

// Board for tic-tac-toe.
type Board struct {
	// Cells is a 3x3 matrix in row major order.
	// Cells[3*r + c] is the cell in the r'th row and c'th column.
	// Move m will affect Cells[m].
	Cells [9]State
}

// Apply a valid move to this board. Mark is either X or O.
// If it's not a legal move, the board is not modified and the error is returned.
func (b *Board) Apply(move Move, mark State) error {
	// Check if the move is legal for this board configuration.
	if b.Cells[move] != F {
		return fmt.Errorf("that cell is already occupied")
	}

	b.Cells[move] = mark
	return nil
}

func (b Board) Condition() Condition {
	var (
		x = (b.Cells[0] == X && b.Cells[1] == X && b.Cells[2] == X) || // Check all rows.
			(b.Cells[3] == X && b.Cells[4] == X && b.Cells[5] == X) ||
			(b.Cells[6] == X && b.Cells[7] == X && b.Cells[8] == X) ||

			(b.Cells[0] == X && b.Cells[3] == X && b.Cells[6] == X) || // Check all columns.
			(b.Cells[1] == X && b.Cells[4] == X && b.Cells[7] == X) ||
			(b.Cells[2] == X && b.Cells[5] == X && b.Cells[8] == X) ||

			(b.Cells[0] == X && b.Cells[4] == X && b.Cells[8] == X) || // Check all diagonals.
			(b.Cells[2] == X && b.Cells[4] == X && b.Cells[6] == X)

		o = (b.Cells[0] == O && b.Cells[1] == O && b.Cells[2] == O) || // Check all rows.
			(b.Cells[3] == O && b.Cells[4] == O && b.Cells[5] == O) ||
			(b.Cells[6] == O && b.Cells[7] == O && b.Cells[8] == O) ||

			(b.Cells[0] == O && b.Cells[3] == O && b.Cells[6] == O) || // Check all columns.
			(b.Cells[1] == O && b.Cells[4] == O && b.Cells[7] == O) ||
			(b.Cells[2] == O && b.Cells[5] == O && b.Cells[8] == O) ||

			(b.Cells[0] == O && b.Cells[4] == O && b.Cells[8] == O) || // Check all diagonals.
			(b.Cells[2] == O && b.Cells[4] == O && b.Cells[6] == O)

		freeCellsLeft = b.Cells[0] == F || b.Cells[1] == F || b.Cells[2] == F ||
			b.Cells[3] == F || b.Cells[4] == F || b.Cells[5] == F ||
			b.Cells[6] == F || b.Cells[7] == F || b.Cells[8] == F
	)

	switch {
	case x && !o:
		return XWon
	case o && !x:
		return OWon
	case !freeCellsLeft:
		return Tie
	default:
		return NotEnd
	}
}

func (b Board) String() string {
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "%v│%v│%v\n", b.Cells[0], b.Cells[1], b.Cells[2])
	fmt.Fprintln(&buf, "─┼─┼─")
	fmt.Fprintf(&buf, "%v│%v│%v\n", b.Cells[3], b.Cells[4], b.Cells[5])
	fmt.Fprintln(&buf, "─┼─┼─")
	fmt.Fprintf(&buf, "%v│%v│%v", b.Cells[6], b.Cells[7], b.Cells[8])
	return buf.String()
}
