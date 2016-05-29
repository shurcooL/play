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

	fmt.Println("Tic Tac Toe")
	fmt.Println()
	fmt.Printf("%v (X) vs %v (O)\n", playerX.Name(), playerO.Name())
	if runtime.GOARCH == "js" {
		var document = dom.GetWindow().Document().(dom.HTMLDocument)
		document.SetTitle("Tic Tac Toe")
	}

	condition, err := playGame([2]player{playerX, playerO})
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println()
	fmt.Println(condition)
}

// players[0] always goes first.
func playGame(players [2]player) (ttt.Condition, error) {
	var board ttt.Board // Start with an empty board.

	fmt.Println()
	fmt.Println(board)
	if runtime.GOARCH == "js" {
		var document = dom.GetWindow().Document().(dom.HTMLDocument)
		document.Body().SetInnerHTML(string(htmlg.Render(page{board: board, players: players}.Render()...)))
	}

	for i := 0; ; i++ {
		err := playerTurn(&board, players[i%2])
		if err != nil {
			return 0, err
		}
		condition := board.Condition()

		fmt.Println()
		fmt.Println(board)
		if runtime.GOARCH == "js" {
			var document = dom.GetWindow().Document().(dom.HTMLDocument)
			document.Body().SetInnerHTML(string(htmlg.Render(page{board: board, condition: condition, players: players}.Render()...)))
		}

		if condition != ttt.NotEnd {
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
