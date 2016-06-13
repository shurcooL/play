package random_test

import (
	"testing"
	"time"

	"github.com/shurcooL/play/187/player/random"
	ttt "github.com/shurcooL/tictactoe"
	"golang.org/x/net/context"
)

var _ ttt.Player = random.NewPlayer()

func Test(t *testing.T) {
	// This board has only one free cell, so there's only one legal move.
	b := ttt.Board{
		Cells: [9]ttt.State{
			ttt.X, ttt.X, ttt.O,
			ttt.O, ttt.F, ttt.X,
			ttt.O, ttt.X, ttt.O,
		},
	}
	want := ttt.Move(4)

	player := random.NewPlayer()
	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	move, err := player.Play(ctx, b)
	cancel()
	if err != nil {
		t.Fatal(err)
	}
	if move != want {
		t.Errorf("not the expected move: %v", move)
	}
}
