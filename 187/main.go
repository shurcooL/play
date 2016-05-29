// Play with creating an AI player of tic-tac-toe.
//
// It's just for fun, a learning exercise.
package main

import (
	"fmt"
	"runtime"
	"time"

	"github.com/shurcooL/htmlg"
	"github.com/shurcooL/play/187/player/random"
	ttt "github.com/shurcooL/play/187/tictactoe"
	"golang.org/x/net/context"
	"honnef.co/go/js/dom"
)

type player struct {
	ttt.Player
	Mark ttt.State // Mark is either X or O.
}

func main() {
	switch runtime.GOARCH {
	default:
		run()
	case "js":
		var document = dom.GetWindow().Document().(dom.HTMLDocument)
		document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
			go run()
		})
	}
}

func run() {
	playerX := player{
		Player: random.NewPlayer(),
		Mark:   ttt.X,
	}
	playerO := player{
		Player: random.NewPlayer(),
		Mark:   ttt.O,
	}

	fmt.Printf("%v (X) vs %v (O)\n", playerX.Name(), playerO.Name())
	if runtime.GOARCH == "js" {
		var document = dom.GetWindow().Document().(dom.HTMLDocument)
		document.SetTitle(fmt.Sprintf("%v (X) vs %v (O)", playerX.Name(), playerO.Name()))
	}

	condition, err := playGame([2]player{playerX, playerO})
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println()
	fmt.Println(condition)
	if runtime.GOARCH == "js" {
		var document = dom.GetWindow().Document().(dom.HTMLDocument)
		div := htmlg.Div(htmlg.Text(condition.String()))
		document.Body().SetInnerHTML(document.Body().InnerHTML() + string(htmlg.Render(div)))
	}
}

// players[0] always goes first.
func playGame(players [2]player) (ttt.Condition, error) {
	var b ttt.Board // Start with an empty board.

	fmt.Println()
	fmt.Println(b)
	if runtime.GOARCH == "js" {
		var document = dom.GetWindow().Document().(dom.HTMLDocument)
		document.Body().SetInnerHTML(string(htmlg.Render(board{b}.Render()...)))
	}

	for i := 0; ; i++ {
		err := playerTurn(&b, players[i%2])
		if err != nil {
			return 0, err
		}

		fmt.Println()
		fmt.Println(b)
		if runtime.GOARCH == "js" {
			var document = dom.GetWindow().Document().(dom.HTMLDocument)
			document.Body().SetInnerHTML(string(htmlg.Render(board{b}.Render()...)))
		}

		if condition := b.Condition(); condition != ttt.NotEnd {
			return condition, nil
		}
	}
}

func playerTurn(b *ttt.Board, player player) error {
	const timePerMove = 3 * time.Second

	ctx, cancel := context.WithTimeout(context.Background(), timePerMove)
	move, err := player.Play(ctx, *b)
	cancel()
	if err != nil {
		return fmt.Errorf("player %v failed to make a move: %v", player.Mark, err)
	}
	if err := move.Validate(); err != nil {
		return fmt.Errorf("player %v made a move that isn't valid: %v", player.Mark, err)
	}

	err = b.Apply(move, player.Mark)
	if err != nil {
		return fmt.Errorf("player %v made a move that isn't legal: %v", player.Mark, err)
	}
	return nil
}

func mock() {
	b := ttt.Board{
		Cells: [9]ttt.State{
			ttt.F, ttt.X, ttt.F,
			ttt.F, ttt.F, ttt.F,
			ttt.O, ttt.F, ttt.F,
		},
	}

	fmt.Println(b)
	fmt.Println()
	fmt.Println(htmlg.Render(state{b.Cells[1]}.Render()...))
	fmt.Println()
	fmt.Println(htmlg.Render(board{b}.Render()...))

	if runtime.GOARCH == "js" {
		var document = dom.GetWindow().Document().(dom.HTMLDocument)
		document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
			document.Body().SetInnerHTML(string(htmlg.Render(board{b}.Render()...)))
		})
	}
}
