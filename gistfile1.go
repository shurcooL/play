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

	x++; println("x++")
	y++; println("y++")

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

func main() {
	approach2()
}