// Looking at dependencies in typical sequential code.
package main

import (
	"sync"
	"time"
)

var _ = time.Sleep
var _ sync.WaitGroup

func approach1() {
	x := 1
	y := 2

	time.Sleep(1); x++; println("x++")
	time.Sleep(1); y++; println("y++")

	print(x + y)
}

func approach2() {
	x := 1
	y := 2

	var w sync.WaitGroup
	w.Add(2)
	go func() { time.Sleep(12001); x++; println("x++"); w.Done() }()
	go func() { time.Sleep(1); y++; println("y++"); w.Done() }()
	w.Wait()

	print(x + y)
}

func approach3() {
	x := 1
	y := 2

	cx := make(chan int)
	cy := make(chan int)

	go func(x int) {
		time.Sleep(12001); x++; println("x++")
		cx <- x
	}(x)
	go func(y int) {
		time.Sleep(1); y++; println("y++")
		cy <- y
	}(y)

	print(<-cx + <-cy)
}

func main() {
	approach3()
}