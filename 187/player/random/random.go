// Package random implements a random player of tic-tac-toe.
package random

import (
	"math/rand"
	"time"

	"github.com/shurcooL/play/187/tictactoe"
	"golang.org/x/net/context"
)

// NewPlayer creates a random player of tic-tac-toe.
func NewPlayer() tictactoe.Player {
	return player{
		rand: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// player is a random player of tic-tac-toe.
type player struct {
	rand *rand.Rand
}

func (p player) Name() string {
	return "Random Player"
}

// Play takes a tic-tac-toe board b and returns the next move.
// ctx is expected to have a deadline set, and Play may take time
// to "think" until deadline is reached before returning.
func (p player) Play(ctx context.Context, b tictactoe.Board) (tictactoe.Move, error) {
	var validMoves []tictactoe.Move
	for i, cell := range b.Cells {
		if cell != tictactoe.F {
			continue
		}
		validMoves = append(validMoves, tictactoe.Move(i))
	}

	if deadline, ok := ctx.Deadline(); ok {
		time.Sleep(deadline.Sub(time.Now()))
	} else {
		time.Sleep(3 * time.Second)
	}

	return validMoves[p.rand.Intn(len(validMoves))], nil
}
