package main

import (
	"sync"
	"time"
)

var _ = time.Sleep

func main() {
	x := 2
	y := 3

	var w sync.WaitGroup
	w.Add(2)
	inc_x := func() { time.Sleep(7001); println("x_inc"); x = x + 1; w.Done() }
	inc_y := func() { time.Sleep(1); println("y_inc"); y = y + 1; w.Done() }

	go inc_x()
	go inc_y()

	w.Wait()
	println(x + y)
}