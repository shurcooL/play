// Package random implements a random player of tic-tac-toe.
package random

import (
	"html/template"
	"math/rand"
	"time"

	"github.com/shurcooL/tictactoe"
	"golang.org/x/net/context"
)

// NewPlayer creates a random player of tic-tac-toe.
func NewPlayer() (tictactoe.Player, error) {
	gophers := []template.URL{
		"https://raw.githubusercontent.com/shurcooL/play/master/187/player/random/gopher-0.png",
		"https://raw.githubusercontent.com/shurcooL/play/master/187/player/random/gopher-1.png",
		"https://raw.githubusercontent.com/shurcooL/play/master/187/player/random/gopher-2.png",
	}
	rand := rand.New(rand.NewSource(time.Now().UnixNano()))
	return player{
		rand:  rand,
		image: gophers[rand.Intn(len(gophers))],
	}, nil
}

// player is a random player of tic-tac-toe.
type player struct {
	rand  *rand.Rand
	image template.URL
}

func (p player) Name() string {
	return "Random Player"
}

func (p player) Image() template.URL {
	return p.image
}

// Play takes a tic-tac-toe board b and returns the next move.
// ctx is expected to have a deadline set, and Play may take time
// to "think" until deadline is reached before returning.
func (p player) Play(ctx context.Context, b tictactoe.Board) (tictactoe.Move, error) {
	var legalMoves []tictactoe.Move
	for i, cell := range b.Cells {
		if cell != tictactoe.F {
			continue
		}
		legalMoves = append(legalMoves, tictactoe.Move(i))
	}

	if deadline, ok := ctx.Deadline(); ok {
		time.Sleep(deadline.Sub(time.Now()) - 1*time.Second)
	} else {
		time.Sleep(2 * time.Second)
	}

	return legalMoves[p.rand.Intn(len(legalMoves))], nil
}
